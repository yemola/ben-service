const express = require('express');
const router = express.Router();
const { connectToDatabase } = require('./dbconnection');
const sql = require('mssql');
const ExcelJS = require('exceljs');
const calculateBusinessTime = require('../utility/businessHours');

router.get('/reviewers-activities', async (req, res) => {
    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const result = await pool.request()
            .query(`SELECT prev_reviewer AS reviewer, COUNT(*) AS actions
                        FROM ApplicationLog
                        WHERE status_id != 2
                        GROUP BY prev_reviewer
                        ORDER BY actions DESC`);

        const data = await result.recordset;

        res.status(200).json(data);

    } catch (error) {
        console.log('reviewersFetchError: ', error);
    } finally {
        // Close the connection
        await sql.close();
    }
});

router.get('/reviews-per-appl', async (req, res) => {
    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const result = await pool.request()
            .query(`SELECT u.name AS reviewerName, COUNT(*) AS reviewsPerAppl
                        FROM Statuses s
                        JOIN Users u ON s.taskOwner_group_id = u.id
                        WHERE s.taskOwner_group_id IS NOT NULL AND s.id % 2 = 0
                        GROUP BY u.name
                        ORDER BY reviewsPerAppl DESC;`);

        const data = await result.recordset;

        res.status(200).json(data);

    } catch (error) {
        console.log('reviewsPerApplFetchError: ', error);
    } finally {
        // Close the connection
        await sql.close();
    }
});

router.get('/review-flow', async (req, res) => {
    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const result = await pool.request()
            .query(`SELECT s.id, s.status_name AS status, u.name AS reviewer
                        FROM Statuses s
                        JOIN Users u ON s.taskOwner_group_id = u.id
                        WHERE s.taskOwner_group_id IS NOT NULL AND s.id % 2 = 0
                        ORDER BY s.id;`);

        const data = await result.recordset;

        res.status(200).json(data);

    } catch (error) {
        console.log('reviewsPerApplFetchError: ', error);
    } finally {
        // Close the connection
        await sql.close();
    }
});

router.get('/agents-activities', async (req, res) => {
    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const result = await pool.request()
            .query(`
                SELECT 
                    al.prev_reviewer AS agentName,
                    COUNT(*) AS applSubmitted
                FROM BenefitTracker_v2.dbo.Applications a
                JOIN (
                    SELECT appl_id, prev_reviewer
                    FROM (
                        SELECT 
                            appl_id,
                            prev_reviewer,
                            ROW_NUMBER() OVER (PARTITION BY appl_id ORDER BY timestamp ASC) AS rn
                        FROM BenefitTracker_v2.dbo.ApplicationLog
                        WHERE status_id = 2
                    ) ranked
                    WHERE rn = 1
                ) al ON al.appl_id = a.id
                GROUP BY al.prev_reviewer
                ORDER BY applSubmitted DESC;
            
            `);

        // SELECT agentName, COUNT(*) AS applSubmitted
        //     FROM (
        //         SELECT DISTINCT appl_id, prev_reviewer AS agentName
        //         FROM BenefitTracker_v2.dbo.ApplicationLog
        //         WHERE status_id = 2
        //     ) AS DistinctSubmissions
        //     GROUP BY agentName
        //     ORDER BY applSubmitted DESC;
        // SELECT prev_reviewer AS agentName, COUNT(*) AS applSubmitted
        //                 FROM BenefitTracker_v2.dbo.ApplicationLog
        //                 WHERE status_id = 2
        //                 GROUP BY prev_reviewer
        //                 ORDER BY ApplSubmitted DESC

        const data = await result.recordset;

        res.status(200).json(data);

    } catch (error) {
        console.log('agentsFetchError: ', error);
    } finally {
        // Close the connection
        await sql.close();
    }
});

