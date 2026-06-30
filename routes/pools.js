const express = require('express');
const router = express.Router();
const capitalizeWords = require('./capitalizeWords');
const calculateAge = require('./ageCal');
const sql = require('mssql');
const { connectToDatabase } = require('./dbconnection');

router.get('/pool-members/:groupId', async (req, res) => {
    const { groupId } = req.params;

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const membersResult = await pool.request()
            .input('groupId', groupId)
            .query(`
            SELECT DISTINCT user_id FROM BenefitTracker_v2.dbo.UserGroupMembers
                WHERE group_id = @groupId
            `);

        // const poolMembers = membersResult.recordset;
        const poolMemberIds = membersResult.recordset.map(row => row.user_id);
        console.log('Members: ', poolMemberIds);
        res.status(200).json(poolMemberIds);
    } catch (error) {
        console.log('Error getting members: ', error);
    }
})

router.get('/benefit-pool', async (req, res) => {

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const assignedReqRes = await pool.request()
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Applications
                    WHERE status_id = 2 OR status_id = 5
                    ORDER BY benefit_type, application_date DESC`);

        if (assignedReqRes.rowsAffected > 0) {
            const assignedAppls = assignedReqRes.recordset;

            const data = [];

            for (const app of assignedAppls) {
                let age = calculateAge(app.applicant_dob);
                let employerName = capitalizeWords(app.employer);
                let applName = capitalizeWords(app.applicant_name);

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
                    approvedBy: app.last_reviewer,
                    phone: app.applicant_phone,
                    statusId: app.status_id,
                    status: app.status,
                    taskOwner: app.taskOwner,
                    taskOwnerId: app.taskOwner_group_id,
                    docPath: app.doc_path,
                    folderPath: app.folder_path,
                    gender: app.gender,
                    fundType: app.fund_type,
                    comment: app.comment
                };

                data.push(appl);
            }

            res.json(data);

        } else {
            console.log('No request assigned to you for now.');
            res.json([]);
        }

    } catch (error) {
        console.log('Internal server error.', error)
    }

});

router.get('/processing-pool', async (req, res) => {
    const { userId } = req.query;

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const assignedReqRes = await pool.request()
            .input('userId', userId)
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Applications
                    WHERE last_reviewer_id = @userId AND status_id = 4 OR status_id = 7
                    ORDER BY benefit_type, application_date DESC`);

        if (assignedReqRes.rowsAffected > 0) {
            const assignedAppls = assignedReqRes.recordset;

            const data = [];

            for (const app of assignedAppls) {
                let age = calculateAge(app.applicant_dob);
                let employerName = capitalizeWords(app.employer);
                let applName = capitalizeWords(app.applicant_name);

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
                    approvedBy: app.last_reviewer,
                    phone: app.applicant_phone,
                    statusId: app.status_id,
                    status: app.status,
                    taskOwner: app.taskOwner,
                    taskOwnerId: app.taskOwner_group_id,
                    docPath: app.doc_path,
                    folderPath: app.folder_path,
                    gender: app.gender,
                    fundType: app.fund_type,
                    comment: app.comment
                };

                data.push(appl);
            }

            res.json(data);

        } else {
            console.log('No request assigned to you for now.');
            res.json([]);
        }

    } catch (error) {
        console.log('Internal server error.', error)
    }

});

router.get('/benefit-head-pool', async (req, res) => {

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const assignedReqRes = await pool.request()
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Applications
                    WHERE status_id = 6 OR status_id = 9
                    ORDER BY benefit_type, application_date DESC`);

        if (assignedReqRes.rowsAffected > 0) {
            const assignedAppls = assignedReqRes.recordset;

            const data = [];

            for (const app of assignedAppls) {
                let age = calculateAge(app.applicant_dob);
                let employerName = capitalizeWords(app.employer);
                let applName = capitalizeWords(app.applicant_name);

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
                    approvedBy: app.last_reviewer,
                    phone: app.applicant_phone,
                    statusId: app.status_id,
                    status: app.status,
                    taskOwner: app.taskOwner,
                    taskOwnerId: app.taskOwner_group_id,
                    docPath: app.doc_path,
                    folderPath: app.folder_path,
                    gender: app.gender,
                    fundType: app.fund_type,
                    comment: app.comment
                };

                data.push(appl);
            }

            res.json(data);

        } else {
            console.log('No request assigned to you for now.');
            res.json([]);
        }

    } catch (error) {
        console.log('Internal server error.', error)
    }

});

router.get('/audit-pool', async (req, res) => {

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const assignedReqRes = await pool.request()
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Applications
                    WHERE status_id = 8 OR status_id = 11
                    ORDER BY benefit_type, application_date DESC`);

        if (assignedReqRes.rowsAffected > 0) {
            const assignedAppls = assignedReqRes.recordset;

            const data = [];

            for (const app of assignedAppls) {
                let age = calculateAge(app.applicant_dob);
                let employerName = capitalizeWords(app.employer);
                let applName = capitalizeWords(app.applicant_name);

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
                    approvedBy: app.last_reviewer,
                    phone: app.applicant_phone,
                    statusId: app.status_id,
                    status: app.status,
                    taskOwner: app.taskOwner,
                    taskOwnerId: app.taskOwner_group_id,
                    docPath: app.doc_path,
                    folderPath: app.folder_path,
                    gender: app.gender,
                    fundType: app.fund_type,
                    comment: app.comment
                };

                data.push(appl);
            }

            res.json(data);

        } else {
            console.log('No request assigned to you for now.');
            res.json([]);
        }

    } catch (error) {
        console.log('Internal server error.', error)
    }

});

