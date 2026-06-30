const express = require('express');
require('dotenv').config();
const fs = require('fs');
const qs = require('qs');
const multer = require('multer');
const path = require('path');
const router = express.Router();
const sql = require('mssql');
const { connectToDatabase } = require('./dbconnection');
const axios = require('axios');
const archiver = require('archiver');
const calculateAge = require('./ageCal');
const formatAsCurrency = require('./moneyFig');
const capitalizeWords = require('./capitalizeWords');
const transporter = require('../utility/EmailTransporter');
const isWithin6Months = require('../utility/withinAmonth');
const combineDocuments = require('../utility/combineDocuments');
const compressDocuments = require('../utility/compressDocuments');
const formatPhoneNumber = require('../utility/formatPhoneNum');
const compressAddedDocs = require('../utility/CompressAddedDocs');
const extractOrderNum = require('../utility/extractOrderNum');

const tenantName = process.env.TENANT_NAME;
const siteId = process.env.SITE_ID;
const siteName = process.env.SITE_NAME;
const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const tenantId = process.env.TENANT_ID;
const driveId = process.env.DRIVE_ID;
const baseUrl = process.env.BASE_URL;


async function getAccessToken() {
    try {
        const response = await axios.post(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,

            qs.stringify({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
                scope: 'https://graph.microsoft.com/.default',
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        return response.data.access_token;
    } catch (error) {
        console.log('Token Error: ', error.response ? error.response.data : error.message);
        throw new Error('Failed to retrieve access token');
    }

}

async function createSharePointFolder(accessToken, siteUrl, folderName) {
    try {
        const response = await axios.put(
            `${siteUrl}/${folderName}`,
            {
                name: folderName,
                folder: {},
                "@microsoft.graph.conflictBehavior": "rename"
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error("Error creating folder:", error.response ? error.response.data : error.message);
        throw new Error("Failed to create folder in SharePoint");
    }
}

async function uploadFileToSharePoint(accessToken, folderUrl, filePath) {
    try {
        await fs.promises.stat(filePath);
    } catch (err) {
        throw new Error('File not found: ' + filePath);
    }

    const fileName = path.basename(filePath);

    const uploadUrl = `${folderUrl}/${fileName}:/content`;
    const fileBuffer = await fs.promises.readFile(filePath);

    const response = await axios.put(uploadUrl, fileBuffer, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
            'Accept': 'application/json',
        },
    });
    return response.data;
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../tmp/bntDoc-uploads'))
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix)
    }
});

const upload = multer({ storage: storage });

