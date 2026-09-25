const express = require('express');
require('dotenv').config();
const fs = require('fs');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const sql = require('mssql');
const { connectToDatabase } = require('./dbconnection');
const calculateAge = require('./ageCal');
const formatAsCurrency = require('./moneyFig');
const capitalizeWords = require('./capitalizeWords');
const formatReviewHistory = require('../utility/formatReviewHistory');

router.get('/', async (req, res) => {

    try {
        const pool = await connectToDatabase('BenefitTracker');

        const applRes = await pool.request()
            .query(`
            SELECT * FROM BenefitTracker_v2.dbo.Applications WHERE status_id < 16 ORDER BY benefit_type DESC`);

        const applications = applRes.recordset;
        // console.log('appls: ', applications);

        const data = [];

        for (let app of applications) {
            let age = calculateAge(app.applicant_dob);
            let employerName = capitalizeWords(app.employer);
            let applName = capitalizeWords(app.applicant_name);
            let approvedBy = capitalizeWords(app.last_reviewer);

            const appl = {
                id: app.id,
                applicantName: applName,
                applicantRsaPin: app.applicant_rsa_pin,
                applicantRsaBal: app.applicant_rsa_bal,
                applicationDate: app.application_date,
                benefitType: app.benefit_type,
                docId: app.doc_id,
                folderId: app.folder_id,
                employer: employerName,
                age,
                approvedBy,
                phone: app.applicant_phone,
                statusId: app.status_id,
                status: app.status,
                taskOwner: app.taskOwner,
                taskOwnerId: app.taskOwner_id,
                docPath: app.doc_path,
                folderPath: app.folder_path,
                gender: app.gender,
                fundType: app.fund_type,
                comment: app.comment
            };

            // console.log('loggedAppl: ', appl);

            data.push(appl);
        }

        // console.log('allReq: ', data);

        res.json(data);

    } catch (error) {
        console.log('Appl fetching error: ', error);
    }

});

router.get('/appl', async (req, res) => {
    const { pin } = req.query;

    console.log('query: ', pin);

    const pool = await connectToDatabase('BenefitTracker_v2');

    const pinSearchRes = await pool.request().input('pin', pin).query(`
        SELECT COUNT(*) AS pinCount FROM BenefitTracker_v2.dbo.Applications WHERE applicant_rsa_pin = @pin
        `);

    const pinCount = await pinSearchRes.recordset[0]['pinCount'];
    console.log('pinCount: ', pinCount);

    if (pinCount === 0) {
        console.log('No application found.')
    };

    try {

        const applRes = await pool.request()
            .input('pin', pin)
            .query(`
                 SELECT * FROM BenefitTracker_v2.dbo.Applications
                     WHERE applicant_rsa_pin = @pin`);

        const applData = applRes.recordset;

        let data = [];

        for (const app of applData) {
            let age = calculateAge(app.applicant_dob);
            let employerName = capitalizeWords(app.employer);
            let applName = capitalizeWords(app.applicant_name);
            let approvedBy = capitalizeWords(app.last_reviewer);

            const appl = {
                id: app.id,
                applicantName: applName,
                applicantRsaPin: app.applicant_rsa_pin,
                applicantRsaBal: app.applicant_rsa_bal,
                applicationDate: app.application_date,
                benefitType: app.benefit_type,
                employer: employerName,
                age,
                approvedBy,
                phone: app.applicant_phone,
                statusId: app.status_id,
                status: app.status,
                taskOwner: app.taskOwner,
                taskOwnerId: app.taskOwner_id,
                docPath: app.doc_path,
                gender: app.gender,
                fundType: app.fund_type
            };

            data.push(appl);
        }
        console.log('newData: ', data);
        res.json(data);

    } catch (error) {
        console.log('App fetching error: ', error);
    }
});

router.get('/appl-image', async (req, res) => {
    const { pin } = req.query;

    console.log('img-query: ', pin);

    const pool = await connectToDatabase('PFAIMAGES');

    const pinSearchRes = await pool.request().input('pin', pin).query(`
        SELECT COUNT(*) AS pinCount FROM PFAIMAGES.dbo.EMPLOYEE_IMAGES WHERE PIN = @pin
        `);

    const pinCount = await pinSearchRes.recordset[0]['pinCount'];
    console.log('pinCount: ', pinCount);

    if (pinCount === 0) {
        console.log('Images not found.');
        res.json({ message: 'Images not found.' });
        return;
    };

    try {

        const applRes = await pool.request()
            .input('pin', pin)
            .query(`
                 SELECT PICTURE_IMAGE, SIGNATURE_IMAGE FROM PFAIMAGES.dbo.EMPLOYEE_IMAGES
                     WHERE PIN = @pin`);

        const pictureBuffer = applRes.recordset[0].PICTURE_IMAGE;
        const pictureBase64 = pictureBuffer ? pictureBuffer.toString('base64') : null;
        const signatureBuffer = applRes.recordset[0].SIGNATURE_IMAGE;
        const signatureBase64 = signatureBuffer ? signatureBuffer.toString('base64') : null;

        console.log(`[/appl-image] Images fetched from DB for PIN: ${pin} — picture: ${pictureBase64 ? 'YES' : 'NO'}, signature: ${signatureBase64 ? 'YES' : 'NO'}`);

        const applImages = {
            pictureBase64,
            signatureBase64
        };

        res.json(applImages);

    } catch (error) {
        console.log('App fetching error: ', error);
    }
});

