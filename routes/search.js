const express = require('express');
const sql = require('mssql');
const router = express.Router();
const { connectToDatabase } = require('./dbconnection');

router.get('/', async (req, res) => {

    const { query } = req.query;

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const pool = await connectToDatabase('PFA');
        const result = await pool.request()
            .input('query', sql.NVarChar, `%${query}%`)
            .query(`
                SELECT TOP 5 FULL_NAME, EMAIL FROM PFA.dbo.S_USER WHERE FULL_NAME LIKE @query
            `);
        const jsonRes = result.recordset;
        const data = jsonRes.map(item => ({
            name: item.FULL_NAME,
            email: item.EMAIL
        }));

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'An error occurred while fetching data' });
    }
});

router.get('/agents', async (req, res) => {
    const { query } = req.query;
    console.log('query: ', query);

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const pool = await connectToDatabase('PFA');
        const result = await pool.request()
            .input('query', sql.NVarChar, `%${query}%`)
            .query(`
                SELECT TOP 5 AGENT_NAME, AGENT_CODE FROM PFA.dbo.AGENTS WHERE AGENT_NAME LIKE @query
            `);
        const jsonRes = result.recordset;
        const data = jsonRes.map(item => ({
            name: item.AGENT_NAME,
            subTitle: item.AGENT_CODE
        }));

        console.log('data: ', jsonRes);

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'An error occurred while fetching data' });
    }
});

router.get('/officer', async (req, res) => {
    const { query } = req.query;
    console.log('officer: ', query);

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const poolB = await connectToDatabase('BenefitTracker_v2');
        const result = await poolB.request()
            .input('query', sql.NVarChar, `%${query}%`)
            .query(`
                SELECT name, id, email, role_id FROM BenefitTracker_v2.dbo.Users
                    WHERE name LIKE @query`)

        const data = result.recordset;

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'An error occurred while fetching data' });
    }
});

router.get('/statuses-and-reviewers', async (req, res) => {
    try {
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const result = await poolB.request()
            .query(`
                SELECT st.id AS statusId, st.status_name AS status, 
                    st.taskOwner_id, st.orig_taskOwner_id AS origReviewer, u.name AS reviewerName, 
                    u.email AS reviewerEmail, u.id AS reviewerId
                    FROM BenefitTracker_v2.dbo.Statuses st
                    JOIN Users u
	                ON st.taskOwner_group_id = u.id`)

        const data = await result.recordset;

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'An error occurred while fetching statusAndReviewers' });
    }
});

router.get('/request', async (req, res) => {
    try {
        const { query } = req.query;
        console.log('payload: ', query);

        if (!query) {
            return res.status(400).json({ error: 'Query parameter is required' });
        }

        const poolB = await connectToDatabase('BenefitTracker_v2');

        const result = await poolB.request()
            .input('query', sql.NVarChar, `%${query}%`)
            .query(`
                SELECT id, applicant_name AS applicantName,
                    applicant_rsa_pin AS rsaPin, benefit_type AS benefitType, application_date AS applDate
	                FROM BenefitTracker_v2.dbo.Applications
	                WHERE applicant_name LIKE @query`)

        const data = await result.recordset;

        console.log('DATA: ', data);
        res.status(200).json(data);

    } catch (error) {
        console.log('Error: ', error);
    }

})

router.get('/reviewers', async (req, res) => {
    try {
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const result = await poolB.request()
            .query(`
                SELECT id AS reviewerId, 
                        name AS reviewerName
                        
                    FROM BenefitTracker_v2.dbo.Users
                    WHERE is_active = 0`)

        const data = await result.recordset;

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'An error occurred while fetching reviewers' });
    }
})

router.get('/csd-agents', async (req, res) => {
    const { query } = req.query;
    console.log('payload: ', query)

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const poolC = await connectToDatabase('DataRecapture');

        const result = await poolC.request()
            .input('query', sql.NVarChar, `%${query}%`)
            .query(`
                SELECT S.ID, S.STAFF_NAME AS name,L.TITLE AS location FROM DataRecapture.dbo.USERS S
                    JOIN DataRecapture.dbo.LOCATIONS L ON S.LOCATION_ID = L.ID
                    WHERE S.STAFF_NAME LIKE @query`)

        const dbData = await result.recordset;

        const data = dbData.map(item => ({
            id: item.ID,
            name: item.name,
            subTitle: item.location
        }));

        console.log('result: ', data);

        res.status(200).json(data);
    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'An error occurred while fetching reviewers' });
    }
});


router.get('/company-details', async (req, res) => {
    const { query } = req.query;
    console.log('payload: ', query)

    if (!query) {
        return res.status(400).json({ error: 'Query parameter is required' });
    }

    try {
        const pool = await connectToDatabase('PFA');

        const result = await pool.request()
            .input('query', sql.NVarChar, `%${query}%`)
            .query(`
                SELECT NAME AS name, RCNO AS employer_code, ADDRESS AS address FROM PFA.dbo.EMPLOYER_DETAILS_WITH_LOCATION
                    
                    WHERE NAME LIKE @query`)

        const dbData = await result.recordset;

        const data = dbData.map(item => ({
            id: item.employer_code,
            name: item.name,
            subTitle: item.address
        }));

        console.log('result: ', data);

        res.status(200).json(data);

    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'An error occurred while fetching company details' });
    }


})


module.exports = router;