router.get('/processing-time', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        const pool = await connectToDatabase('BenefitTracker_v2');

        const result = await pool.request()
            .input('startDate', sql.DateTime, startDate)
            .input('endDate', sql.DateTime, endDate)
            .query(`
                ;WITH Cur AS (
                      SELECT
                        al.log_id,
                        al.appl_id,
                        al.applicant_name,
                        al.applicant_rsa_pin,
                        al.action,
                        al.prev_reviewer,
                        al.comment,
                        al.timestamp,
                        al.benefit_type
                      FROM ApplicationLog al
                      WHERE al.timestamp BETWEEN @startDate AND @endDate
                    )
                    SELECT
                      cur.appl_id,
                      cur.log_id,
                      prev.prev_log_id, 
                      cur.applicant_name,
                      cur.applicant_rsa_pin,
                      cur.benefit_type,
                      cur.prev_reviewer,
                      cur.action,
                      cur.comment,                      
                      prev.prev_timestamp    AS start_timestamp,
                      cur.timestamp          AS end_timestamp,

                      -- duration in minutes
                      DATEDIFF(SECOND, prev.prev_timestamp, cur.timestamp) / 60 AS duration_minutes,

                      -- hours (decimal) rounded to 2 decimals
                      ROUND(DATEDIFF(SECOND, prev.prev_timestamp, cur.timestamp) / 3600.0, 2) AS hours_taken,

                      -- formatted as "Xh Ym"
                      CAST(DATEDIFF(SECOND, prev.prev_timestamp, cur.timestamp) / 3600 AS VARCHAR(10)) 
                          + 'h ' +
                      CAST((DATEDIFF(SECOND, prev.prev_timestamp, cur.timestamp) % 3600) / 60 AS VARCHAR(10)) 
                          + 'm' AS formatted_duration

                    FROM Cur cur
                    OUTER APPLY (
                      SELECT TOP (1) 
                        p.log_id AS prev_log_id, 
                        p.timestamp AS prev_timestamp
                      FROM ApplicationLog p
                      WHERE p.appl_id = cur.appl_id
                        AND p.log_id < cur.log_id
                      ORDER BY p.log_id DESC
                    ) prev
                    WHERE prev.prev_timestamp IS NOT NULL   
                      AND DATEDIFF(SECOND, prev.prev_timestamp, cur.timestamp) >= 0
                    ORDER BY cur.appl_id, cur.log_id;
        `);

        const data = await result.recordset;

        const enrichedData = data.map(row => {
            // start_timestamp and end_timestamp are already Date objects (no conversion needed)
            const start = row.start_timestamp;
            const end = row.end_timestamp;

            const { workHours, workMinutes } = calculateBusinessTime(start, end, {
                holidays: ["2025-06-06", "2025-06-09", "2025-06-12", "2025-07-15", "2025-09-05"]
            });

            return {
                ...row,
                workHours,
                workMinutes,
                formattedBusinessDuration: `${workHours}h ${workMinutes}m`
            };
        });

        // Now enrichedData has your extra columns
        // console.log(enrichedData[0]); // sample row
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Processing Time Report');

        // Add column headers
        worksheet.columns = [
            { header: 'Application ID', key: 'appl_id', width: 15 },
            { header: 'Log ID', key: 'log_id', width: 15 },
            { header: 'Previous Log ID', key: 'prev_log_id', width: 15 },
            { header: 'Applicant Name', key: 'applicant_name', width: 30 },
            { header: 'RSA PIN', key: 'applicant_rsa_pin', width: 20 },
            { header: 'Benefit Type', key: 'benefit_type', width: 25 },
            { header: 'Previous Reviewer', key: 'prev_reviewer', width: 25 },
            { header: 'Action', key: 'action', width: 15 },
            { header: 'Comment', key: 'comment', width: 30 },
            { header: 'Start Timestamp', key: 'start_timestamp', width: 25, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
            { header: 'End Timestamp', key: 'end_timestamp', width: 25, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
            { header: 'Duration (min)', key: 'duration_minutes', width: 20 },
            { header: 'Hours Taken', key: 'hours_taken', width: 20 },
            { header: 'Formatted Duration', key: 'formatted_duration', width: 25 },
            { header: 'Work Hours', key: 'workHours', width: 15 },
            { header: 'Work Minutes', key: 'workMinutes', width: 15 },
            { header: 'Business Duration', key: 'formattedBusinessDuration', width: 30 }
        ];

        // Add data rows
        enrichedData.forEach(row => {
            worksheet.addRow(row);
        });

        // Format header row (bold)
        worksheet.getRow(1).font = { bold: true };

        // Export as download
        const buffer = await workbook.xlsx.writeBuffer();

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="processing_time_report.xlsx"',
        });

        res.send(buffer);

    } catch (error) {
        console.log('agentsFetchError: ', error);
    } finally {
        // Close the connection
        await sql.close();
    }
});

module.exports = router;