router.post('/application-subm', upload.any(), async (req, res) => {
    const pool = await connectToDatabase('BenefitTracker_v2');
    const { applicantInfo, agent, benefitType } = req.body;
    const comment = 'Reviewed & approved';
    console.log('Agent Submitting request: ', agent);

    const agentInfo = JSON.parse(agent);
    const benefitReqType = JSON.parse(benefitType);
    const appInfo = JSON.parse(applicantInfo);
    const requiredDocs = JSON.parse(req.body.requiredDocs);

    const clientName = `${appInfo.firstname}-${appInfo.surname}`.replace(/\s+/g, '').trim();
    const cleanedBenefitType = benefitReqType.replace(/\s+/g, '').trim();
    const folderName = `${clientName}-${appInfo.pin}-${cleanedBenefitType}`;

    try {
        // Check for recent duplicate application
        const existingApp = await pool.request()
            .input('pin', sql.VarChar(20), appInfo.pin)
            .input('benefitType', sql.VarChar(255), benefitReqType)
            .query(`
          SELECT id, application_date FROM BenefitTracker_v2.dbo.Applications
          WHERE applicant_rsa_pin = @pin AND benefit_type = @benefitType
        `);

        if (existingApp.rowsAffected[0] > 0) {
            const lastAppl = existingApp.recordset[existingApp.recordset.length - 1];
            if (isWithin6Months(lastAppl.application_date)) {
                return res.json({ data: "A benefit application of this type was submitted within the last 30 days." });
            }
        }

        const accessToken = await getAccessToken();
        const folder = await createSharePointFolder(accessToken, `${baseUrl}/${driveId}/root:`, folderName);
        const folderUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${folderName}`;
        const { webUrl, id: folderId } = folder;

        // Process uploaded files
        const documents = req.files.map(file => ({
            buffer: fs.readFileSync(file.path),
            mimetype: file.mimetype,
            originalname: file.originalname,
            path: file.path
        }));

        const compressedFiles = await compressDocuments(documents, requiredDocs, clientName);

        const uploadedFiles = await Promise.all(
            compressedFiles.map(async ({ compressedPath }) => {
                const absolutePath = path.resolve(compressedPath);
                if (!fs.existsSync(absolutePath)) throw new Error(`File not found: ${absolutePath}`);
                const result = await uploadFileToSharePoint(accessToken, folderUrl, absolutePath);
                return {
                    ...result,
                    localPath: compressedPath
                };
            })
        );

        // Save file metadata
        for (const file of uploadedFiles) {
            const fileSize = file.size / 1024;
            const docOrder = extractOrderNum(file.name); // extract from filename

            await pool.request()
                .input('rsaPin', sql.VarChar(50), appInfo.pin)
                .input('fileName', sql.VarChar(255), file.name)
                .input('folderName', sql.VarChar(255), folderName)
                .input('fileId', sql.VarChar(100), file.id)
                .input('fileSize', sql.Int, fileSize)
                .input('folderUrl', sql.VarChar(255), webUrl)
                .input('folderId', sql.VarChar(100), folderId)
                .input('docOrder', sql.Int, docOrder)
                .query(`
        INSERT INTO BenefitTracker_v2.dbo.DocumentMetaData 
        (rsaPin, fileName, folderName, fileId, fileSize, folderUrl, folderId, docOrder)
        VALUES (@rsaPin, @fileName, @folderName, @fileId, @fileSize, @folderUrl, @folderId, @docOrder)
    `);
        }

        // Fetch statuses and task owner
        const [firstLevelStatus] = (await pool.request().query(`SELECT id, status_name FROM BenefitTracker_v2.dbo.Statuses WHERE id = 2`)).recordset;
        const [secondLevelStatus] = (await pool.request().query(`SELECT id, taskOwner_group_id FROM BenefitTracker_v2.dbo.Statuses WHERE id = 4`)).recordset;
        const [taskOwner] = (await pool.request()
            .input('id', secondLevelStatus.taskOwner_group_id)
            .query(`SELECT group_name AS name, email FROM BenefitTracker_v2.dbo.UserGroups WHERE id = @id`)).recordset;

        const today = new Date();
        const applicantName = appInfo.othername
            ? `${appInfo.firstname} ${appInfo.surname} ${appInfo.othername}`
            : `${appInfo.firstname} ${appInfo.surname}`;

        // Insert into Applications table
        const result = await pool.request()
            .input('applicantName', applicantName)
            .input('rsaPin', appInfo.pin)
            .input('dob', appInfo.dateOfBirth)
            .input('rsaBal', appInfo.rsaBal.slice(1))
            .input('phoneNumber', appInfo.phoneNumber)
            .input('applDate', today)
            .input('benefitType', benefitReqType)
            .input('employer', appInfo.employer)
            .input('fundType', appInfo.fundType)
            .input('statusId', firstLevelStatus.id)
            .input('status', firstLevelStatus.status_name)
            .input('taskOwner', taskOwner.name)
            .input('taskOwnerId', secondLevelStatus.taskOwner_group_id)
            .input('lastUpdated', today)
            .input('lastReviewer', agentInfo.name)
            .input('lastReviewerId', agentInfo.id)
            .input('surname', appInfo.surname)
            .input('firstname', appInfo.firstname)
            .input('othername', appInfo.othername)
            .input('gender', appInfo.gender)
            .input('folderPath', webUrl)
            .input('folderId', folderId)
            .input('comment', comment)
            .input('folderName', folderName)
            .query(`
          INSERT INTO BenefitTracker_v2.dbo.Applications
          (applicant_name, applicant_rsa_pin, applicant_dob, applicant_rsa_bal, applicant_phone, 
           application_date, benefit_type, employer, fund_type, status_id, status, taskOwner, taskOwner_id,
           last_reviewer, last_reviewer_id, last_updated, folder_path, surname, firstname, othername, gender, comment, folder_id, folder_name)
          OUTPUT INSERTED.id
          VALUES (@applicantName, @rsaPin, @dob, @rsaBal, @phoneNumber, @applDate, @benefitType,
                  @employer, @fundType, @statusId, @status, @taskOwner, @taskOwnerId,
                  @lastReviewer, @lastReviewerId, @lastUpdated, @folderPath, @surname, @firstname, @othername, @gender, @comment, @folderId, @folderName)
        `);

        const newAppId = result.recordset[0].id;

        // Insert into ApplicationLog
        await pool.request()
            .input('applId', newAppId)
            .input('applicantName', applicantName)
            .input('rsaPin', appInfo.pin)
            .input('action', comment)
            .input('previousReviewerId', agentInfo.id)
            .input('previousReviewerName', agentInfo.name)
            .input('currentReviewerId', secondLevelStatus.taskOwner_group_id)
            .input('currentReviewerName', taskOwner.name)
            .input('statusId', firstLevelStatus.id)
            .input('status', firstLevelStatus.status_name)
            .input('comment', comment)
            .input('timestamp', today)
            .input('folderPath', webUrl)
            .input('folderId', folderId)
            .input('fundType', appInfo.fundType)
            .input('benefitType', benefitReqType)
            .input('taskOwnerId', secondLevelStatus.taskOwner_group_id)
            .input('taskOwner', taskOwner.name)
            .query(`
          INSERT INTO BenefitTracker_v2.dbo.ApplicationLog
          (appl_id, applicant_name, applicant_rsa_pin, action, prev_reviewer_id, prev_reviewer,
           current_reviewer_id, current_reviewer, status_id, status, comment, timestamp, folder_path, folder_id, 
           fund_type, benefit_type, taskOwner_id, taskOwner)
          VALUES (@applId, @applicantName, @rsaPin, @action, @previousReviewerId, @previousReviewerName,
                  @currentReviewerId, @currentReviewerName, @statusId, @status, @comment, @timestamp, 
                  @folderPath, @folderId, @fundType, @benefitType, @taskOwnerId, @taskOwner)
        `);

        // Cleanup files
        for (const doc of [...documents, ...compressedFiles]) {
            fs.unlink(doc.path || doc.compressedPath, err => {
                if (err) console.error(`Error deleting file: ${doc.path || doc.compressedPath}`, err);
                else console.log(`Deleted file: ${doc.path || doc.compressedPath}`);
            });
        }

        // Send notification email
        const option = {
            from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
            to: taskOwner.email,
            cc: `${agentInfo.email}`,
            subject: `Assigned Task - New ${benefitType} Request`,
            html: `
                    
                <p>Dear Team,</p>
                    
                <p>A new benefit request task has been assigned to you for further processing. Please review the documents and take the necessary actions.</p>
                <p>You can access the task details in the Benefit Tracker application.</p>

                <p>Submitted by: ${agentInfo.name} <br>
                Branch: ${agentInfo.branch}  <br>
                Benefit Type: ${benefitType} </p>

                <p>Thank you for your prompt attention to this matter.</p>
                <p>Benefit Department</p>
                <p>Norrenberger Pensions Ltd</p>
                `
        }

        transporter.sendMail(option, async function (err, info) {
            if (err) {
                console.log('EmailError: ', err);
                return;
            } else {
                if (info.response) {
                    console.log('Email Delivered successfully');
                }
            }
        });

        res.status(200).json({ data: "Application submitted successfully." });

    } catch (err) {
        console.error("Error handling submission:", err);
        res.status(500).json({ data: "An error occurred during application submission." });
    }
});



// ROUTE FOR FETCHING ASSIGNED TASK - BENEFIT REQUESTS
router.get('/assigned-applications', async (req, res) => {
    const { userId, agentName } = req.query;

    const id = JSON.parse(userId);

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const assignedReqRes = await pool.request()
            .input('id', id)
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Applications
                    WHERE taskOwner_id = @id
                    ORDER BY benefit_type, application_date`);

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


router.put('/approval', upload.any(), async (req, res) => {
    const { appInform, comment, docID, folderID, userInfo, nextRevId } = req.body;

    const appInfo = JSON.parse(appInform);
    const newComment = JSON.parse(comment);
    const userDetails = JSON.parse(userInfo);
    const folderId = JSON.parse(folderID);
    const docId = JSON.parse(docID);
    const applicationId = appInfo.id;
    console.log('AppId: ', applicationId);
    const nextReviewerId = (!nextRevId || nextRevId === "undefined") ? "" : JSON.parse(nextRevId);
    const { name: userName, id: userId, branch: userBranch, email: userEmail } = userDetails;
    console.log('APPINFO: ', appInfo);

    const pool = await connectToDatabase('BenefitTracker_v2');

    const handlerCheckRes = await pool.request()
        .input('userId', userId)
        .query(`
            SELECT role2_id FROM BenefitTracker_v2.dbo.Users
                WHERE id = @userId`);

    const role2Id = handlerCheckRes.recordset?.[0]?.role2_id ?? null;

    if (appInfo.statusId === 2 && role2Id !== 1005) {
        return res.json({
            data: "The request is already approved and is with the Benefit Team. Refresh your Tasks page."
      });
    }


    const files = req.files;

    if (files && folderId && files.length > 0) {

        const folderNameRes = await pool.request()
            .input('folderId', folderId)
            .query(`
                SELECT folder_name, applicant_rsa_pin, folder_path FROM BenefitTracker_v2.dbo.Applications
                    WHERE folder_id = @folderId`);
        const folderName = folderNameRes.recordset?.[0]?.folder_name;
        const rsaPin = folderNameRes.recordset?.[0]?.applicant_rsa_pin;
        const webUrl = folderNameRes.recordset?.[0]?.folder_path;

        const folderUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/root:/${folderName}`

        if (!folderName) {
            throw new Error(`Folder name not found for folderId: ${folderId}`);
        }

        const accessToken = await getAccessToken();

        const documents = files.map(file => {
            const filePath = file.path;
            const buffer = fs.readFileSync(filePath);
            return {
                buffer,
                mimetype: file.mimetype,
                originalname: file.originalname,
                path: filePath
            }
        });

        const clientName = appInfo.applicantName.replace(/ /g, '-');

        const compressedFilesPaths = await compressAddedDocs(documents, clientName);

        const uploadPromises = compressedFilesPaths.map(async (compFile) => {
            let filePath = compFile.compressedPath;
            const absolutePath = path.resolve(filePath);

            // Check if the file exists
            if (!fs.existsSync(absolutePath)) {
                console.error(`File not found: ${absolutePath}`);
                throw new Error(`File not found: ${absolutePath}`);
            }

            try {
                return uploadFileToSharePoint(accessToken, folderUrl, absolutePath)
                    .then(data => ({
                        url: data.webUrl,
                        id: data.id,
                        size: data.size,
                        name: data.name
                    }))

            } catch (error) {
                console.error(`Error processing file: ${absolutePath}`, error);
                throw error; // Re-throw the error for further handling
            }
        });

        // Cleanup: Delete original files after successful upload
        documents.forEach(doc => {
            fs.unlink(doc.path, (err) => {
                if (err) console.error(`Error deleting original file: ${doc.path}`, err);
                else console.log(`Deleted original file: ${doc.path}`);
            });
        });

        const uploadedFiles = await Promise.all(uploadPromises);

        try {
            for (const file of uploadedFiles) {
                const fileSize = file.id / 1024;
                await pool.request()
                    .input('rsaPin', sql.VarChar(50), rsaPin)
                    .input('fileName', sql.VarChar(255), file.name)
                    .input('folderName', sql.VarChar(255), folderName)
                    .input('fileId', sql.VarChar(100), file.id)
                    .input('fileSize', sql.Int, fileSize)
                    .input('folderUrl', sql.VarChar(255), webUrl)
                    .input('folderId', sql.VarChar(100), folderId)
                    .query(`
                INSERT INTO BenefitTracker_v2.dbo.DocumentMetaData (rsaPin, fileName, folderName, fileId, fileSize, folderUrl, folderId)
                VALUES (@rsaPin, @fileName, @folderName, @fileId, @fileSize, @folderUrl, @folderId);
              `);
            }
            console.log('Record inserted successfully');
        } catch (err) {
            console.error('Error inserting records:', err);
        }


        compressedFilesPaths.forEach(doc => {
            fs.unlink(doc.compressedPath, (err) => {
                if (err) console.error(`Error deleting original file: ${doc.compressedPath}`, err);
                else console.log(`Deleted compressed file: ${doc.compressedPath}`);
            });
        });

    }

    const today = new Date();

    try {
        const applInfoRes = await pool.request()
            .input('id', applicationId)
            .query(
                `SELECT id, status, status_id, last_reviewer, applicant_phone, applicant_rsa_pin, benefit_type FROM BenefitTracker_v2.dbo.Applications
                    WHERE id = @id`
            )

        const dbAppInfo = await applInfoRes.recordset[0];
        console.log("AppInfo: ", dbAppInfo);

        // Use client-provided status ID for optimistic locking check to prevent double-approval
        const appStatusId = appInfo.status_id !== undefined ? appInfo.status_id : dbAppInfo.status_id;
        console.log('appStatusId: ', appStatusId)

        const phone = dbAppInfo.applicant_phone ? formatPhoneNumber(dbAppInfo.applicant_phone) : '';
        console.log('PHONE: ', phone);
        const pin = dbAppInfo.applicant_rsa_pin;

        const approvalTransitions = {
            0: 2,
            1: 0,
            2: 4,
            3: 2,
            4: 6,
            5: 4,
            6: 8,
            7: 6,
            8: 10,
            9: 8,
            10: 12,
            11: 10,
            12: 14,
            13: 12,
            14: 16,
            15: 14,
            16: 18,
            17: 16,
            18: 20,
            19: 18,
            20: 22,
            21: 20,
            22: 24,
        }

        //const nextStatusId = approvalTransitions.appStatusId;
        const nextStatusId = approvalTransitions[appStatusId];
        console.log('NextStatusId: ', nextStatusId);

        const nextStatusSearchRes = await pool.request()
            .input('id', nextStatusId)
            .query(`
                SELECT status_name FROM BenefitTracker_v2.dbo.Statuses
                    WHERE id = @id`)

        const nextStatusSearch = await nextStatusSearchRes.recordset[0];
        console.log('STATUSNAME: ', nextStatusSearch);

        const nextStatusName = nextStatusSearch.status_name;

        const statusIdFrNextRow = nextStatusId + 2;

        const nextTaskOwnerRowRes = await pool.request()
            .input('newStatusId', statusIdFrNextRow)
            .query(`
                SELECT id, status_name, taskOwner_group_id FROM BenefitTracker_v2.dbo.Statuses
                    WHERE id = @newStatusId`);

        const nextHandlerRow = nextTaskOwnerRowRes.recordset[0];

        // const nextHandlerId = nextHandlerRow.taskOwner_id;
        const nextHandlerId = nextReviewerId ? nextReviewerId : nextHandlerRow.taskOwner_group_id;

        const nextHandlerDetailRes = await pool.request()
            .input('id', nextHandlerId)
            .query(
                `SELECT id, group_name AS name, email FROM BenefitTracker_v2.dbo.UserGroups
                        WHERE id = @id`
            )

        const nextHandlerDetail = await nextHandlerDetailRes.recordset[0];

        const nextHandlerName = nextHandlerDetail.name;
        const nextHandlerEmail = nextHandlerDetail.email;

        try {

            const transaction = new sql.Transaction(pool);
            await transaction.begin();

            // 1️⃣ Lock the application row
            const lockRes = await new sql.Request(transaction)
                .input('appId', applicationId)
                .query(`
                SELECT status_id
                FROM BenefitTracker_v2.dbo.Applications WITH (UPDLOCK, ROWLOCK)
                WHERE id = @appId
              `);

            if (lockRes.recordset.length === 0) {
                throw new Error('Application not found');
            }

            const lockedStatusId = lockRes.recordset[0].status_id;

            // Check if status has changed since last read
            if (lockedStatusId !== appStatusId) {
                throw new Error('Application status has changed. Please refresh and try again.');
            }

            const approvalRes = await new sql.Request(transaction)
                .input('appId', applicationId)
                .input('comment', newComment)
                .input('statusId', nextStatusId)
                .input('newTaskOwner', nextHandlerName)
                .input('newTaskOwnerId', nextHandlerId)
                .input('lastReviewer', userName)
                .input('lastReviewerId', userId)
                .input('status', nextStatusName)
                .input('currentStatusId', appStatusId)
                .query(`
                  UPDATE BenefitTracker_v2.dbo.Applications
                  SET
                    status_id = @statusId,
                    status = @status,
                    taskOwner = @newTaskOwner,
                    taskOwner_id = @newTaskOwnerId,
                    last_reviewer = @lastReviewer,
                    last_reviewer_id = @lastReviewerId,
                    comment = @comment,
                    last_updated = GETDATE()
                  OUTPUT inserted.*
                  WHERE id = @appId
                    AND status_id = @currentStatusId
            `);

            if (approvalRes.rowsAffected[0] === 0) {
                throw new Error('Application already processed');
            }

            await transaction.commit();

            if (approvalRes.rowsAffected > 0) {
                const approvedAppl = approvalRes.recordset[0];

                const applLogRes = await pool.request()
                    .input('applId', approvedAppl.id)
                    .input('applName', approvedAppl.applicant_name)
                    .input('applRsaPin', approvedAppl.applicant_rsa_pin)
                    .input('action', 'Approved')
                    .input('prevReviewerId', approvedAppl.last_reviewer_id)
                    .input('prevReviewer', approvedAppl.last_reviewer)
                    .input('currentReviewer', approvedAppl.taskOwner)
                    .input('currentReviewerId', approvedAppl.taskOwner_id)
                    .input('statusId', approvedAppl.status_id)
                    .input('status', approvedAppl.status)
                    .input('comment', approvedAppl.comment)
                    .input('timestamp', today)
                    .input('docPath', approvedAppl.doc_path)
                    .input('fundType', approvedAppl.fund_type)
                    .input('benefitType', approvedAppl.benefit_type)
                    .input('taskOwnerId', approvedAppl.taskOwner_id)
                    .input('taskOwner', approvedAppl.taskOwner)
                    .input('createdAt', today)
                    .query(`
                        INSERT INTO BenefitTracker_v2.dbo.ApplicationLog
                        (appl_id, applicant_name, applicant_rsa_pin, action, prev_reviewer_id, prev_reviewer, 
                            current_reviewer_id, current_reviewer, status_id, status, comment, timestamp, doc_path, 
                            fund_type, benefit_type, taskOwner_id, taskOwner, created_at)
                        VALUES (@applId, @applName, @applRsaPin, @action, @prevReviewerId, @prevReviewer, 
                            @currentReviewerId, @currentReviewer, @statusId, @status, @comment, @timestamp,
                            @docPath, @fundType, @benefitType, @taskOwnerId, @taskOwner, @createdAt)
                        `)

                res.status(200).json({ data: 'Approved and sent to next reviewer.' });
            }
        } catch (err) {
            await transaction.rollback();
            throw err;
        }

        const option = {
            from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
            to: nextHandlerEmail,
            cc: `${userEmail}`,
            subject: `Assigned Task - ${dbAppInfo.benefit_type} Request`,
            html: `
                        
                    <p>Dear Team,</p>
                        
                    <p>A new benefit request task has been assigned to you for further processing. Please review the documents and take the necessary actions.</p>
                    <p>You can access the task details in the Benefit Tracker application.</p>

                    <p>Submitted by: ${userName} <br>
                    Branch: ${userBranch}  <br>
                    Benefit Type: ${dbAppInfo.benefit_type} </p>

                    <p>Thank you for your prompt attention to this matter.</p>
                    <p>Benefit Department</p>
                    <p>Norrenberger Pensions Ltd</p>
                    `
        }

        transporter.sendMail(option, async function (err, info) {
            if (err) {
                console.log('EmailError: ', err);
                return;
            } else {
                if (info.response) {
                    console.log('Email Delivered successfully');
                }
            }
        });

        const clientNameAndEmail = await pool.request()
            .input('pin', sql.VarChar(20), pin)
            .query(`
                    SELECT FIRSTNAME AS firstName, EMAIL AS email FROM PFA.dbo.EMPLOYEES WHERE PIN = @pin;
                    `)

        const { firstName, email } = clientNameAndEmail.recordset[0];

        if (nextStatusId === 8 && phone) {

            const senderID = "NorrenPens";
            const channel = "BNTR";
            const msg = `Your Benefit request documents have been received.`;

            const docApprSMSRes = await pool.request()
                .input('pin', sql.VarChar(20), pin)
                .input('phone', sql.VarChar(15), phone)
                .input('msg', sql.VarChar(250), msg)
                .input('channel', sql.VarChar(20), channel)
                .input('senderID', sql.VarChar(20), senderID)
                .query(`INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER 
        		( senderID, RSAPIN, PhoneNo, Message, ChannelCode ) VALUES ( @senderID, @pin, @phone, @msg, @channel )`);


            if (docApprSMSRes) console.log(`SMS has been sent to ${phone}`);

            if (email) {
                const optionEmailOne = {
                    from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
                    to: email,
                    subject: `Request Status - ${dbAppInfo.benefit_type} Request`,
                    html: `
                                
                            <p>Dear ${capitalizeWords(firstName)},</p>
                                
                            <p>We acknowledge receipt of your application and wish to inform you that it is currently undergoing our internal review and due process. We will keep you informed once the review is complete or if any additional information is required.</p>

                            <p>You may use the link below to track the current status of your application. Simply click the link and follow the prompts to view real-time updates.</p>

                            <a>https://benefit.norrenpensions.com/benefit-tracker/</a>
                            
                            <p>Thank you for your patience and for choosing Norrenberger Pensions.</p>
        
                            <p>Norrenberger Pensions Ltd</p>
                            `
                }

                transporter.sendMail(optionEmailOne, async function (err, info) {
                    if (err) {
                        console.log('EmailError: ', err);
                        return;
                    } else {
                        if (info.response) {
                            console.log('First email delivered successfully to client');
                        }
                    }
                });
            }
        }

        if (nextStatusId === 14 && email) {
            const optionEmailTwo = {
                from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
                to: email,
                subject: `Request Status - ${dbAppInfo.benefit_type} Request`,
                html: `
                            
                        <p>Dear ${capitalizeWords(firstName)},</p>
                            
                        <p>We are pleased to inform you that your application is at the final stage of processing and awaiting approval for payment. We will notify you once the approval is completed and payment has been finalized.</p>
                        
                        <p>Thank you for your patience and cooperation.</p>
    
                        <p>Norrenberger Pensions Ltd</p>
                        `
            }

            transporter.sendMail(optionEmailTwo, async function (err, info) {
                if (err) {
                    console.log('EmailError: ', err);
                    return;
                } else {
                    if (info.response) {
                        console.log('First email delivered successfully to client');
                    }
                }
            });
        }

        if (nextStatusId === 16 && phone) {

            const senderID = "NorrenPens";
            const channel = "BNTR";
            const msg = `Your Benefit request has been approved for payment.`;

            const paymentSMSRes = await pool.request()
                .input('pin', sql.VarChar(20), pin)
                .input('phone', sql.VarChar(15), phone)
                .input('msg', sql.VarChar(250), msg)
                .input('channel', sql.VarChar(20), channel)
                .input('senderID', sql.VarChar(20), senderID)
                .query(`INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER 
        		( senderID, RSAPIN, PhoneNo, Message, ChannelCode ) VALUES ( @senderID, @pin, @phone, @msg, @channel )`);


            console.log('SMSResponse: ', paymentSMSRes);

            if (email) {
                const optionEmailThree = {
                    from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
                    to: email,
                    subject: `Request Status - ${dbAppInfo.benefit_type} Request`,
                    html: `
                                
                            <p>Dear ${capitalizeWords(firstName)},</p>
                                
                            <p>We are pleased to inform you that your application has been reviewed and approved. Payment instructions have been sent to the Custodian to credit your account within the next 24 hours.</p>
                            
                            <p>Thank you for your patience and for choosing Norrenberger Pensions.</p>
        
                            <p>Norrenberger Pensions Ltd</p>
                            `
                }

                transporter.sendMail(optionEmailThree, async function (err, info) {
                    if (err) {
                        console.log('EmailError: ', err);
                        return;
                    } else {
                        if (info.response) {
                            console.log('First email delivered successfully to client');
                        }
                    }
                });
            }

        }

    } catch (error) {
        console.log('Error: ', error);
    }

});

// RETURN ENDPOINT
router.put('/return-docs', async (req, res) => {
    const { appId, comment, userInfo, statusId } = req.body.params;

    const today = new Date();
    console.log('Returned endpoint Payload: ', req.body);

    const pool = await connectToDatabase('BenefitTracker_v2');

    const appInfoRes = await pool.request()
        .input('id', appId)
        .query(`
            SELECT id, status_id, last_reviewer, last_reviewer_id, benefit_type FROM BenefitTracker_v2.dbo.Applications
                WHERE id = @id`)

    const dbAppInfo = await appInfoRes.recordset[0];

    // Use client-provided status ID for optimistic locking check (if available)
    // Fallback to DB status for backward compatibility, but strictly check later if provided
    const clientStatusId = statusId !== undefined ? statusId : dbAppInfo.status_id;
    const currentStatusId = clientStatusId;

    if (currentStatusId === 3) return res.json({ data: 'The request is already with the Initiator.' });

    const returnTransitions = {
        1: 0,
        2: 3,
        3: 1,
        4: 5,
        5: 3,
        6: 7,
        7: 5,
        8: 9,
        9: 7,
        10: 11,
        11: 9,
        12: 13,
        13: 11,
        14: 15,
        15: 13,
        16: 17,
        17: 15,
        18: 19,
        19: 17,
        20: 21,
        21: 19,
        22: 23,
        23: 21,
        24: 25,
        25: 23,
    };

    //const nextStatusId = returnTransitions.currentStatusId;
    const nextStatusId = returnTransitions[currentStatusId];
    if (!nextStatusId) {
        throw new Error('Return not allowed from this status');
    }

    const nextLevelRes = await pool.request()
        .input('nextStatusId', nextStatusId)
        .query(`
            SELECT id, status_name, next_taskOwner_group_id FROM BenefitTracker_v2.dbo.Statuses
                WHERE id = @nextStatusId`)

    const nextLevelRow = await nextLevelRes.recordset[0];

    const firstAgentDetailRes = await pool.request()
        .input('appId', appId)
        .input('benefitType', dbAppInfo.benefit_type)
        .query(`
        SELECT log_id, prev_reviewer, prev_reviewer_id, action, applicant_rsa_pin FROM BenefitTracker_v2.dbo.ApplicationLog
            WHERE status_id = 2 AND appl_id = @appId AND benefit_type = @benefitType
            `)

    const firstAgentDetail = firstAgentDetailRes.recordset[0];

    const firstAgentId = firstAgentDetail.prev_reviewer_id;

    const nextPersonFrStatusesId = nextLevelRow.next_taskOwner_group_id;

    const nextStatusName = nextLevelRow.status_name;

    const nextTaskOwnerDetailRes = await pool.request()
        .input('id', nextPersonFrStatusesId)
        .query(`
            SELECT id, email, group_name AS name FROM BenefitTracker_v2.dbo.UserGroups
                WHERE id = @id`)

    const nextHandlerDetailFromStatuses = await nextTaskOwnerDetailRes.recordset[0];

    const nextTaskOwnerDetailIfPersonRes = await pool.request()
        .input('id', firstAgentId)
        .query(`
            SELECT id, email, name FROM BenefitTracker_v2.dbo.Users
                WHERE id = @id`)

    const nextTaskOwnerDetailIfPerson = nextTaskOwnerDetailIfPersonRes.recordset[0];

    const nextTaskOwnerEmail = nextStatusId < 4 ? nextTaskOwnerDetailIfPerson.email : nextHandlerDetailFromStatuses.email;
    const nextTaskOwnerId = nextStatusId < 4 ? nextTaskOwnerDetailIfPerson.id : nextHandlerDetailFromStatuses.id;
    const nextTaskOwnerName = nextStatusId < 4 ? nextTaskOwnerDetailIfPerson.name : nextHandlerDetailFromStatuses.name;
    console.log('NEXTREVIEWER: ', nextTaskOwnerEmail, nextTaskOwnerId, nextTaskOwnerName);

    try {
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        // 1️⃣ Lock row
        const lockRes = await new sql.Request(transaction)
            .input('appId', appId)
            .query(`
          SELECT status_id
          FROM BenefitTracker_v2.dbo.Applications WITH (UPDLOCK, ROWLOCK)
          WHERE id = @appId
        `);

        if (lockRes.recordset.length === 0) {
            throw new Error('Application not found');
        }

        const lockedStatusId = lockRes.recordset[0].status_id;

        // Check if status has changed since last read (Optimistic Locking)
        // If client provided statusId, strictly enforce it.
        // Otherwise, enforce consistent state with what we calculated
        if (statusId !== undefined && lockedStatusId !== statusId) {
            throw new Error('Application status has changed. Please refresh and try again.');
        }

        // Also ensure that the state hasn't changed from what we based our transition logic on
        if (lockedStatusId !== currentStatusId) {
            throw new Error('Application status has changed. Please refresh and try again.');
        }

        if (!nextStatusId) {
            throw new Error(`Return not allowed from status ${currentStatusId}`);
        }

        // 2️⃣ Guarded update (optimistic lock)
        const returnRes = await new sql.Request(transaction)
            .input('appId', appId)
            .input('comment', comment)
            .input('nextStatusId', nextStatusId)
            .input('nextStatus', nextStatusName)
            .input('nextTaskOwner', nextTaskOwnerName)
            .input('nextTaskOwnerId', nextTaskOwnerId)
            .input('lastReviewer', userInfo.name)
            .input('lastReviewerId', userInfo.id)
            .input('currentStatusId', currentStatusId)
            .query(`
          UPDATE BenefitTracker_v2.dbo.Applications
          SET
            status_id = @nextStatusId,
            status = @nextStatus,
            taskOwner = @nextTaskOwner,
            taskOwner_id = @nextTaskOwnerId,
            last_reviewer = @lastReviewer,
            last_reviewer_id = @lastReviewerId,
            comment = @comment,
            last_updated = GETDATE()
          OUTPUT inserted.*
          WHERE id = @appId
            AND status_id = @currentStatusId
        `);

        if (returnRes.rowsAffected[0] === 0) {
            throw new Error('Application already processed');
        }

        await transaction.commit();

        if (returnRes.rowsAffected > 0) {
            const returnedAppl = returnRes.recordset[0];
            const { id, applicant_name, applicant_rsa_pin,
                last_reviewer_id, last_reviewer, status_id,
                status, comment, doc_path, fund_type,
                benefit_type } = returnedAppl;

            const applLogRes = await pool.request()
                .input('applId', id)
                .input('applName', applicant_name)
                .input('applRsaPin', applicant_rsa_pin)
                .input('action', 'Returned')
                .input('prevReviewerId', last_reviewer_id)
                .input('prevReviewer', last_reviewer)
                .input('currentReviewer', nextTaskOwnerName)
                .input('currentReviewerId', nextTaskOwnerId)
                .input('statusId', status_id)
                .input('status', status)
                .input('comment', comment)
                .input('timestamp', today)
                .input('docPath', doc_path)
                .input('fundType', fund_type)
                .input('benefitType', benefit_type)
                .input('taskOwnerId', nextTaskOwnerId)
                .input('taskOwner', nextTaskOwnerName)
                .input('createdAt', today)
                .query(`
                    INSERT INTO BenefitTracker_v2.dbo.ApplicationLog
                    (appl_id, applicant_name, applicant_rsa_pin, action, prev_reviewer_id, prev_reviewer, 
                        current_reviewer_id, current_reviewer, status_id, status, comment, timestamp, doc_path, 
                        fund_type, benefit_type, taskOwner_id, taskOwner, created_at)
                    VALUES (@applId, @applName, @applRsaPin, @action, @prevReviewerId, @prevReviewer, 
                        @currentReviewerId, @currentReviewer, @statusId, @status, @comment, @timestamp,
                        @docPath, @fundType, @benefitType, @taskOwnerId, @taskOwner, @createdAt)
        `)


            const option = {
                from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
                to: nextTaskOwnerEmail,
                cc: `${userInfo.email}, sunday.efosa@norrenpensions.com`,
                subject: "Assigned Task - Returned Benefit Request",
                html: `
                        
                    <p>Dear ${nextTaskOwnerName},</p>
                        
                    <p>A new benefit request documentation you worked on is being returned to you for the following reason: </p>
                    <p>"${comment}"</p>
                    <p>Please review the documents and take the necessary actions. You can access the task details in the Benefit Tracker application.</p>
    
                    <p>Submitted by: ${userInfo.name} <br>
                    Branch: ${userInfo.branch}  <br>
                    Applicant: ${applicant_name},
                    RSA Pin: ${applicant_rsa_pin},
                    Benefit Type: ${dbAppInfo.benefit_type} </p>
    
                    <p>Thank you for your prompt attention to this matter.</p>
                    <p>Benefit Department</p>
                    <p>Norrenberger Pensions Ltd</p>
                    `
            }

            transporter.sendMail(option, async function (err, info) {
                if (err) {
                    console.log('EmailError: ', err);
                    return;
                } else {
                    if (info.response) {
                        console.log('Email Delivered successfully');
                    }
                }
            })
        }
    } catch (err) {
        await transaction.rollback();
        throw err;
    }

    res.status(200).json({ data: 'Returned to previous reviewer.' });

});

router.get('/last-status-id', async (req, res) => {
    try {
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const result = await poolB.request()
            .query(`
                SELECT MAX(id) AS last_status_id
                    FROM BenefitTracker_v2.dbo.Statuses;
                    `)

        const data = result.recordset[0].last_status_id;
        res.status(200).json(data)
    } catch (error) {

    }
});

router.put('/recall', async (req, res) => {
    const { appId, userInfo } = req.body.params;
    const comment = 'Recalled by reviewer';

    const today = new Date();

    const pool = await connectToDatabase('BenefitTracker_v2');

    const appInfoRes = await pool.request()
        .input('id', appId)
        .query(`
            SELECT id, status_id, last_reviewer, last_reviewer_id, benefit_type, taskOwner_id FROM BenefitTracker_v2.dbo.Applications
                WHERE id = @id`)

    const appInfo = await appInfoRes.recordset[0];
    const taskOwnerId = appInfo.taskOwner_id;

    const taskOwnerEmailRes = await pool.request()
        .input('id', taskOwnerId)
        .query(`
            SELECT email FROM BenefitTracker_v2.dbo.UserGroups
                WHERE id = @id
            `)

    const groupEmail = await taskOwnerEmailRes.recordset[0].email



    const taskOwnerEmailResSearch = await pool.request()
        .input('id', taskOwnerId)
        .query(`
            SELECT email FROM BenefitTracker_v2.dbo.Users
                WHERE id = @id
            `)

    const userEmail = await taskOwnerEmailResSearch.recordset[0].email


    const taskOwnerEmail = taskOwnerId > 40 ? userEmail : groupEmail;

    const currentStatusId = appInfo.status_id;
    const nextStatusId = currentStatusId % 2 === 0 ? currentStatusId - 2 : currentStatusId - 1;

    const returnRes = await pool.request()
        .input('appId', appId)
        .input('comment', comment)
        .input('nextStatusId', nextStatusId)
        .input('nextStatus', 'Recalled by reviewer')
        .input('nextTaskOwner', userInfo.name)
        .input('nextTaskOwnerId', userInfo.id)
        .input('lastReviewer', userInfo.name)
        .input('lastReviewerId', userInfo.id)
        .query(`
                UPDATE BenefitTracker_v2.dbo.Applications
                    SET status_id = @nextStatusId,
                        status = @nextStatus,
                        taskOwner = @nextTaskOwner,
                        taskOwner_id = @nextTaskOwnerId,
                        last_reviewer = @lastReviewer,
                        last_reviewer_id = @lastReviewerId,
                        comment = @comment,
                        last_updated = GETDATE()
                    OUTPUT
                        inserted.*
                    WHERE id = @appId`);

    if (returnRes.rowsAffected > 0) {
        const returnedAppl = returnRes.recordset[0];

        const applLogRes = await pool.request()
            .input('applId', returnedAppl.id)
            .input('applName', returnedAppl.applicant_name)
            .input('applRsaPin', returnedAppl.applicant_rsa_pin)
            .input('action', 'Recalled by Reviewer')
            .input('prevReviewerId', returnedAppl.last_reviewer_id)
            .input('prevReviewer', returnedAppl.last_reviewer)
            .input('currentReviewer', userInfo.name)
            .input('currentReviewerId', userInfo.id)
            .input('statusId', returnedAppl.status_id)
            .input('status', returnedAppl.status)
            .input('comment', returnedAppl.comment)
            .input('timestamp', today)
            .input('docPath', returnedAppl.doc_path)
            .input('fundType', returnedAppl.fund_type)
            .input('benefitType', returnedAppl.benefit_type)
            .input('taskOwnerId', userInfo.id)
            .input('taskOwner', userInfo.name)
            .input('createdAt', today)
            .query(`
                    INSERT INTO BenefitTracker_v2.dbo.ApplicationLog
                    (appl_id, applicant_name, applicant_rsa_pin, action, prev_reviewer_id, prev_reviewer, 
                        current_reviewer_id, current_reviewer, status_id, status, comment, timestamp, doc_path, 
                        fund_type, benefit_type, taskOwner_id, taskOwner, created_at)
                    VALUES (@applId, @applName, @applRsaPin, @action, @prevReviewerId, @prevReviewer, 
                        @currentReviewerId, @currentReviewer, @statusId, @status, @comment, @timestamp,
                        @docPath, @fundType, @benefitType, @taskOwnerId, @taskOwner, @createdAt)
                    `)
    }

    const option = {
        from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
        to: `${userInfo.email}`,
        cc: `${taskOwnerEmail}`,
        subject: "Recalled By Reviewer - Benefit Request",
        html: `
                    
                <p>Dear ${userInfo.name},</p>
                    
                <p>The benefit request documentation you assigned to the next reviewer has been successfully recalled.</p>
                <p>Please review the documents and take the necessary actions. You can access the task details in the Benefit Tracker application.</p>

                <p>Submitted by: ${userInfo.name} <br>
                Branch: ${userInfo.branch}  <br>
                Benefit Type: ${appInfo.benefit_type} </p>

                <p>Thank you for your prompt attention to this matter.</p>
                <p>Benefit Department</p>
                <p>Norrenberger Pensions Ltd</p>
                `
    }

    transporter.sendMail(option, async function (err, info) {
        if (err) {
            console.log('EmailError: ', err);
            return;
        } else {
            if (info.response) {
                console.log('Email Delivered successfully');
            }
        }
    })

    res.status(200).json({ data: 'Recalled successfully.' });
});

router.get('/application', async (req, res) => {
    const { appId, agentName, userId } = req.query;
    const id = parseInt(appId);

    const poolB = await connectToDatabase('BenefitTracker_v2');

    const result = await poolB.request()
        .input('appId', id)
        .query(`
            SELECT * FROM BenefitTracker_v2.dbo.Applications
                WHERE id = @appId`)

    const application = result.recordset;

    const data = [];

    for (const app of application) {
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
            employer: employerName,
            age,
            approvedBy: app.last_reviewer,
            phone: app.applicant_phone,
            statusId: app.status_id,
            status: app.status,
            taskOwner: app.taskOwner,
            taskOwnerId: app.taskOwner_id,
            docId: app.doc_id,
            docPath: app.doc_path,
            folderPath: app.folder_path,
            folderId: app.folder_id,
            gender: app.gender,
            fundType: app.fund_type,
            comment: app.comment
        };

        data.push(appl);
    }

    res.json(data);

})



module.exports = router;




/**
 * Get access token for NEW tenant (norrenpensions)
 * All new uploads go to the new tenant
 */
// async function getAccessToken() {
//     const newTenantConfig = getNewTenantConfig();
//     return getAccessTokenForTenant(newTenantConfig);
// }

// /**
//  * Get tenant configuration for new uploads (always new tenant)
//  */
// function getTenantConfigForNewUpload() {
//     return getNewTenantConfig();
// }