router.get('/review-history', async (req, res) => {
    try {
        const { appId } = req.query;

        const pool = await connectToDatabase('BenefitTracker_v2');

        const revHisRes = await pool.request().input('id', appId).query(`
        SELECT timestamp AS review_date, prev_reviewer, comment FROM BenefitTracker_v2.dbo.ApplicationLog WHERE appl_id = @id;
        `);

        const reviewHistory = await revHisRes.recordset;

        console.log('RevHistory: ', reviewHistory);
        const formattedHistory = formatReviewHistory(reviewHistory);

        res.status(200).json(formattedHistory);

    } catch (error) {
        console.log('ErrorHis: ', error);
    }
})

router.get('/appl-logs', async (req, res) => {
    const { pin } = req.query;
    console.log('query: ', pin);

    const pool = await connectToDatabase('BenefitTracker_v2');

    const pinSearchRes = await pool.request().input('pin', pin).query(`
        SELECT COUNT(*) AS pinCount FROM BenefitTracker_v2.dbo.Applications WHERE applicant_rsa_pin = @pin
        `);

    const pinCount = await pinSearchRes.recordset[0]['pinCount'];
    console.log('pinCount: ', pinCount);

    if (pinCount === 0) {
        console.log('No application found.');
    };

    try {

        const applRes = await pool.request()
            .input('pin', pin)
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.ApplicationLog
                    WHERE applicant_rsa_pin = @pin`);

        const applData = applRes.recordset;

        // if (applData.rowsAffected[0]) return res.json([]);

        let data = [];

        for (const app of applData) {
            let age = calculateAge(app.applicant_dob);
            let applName = capitalizeWords(app.applicant_name);
            let approvedBy = capitalizeWords(app.prev_reviewer);

            const appl = {
                id: app.log_id,
                applicantName: applName,
                applicantRsaPin: app.applicant_rsa_pin,
                action: app.action,
                applicationDate: app.application_date,
                benefitType: app.benefit_type,
                reviewDate: app.timestamp,
                age,
                approvedBy,
                phone: app.applicant_phone,
                statusId: app.status_id,
                status: app.status,
                taskOwner: app.taskOwner,
                taskOwnerId: app.taskOwner_id,
                docPath: app.doc_path,
                gender: app.gender,
                fundType: app.fund_type,
                comment: app.comment,
                lastUpdated: app.last_updated
            };

            data.push(appl);
        }
        console.log('newData: ', data);
        res.json(data);

    } catch (error) {
        console.log('App fetching error: ', error);
    }
});

router.delete('/delete-request', async (req, res) => {
    const { adminId, requestId } = req.body;

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const delReqRes = await pool.request()
            .input('requestId', sql.Int, requestId)
            .query(`
                DELETE FROM BenefitTracker_v2.dbo.Applications WHERE id = @requestId;
            `);

        const delReqLogRes = await pool.request()
            .input('requestId', sql.Int, requestId)
            .query(`
                DELETE FROM BenefitTracker_v2.dbo.ApplicationLog WHERE appl_id = @requestId;
            `);

        const logActionRes = await pool.request()
            .input('adminId', sql.Int, adminId)
            .input('requestId', sql.Int, requestId)
            .query(`
                INSERT INTO BenefitTracker_v2.dbo.AdminActionsLog (admin_user_id, action_type, affected_user_id, timestamp, description)
                VALUES (@adminId, 'Delete request', @requestId, GETDATE(), 'Request deleted');
            `);

        if (delReqRes.rowsAffected[0] > 0) {
            res.status(200).json({ message: 'Request deleted successfully.' });
        } else {
            res.status(404).json({ message: 'Request not found.' });
        }

    } catch (error) {
        console.log('Error deleting request: ', error);
        res.status(500).json({ message: 'Internal server error.' });
    }

});

module.exports = router;