router.get('/audit-processor', async (req, res) => {
    const { userId } = req.query;

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const assignedReqRes = await pool.request()
            .input('userId', userId)
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Applications
                    WHERE last_reviewer_id = @userId AND status_id = 10 OR status_id = 13
                    ORDER BY benefit_type, application_date DESC`);

        if (assignedReqRes.rowsAffected > 0) {
            const assignedAppls = assignedReqRes.recordset;

            const data = [];

            for (const app of assignedAppls) {
                let age = calculateAge(app.applicant_dob);
                let employerName = capitalizeWords(app.employer);
                let applName = capitalizeWords(app.applicant_name);

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
                    approvedBy: app.last_reviewer,
                    phone: app.applicant_phone,
                    statusId: app.status_id,
                    status: app.status,
                    taskOwner: app.taskOwner,
                    taskOwnerId: app.taskOwner_group_id,
                    docPath: app.doc_path,
                    folderPath: app.folder_path,
                    gender: app.gender,
                    fundType: app.fund_type,
                    comment: app.comment
                };

                data.push(appl);
            }

            res.json(data);

        } else {
            console.log('No request assigned to you for now.');
            res.json([]);
        }

    } catch (error) {
        console.log('Internal server error.', error)
    }

});

router.get('/compliance-pool', async (req, res) => {

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const assignedReqRes = await pool.request()
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Applications
                    WHERE status_id = 12 OR status_id = 15
                    ORDER BY benefit_type, application_date DESC`);

        if (assignedReqRes.rowsAffected > 0) {
            const assignedAppls = assignedReqRes.recordset;

            const data = [];

            for (const app of assignedAppls) {
                let age = calculateAge(app.applicant_dob);
                let employerName = capitalizeWords(app.employer);
                let applName = capitalizeWords(app.applicant_name);

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
                    approvedBy: app.last_reviewer,
                    phone: app.applicant_phone,
                    statusId: app.status_id,
                    status: app.status,
                    taskOwner: app.taskOwner,
                    taskOwnerId: app.taskOwner_group_id,
                    docPath: app.doc_path,
                    folderPath: app.folder_path,
                    gender: app.gender,
                    fundType: app.fund_type,
                    comment: app.comment
                };

                data.push(appl);
            }

            res.json(data);

        } else {
            console.log('No request assigned to you for now.');
            res.json([]);
        }

    } catch (error) {
        console.log('Internal server error.', error)
    }

});

router.get('/finance-pool', async (req, res) => {

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const assignedReqRes = await pool.request()
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Applications
                    WHERE status_id = 14 OR status_id = 17
                    ORDER BY benefit_type, application_date DESC`);

        if (assignedReqRes.rowsAffected > 0) {
            const assignedAppls = assignedReqRes.recordset;

            const data = [];

            for (const app of assignedAppls) {
                let age = calculateAge(app.applicant_dob);
                let employerName = capitalizeWords(app.employer);
                let applName = capitalizeWords(app.applicant_name);

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
                    approvedBy: app.last_reviewer,
                    phone: app.applicant_phone,
                    statusId: app.status_id,
                    status: app.status,
                    taskOwner: app.taskOwner,
                    taskOwnerId: app.taskOwner_group_id,
                    docPath: app.doc_path,
                    folderPath: app.folder_path,
                    gender: app.gender,
                    fundType: app.fund_type,
                    comment: app.comment
                };

                data.push(appl);
            }

            res.json(data);

        } else {
            console.log('No request assigned to you for now.');
            res.json([]);
        }

    } catch (error) {
        console.log('Internal server error.', error)
    }

});

router.get('/archive-pool', async (req, res) => {

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const assignedReqRes = await pool.request()
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Applications
                    WHERE status_id = 16 OR status_id = 18
                    ORDER BY benefit_type, application_date DESC`);

        if (assignedReqRes.rowsAffected > 0) {
            const assignedAppls = assignedReqRes.recordset;

            const data = [];

            for (const app of assignedAppls) {
                let age = calculateAge(app.applicant_dob);
                let employerName = capitalizeWords(app.employer);
                let applName = capitalizeWords(app.applicant_name);

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
                    approvedBy: app.last_reviewer,
                    phone: app.applicant_phone,
                    statusId: app.status_id,
                    status: app.status,
                    taskOwner: app.taskOwner,
                    taskOwnerId: app.taskOwner_group_id,
                    docPath: app.doc_path,
                    folderPath: app.folder_path,
                    gender: app.gender,
                    fundType: app.fund_type,
                    comment: app.comment
                };

                data.push(appl);
            }

            res.json(data);

        } else {
            console.log('No request assigned to you for now.');
            res.json([]);
        }

    } catch (error) {
        console.log('Internal server error.', error)
    }

});



module.exports = router;