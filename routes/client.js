const express = require('express');
const router = express.Router();
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const sql = require('mssql');
const { connectToDatabase } = require('./dbconnection');
const transporter = require("../utility/EmailTransporter");
const capitalizeWords = require('./capitalizeWords');
const multer = require("multer");
const formatPhoneNumber = require('../utility/formatPhoneNum');
const normalizePin = require('../utility/normalizedPin');
const { getAccessToken } = require('../utility/sharepointAuth');

const siteId = process.env.SITE_ID;
const driveId = process.env.DRIVE_ID;
const clientUpdateDriveId = process.env.CLIENT_UPDATE_DRIVE_ID;
const baseUrl = process.env.BASE_URL;

// Configure multer to store uploaded files in memory (or a tmp folder)
const upload = multer({ storage: multer.memoryStorage() });

/* ========== Local File Helpers ========== */

async function safeUnlink(filePath) {
    try {
        await fs.promises.unlink(filePath);
        console.log(`Deleted temp file: ${filePath}`);
    } catch (err) {
        console.error(`Failed to delete temp file ${filePath}:`, err.message);
    }
}

/* ========== SharePoint Helpers ========== */

const CLIENT_UPDATES_PARENT = 'Client-Detail-Updates';

/**
 * Ensures the parent "Client-Detail-Updates" folder exists.
 * Uses conflictBehavior: fail — if it already exists the error is caught and ignored,
 * so this is safe to call on every request.
 */
async function ensureParentFolder(accessToken) {
    const url = `${baseUrl}/${clientUpdateDriveId}/root/children`;
    try {
        await axios.post(
            url,
            { name: CLIENT_UPDATES_PARENT, folder: {}, "@microsoft.graph.conflictBehavior": "fail" },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log(`SharePoint: Created parent folder '${CLIENT_UPDATES_PARENT}'`);
    } catch (error) {
        // 409 Conflict means folder already exists — that's fine
        if (error.response && error.response.status === 409) {
            console.log(`SharePoint: Parent folder '${CLIENT_UPDATES_PARENT}' already exists, skipping creation.`);
        } else {
            console.error('Error ensuring parent folder:', error.response ? error.response.data : error.message);
            throw new Error('Failed to ensure parent SharePoint folder');
        }
    }
}

/**
 * Creates a per-customer subfolder inside the parent folder.
 * conflictBehavior: rename means a second update from the same customer
 * won't overwrite — it will create a numbered copy.
 */
async function createCustomerFolder(accessToken, customerFolderName) {
    const url = `${baseUrl}/${clientUpdateDriveId}/root:/${encodeURIComponent(CLIENT_UPDATES_PARENT)}:/children`;
    try {
        const response = await axios.post(
            url,
            { name: customerFolderName, folder: {}, "@microsoft.graph.conflictBehavior": "rename" },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        return response.data;
    } catch (error) {
        console.error('Error creating customer folder:', error.response ? error.response.data : error.message);
        throw new Error('Failed to create customer SharePoint folder');
    }
}

/**
 * Uploads the file into the customer's subfolder.
 */
async function uploadClientDocToSharePoint(accessToken, customerFolderName, file) {
    const fileName = encodeURIComponent(file.originalname);
    const uploadUrl = `${baseUrl}/${clientUpdateDriveId}/root:/${encodeURIComponent(CLIENT_UPDATES_PARENT)}/${encodeURIComponent(customerFolderName)}/${fileName}:/content`;
    const fileBuffer = await fs.promises.readFile(file.path);

    const response = await axios.put(uploadUrl, fileBuffer, {
        headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': file.mimetype || 'application/octet-stream',
            'Accept': 'application/json',
        },
    });
    return response.data;
}

const clientUpload = multer({
    storage: multer.diskStorage({
        destination: "uploads/",
        filename: (req, file, cb) => {
            cb(null, `${Date.now()}-${file.originalname}`);
        },
    }),
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
    },
    fileFilter: (req, file, cb) => {
        const allowedMimeTypes = [
            "application/pdf",
            "image/jpeg",
            "image/png",
        ];

        if (!allowedMimeTypes.includes(file.mimetype)) {
            return cb(
                new Error("Only PDF, JPG, and PNG files are allowed"),
                false
            );
        }

        cb(null, true);
    },
});

//
// Handle situations where a client does not have an email or phone number
router.post('/send-otp-to-email', async (req, res) => {
    const { pin } = req.body.params;
    const npin = normalizePin(pin);

    try {
        const pool = await connectToDatabase('PFA');
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const clientDetailRes = await pool.request()
            .input('pin', sql.VarChar(30), npin)
            .query(`
                SELECT PIN, EMAIL, TITLE, SURNAME, FIRSTNAME, OTHERNAMES, MOBILE_PHONE FROM PFA.dbo.EMPLOYEES
                WHERE PIN = @pin OR MOBILE_PHONE = @pin`);

        const clientDetail = clientDetailRes.recordset[0];

        if (!clientDetail) return res.json({ message: 'Invalid user or incorrect RSA pin.' });

        const rsaPin = clientDetail.PIN;

        const existingApplicationRes = await poolB.request()
            .input('pin', rsaPin)
            .query(`
                SELECT TOP 1 id
                FROM BenefitTracker_v2.dbo.Applications
                WHERE applicant_rsa_pin = @pin
            `);

        if (!existingApplicationRes.recordset || existingApplicationRes.recordset.length === 0) {
            return res.status(404).json({
                message: 'You have not submitted a benefit request yet or your request has not been entered into the system.',
                status: 404,
            });
        }

        const min = 200000;
        const max = 900000;
        const otp = Math.floor(Math.random() * (max - min) + min);

        const findClientRes = await poolB.request()
            .input('pin', rsaPin)
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Clients
                    WHERE rsa_pin = @pin`)

        const clientFound = findClientRes.rowsAffected[0] > 0;
        const today = new Date();

        if (clientFound) {
            const existingClient = findClientRes.recordset[0];
            if (existingClient && existingClient.otp && existingClient.otp_createdAt) {
                const secondsPassed = (today - new Date(existingClient.otp_createdAt)) / 1000;
                if (secondsPassed < 60) {
                    return res.json({ message: 'An OTP was recently generated. Please wait 60 seconds before requesting another.', status: 429 });
                }
            }
        }

        if (!clientFound) {
            const clientCreationRes = await poolB.request()
                .input('rsa_pin', rsaPin)
                .input('surname', clientDetail.SURNAME)
                .input('firstname', clientDetail.FIRSTNAME)
                .input('othernames', clientDetail.OTHERNAMES)
                .input('email', clientDetail.EMAIL)
                .input('mobile_phone', clientDetail.MOBILE_PHONE)
                .input('otp', otp)
                .input('otp_createdAt', today)
                .input('createdAt', today)
                .query(`
        INSERT INTO BenefitTracker_v2.dbo.Clients (rsa_pin, surname, firstname, othernames, email, mobile_phone, otp, otp_createdAt, createdAt)
        VALUES (@rsa_pin, @surname, @firstname, @othernames, @email, @mobile_phone, @otp, @otp_createdAt, @createdAt)
            `);
        }

        if (clientFound) {
            const clientOtpUpdateRes = await poolB.request()
                .input('rsa_pin', rsaPin)
                .input('otp', otp)
                .input('otp_createdAt', today)
                .query(`
                    UPDATE BenefitTracker_v2.dbo.Clients
                    SET otp = @otp,
                        otp_createdAt = @otp_createdAt
                    WHERE rsa_pin = @rsa_pin`)
        }

        if (!clientDetail.EMAIL) return res.json({ message: 'We do not have your email address in our record. Kindly complete an update form to have your email address added to your record with Norrenberger Pensions. In the meantime, you may try the SMS option to verify your account.' })

        if (clientDetail.EMAIL) {
            const { EMAIL: clientEmail, TITLE, SURNAME, FIRSTNAME, OTHERNAMES } = clientDetail;

            const clientName = `${TITLE} ${FIRSTNAME} ${SURNAME}`;
            const name = capitalizeWords(clientName);

            const option = {
                from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
                to: clientEmail,
                subject: "Account Verification",
                html: `
				
				<b>Dear ${name},</b>
				
				<p>Use this one-time-pin(OTP) <Strong style="padding:3px; margin-right:3px; font-size:1.2em; background:blue; color: white">${otp} </strong> for verification on the NPL Benefit Tracker platform.</p>
                <p>If you did not initiate this OTP generation, please immediately contact Norrenberger Pension customer service on 07002200300.</p>
				<p>Thank You.</p>
                <p>Norrenberger Pensions Ltd</p>
				`
            }

            transporter.sendMail(option, async function (err, info) {
                if (err) {
                    console.log(err)
                    return res.status(500).json({ message: 'Error sending OTP email.' });
                }
                else {
                    return res.json({ message: 'OTP successfully sent.', status: 200 });
                }
            });
        } else {
            return res.json({ message: 'Error sending OTP.' });
        }

    } catch (error) {
        console.log('Server error: ', error);
    }

});


router.post('/send-otp-via-sms', async (req, res) => {
    const { pin } = req.body.params;
    const npin = normalizePin(pin);
    console.log('SMSpIN: ', npin);

    const min = 200000
    const max = 900000
    const otp = Math.floor(Math.random() * (max - min) + min)

    try {
        const pool = await connectToDatabase('PFA');
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const clientDetailRes = await pool.request()
            .input('pin', sql.VarChar(30), npin)
            .query(`
                SELECT PIN, EMAIL, TITLE, SURNAME, FIRSTNAME, OTHERNAMES, MOBILE_PHONE FROM PFA.dbo.EMPLOYEES
                WHERE PIN = @pin OR MOBILE_PHONE = @pin`);

        const clientDetail = clientDetailRes.recordset[0];

        if (!clientDetail) return res.json({ message: 'Invalid user or incorrect RSA pin.' });

        const rsaPin = clientDetail.PIN;
        const findClientRes = await poolB.request()
            .input('pin', rsaPin)
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Clients
                    WHERE rsa_pin = @pin`)

        const clientFound = findClientRes.rowsAffected[0] > 0;
        const today = new Date();

        if (clientFound) {
            const existingClient = findClientRes.recordset[0];
            if (existingClient && existingClient.otp && existingClient.otp_createdAt) {
                const secondsPassed = (today - new Date(existingClient.otp_createdAt)) / 1000;
                if (secondsPassed < 60) {
                    return res.json({ message: 'An OTP was recently generated. Please wait 60 seconds before requesting another.', status: 429 });
                }
            }
        }

        if (!clientFound) {
            const clientCreationRes = await poolB.request()
                .input('rsa_pin', rsaPin)
                .input('surname', clientDetail.SURNAME)
                .input('firstname', clientDetail.FIRSTNAME)
                .input('othernames', clientDetail.OTHERNAMES)
                .input('email', clientDetail.EMAIL)
                .input('mobile_phone', clientDetail.MOBILE_PHONE)
                .input('otp', otp)
                .input('otp_createdAt', today)
                .input('createdAt', today)
                .query(`
                    INSERT INTO BenefitTracker_v2.dbo.Clients (rsa_pin, surname, firstname, othernames, email, mobile_phone, otp, otp_createdAt, createdAt)
                    VALUES (@rsa_pin, @surname, @firstname, @othernames, @email, @mobile_phone, @otp, @otp_createdAt, @createdAt)
            `);
            // Check the insert result
            if (clientCreationRes.rowsAffected[0] <= 0) {
                return res.status(500).json({ message: 'Failed to create client record.' });
            }
        }

        if (clientFound) {
            const clientOtpUpdateRes = await poolB.request()
                .input('rsa_pin', rsaPin)
                .input('otp', otp)
                .input('otp_createdAt', today)
                .query(`
                    UPDATE BenefitTracker_v2.dbo.Clients
                    SET otp = @otp,
                        otp_createdAt = @otp_createdAt
                    WHERE rsa_pin = @rsa_pin`);

            if (clientOtpUpdateRes.rowsAffected[0] <= 0) {
                return res.status(500).json({ message: 'Failed to update client record.' });
            }
        }

        if (!clientDetail.MOBILE_PHONE) {
            return res.json({ message: 'We do not have your phone number in our record. Kindly complete an update form to have your mobile phone number added to your record with Norrenberger Pensions. In the meantime, you may try the email option to verify your account.' });
        }

        const { MOBILE_PHONE: phone } = clientDetail;
        const phoneNum = formatPhoneNumber(phone);
        console.log("phone: ", phone);
        console.log("formatted phoneNum: ", phoneNum);

        const channel = "BNTR"
        const senderID = "NorrenPens"
        const msg = `Your One Time Password (OTP) for Norrenberger Benefit Tracker verification is :${otp}. It expires in 10 minutes.`

        const sendOtp = await pool.request()
            .input('pin', sql.VarChar(20), rsaPin)
            .input('phone', sql.VarChar(15), phoneNum)
            .input('msg', sql.VarChar(250), msg)
            .input('channel', sql.VarChar(20), channel)
            .input('senderID', sql.VarChar(20), senderID)
            .query(`INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER 
        		( senderID, RSAPIN, PhoneNo, Message, ChannelCode )
                VALUES ( @senderID, @pin, @phone, @msg, @channel )`)

        console.log('otpRes: ', sendOtp);
        return res.json({ message: 'OTP successfully sent.', status: 200 });

    } catch (error) {
        console.log('Server error: ', error);
    }
})

router.post('/web-send-otp', async (req, res) => {
    const { pin } = req.body.params;
    const npin = normalizePin(pin);
    console.log('SMSpIN: ', npin);

    const min = 200000
    const max = 900000
    const otp = Math.floor(Math.random() * (max - min) + min)

    try {
        const pool = await connectToDatabase('PFA');
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const clientDetailRes = await pool.request()
            .input('pin', sql.VarChar(30), npin)
            .query(`
                SELECT PIN, EMAIL, TITLE, SURNAME, FIRSTNAME, OTHERNAMES, MOBILE_PHONE FROM PFA.dbo.EMPLOYEES
                WHERE PIN = @pin OR MOBILE_PHONE = @pin`);

        const clientDetail = clientDetailRes.recordset[0];

        if (!clientDetail) return res.json({ message: 'Invalid user or incorrect RSA pin.' });

        const rsaPin = clientDetail.PIN;
        const findClientRes = await poolB.request()
            .input('pin', rsaPin)
            .query(`
                SELECT * FROM BenefitTracker_v2.dbo.Clients
                    WHERE rsa_pin = @pin`)

        const clientFound = findClientRes.rowsAffected[0] > 0;
        const today = new Date();

        if (clientFound) {
            const existingClient = findClientRes.recordset[0];
            if (existingClient && existingClient.otp && existingClient.otp_createdAt) {
                const secondsPassed = (today - new Date(existingClient.otp_createdAt)) / 1000;
                if (secondsPassed < 60) {
                    return res.json({ message: 'An OTP was recently generated. Please wait 60 seconds before requesting another.', status: 429 });
                }
            }
        }

        if (!clientFound) {
            const clientCreationRes = await poolB.request()
                .input('rsa_pin', rsaPin)
                .input('surname', clientDetail.SURNAME)
                .input('firstname', clientDetail.FIRSTNAME)
                .input('othernames', clientDetail.OTHERNAMES)
                .input('email', clientDetail.EMAIL)
                .input('mobile_phone', clientDetail.MOBILE_PHONE)
                .input('otp', otp)
                .input('otp_createdAt', today)
                .input('createdAt', today)
                .query(`
                    INSERT INTO BenefitTracker_v2.dbo.Clients (rsa_pin, surname, firstname, othernames, email, mobile_phone, otp, otp_createdAt, createdAt)
                    VALUES (@rsa_pin, @surname, @firstname, @othernames, @email, @mobile_phone, @otp, @otp_createdAt, @createdAt)
            `);
            // Check the insert result
            if (clientCreationRes.rowsAffected[0] <= 0) {
                return res.status(500).json({ message: 'Failed to create client record.' });
            }
        }

        if (clientFound) {
            const clientOtpUpdateRes = await poolB.request()
                .input('rsa_pin', rsaPin)
                .input('otp', otp)
                .input('otp_createdAt', today)
                .query(`
                    UPDATE BenefitTracker_v2.dbo.Clients
                    SET otp = @otp,
                        otp_createdAt = @otp_createdAt
                    WHERE rsa_pin = @rsa_pin`);

            if (clientOtpUpdateRes.rowsAffected[0] <= 0) {
                return res.status(500).json({ message: 'Failed to update client record.' });
            }
        }

        if (!clientDetail.MOBILE_PHONE) {
            return res.json({ message: 'We do not have your phone number in our record. Kindly complete an update form to have your mobile phone number added to your record with Norrenberger Pensions. In the meantime, you may try the email option to verify your account.' });
        }

        const { MOBILE_PHONE: phone } = clientDetail;
        const phoneNum = formatPhoneNumber(phone);
        console.log("phone: ", phone);
        console.log("formatted phoneNum: ", phoneNum);

        const channel = "BNTR"
        const senderID = "NorrenPens"
        const msg = `Your One Time Password (OTP) for Norrenberger Benefit Tracker verification is :${otp} `

        const sendOtp = await pool.request()
            .input('pin', sql.VarChar(20), rsaPin)
            .input('phone', sql.VarChar(15), phoneNum)
            .input('msg', sql.VarChar(250), msg)
            .input('channel', sql.VarChar(20), channel)
            .input('senderID', sql.VarChar(20), senderID)
            .query(`INSERT INTO SMS_SERVER.SmartSMSNotification.dbo.tbl_SMS2MEMBER 
            ( senderID, RSAPIN, PhoneNo, Message, ChannelCode )
            VALUES ( @senderID, @pin, @phone, @msg, @channel )`)

        console.log('otpRes: ', sendOtp);

        if (!clientDetail.EMAIL) {
            return res.json({ message: 'We do not have your email address in our record. Kindly complete an update form to have your email address added to your record with Norrenberger Pensions. In the meantime, you may try the SMS option to verify your account.' });
        }

        const { EMAIL: clientEmail, TITLE, SURNAME, FIRSTNAME } = clientDetail;

        const clientName = `${TITLE} ${FIRSTNAME} ${SURNAME}`;
        const name = capitalizeWords(clientName);

        const option = {
            from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
            to: clientEmail,
            subject: "Account Verification",
            html: `
            
                      <b>Dear ${name},</b>

                      <p>Use this one-time-pin(OTP) <Strong style="padding:3px; margin-right:3px; font-size:1.2em; background:blue; color: white">${otp} </strong> for verification on the NPL Benefit Tracker platform.</p>
                      <p>If you did not initiate this OTP generation, please immediately contact Norrenberger Pension customer service on 07002200300.</p>
                      <p>Thank You.</p>
                      <p>Norrenberger Pensions Ltd</p>
                      `
        }

        transporter.sendMail(option, async function (err, info) {
            if (err) {
                console.log(err)
                return res.status(500).json({ message: 'Failed to send OTP email.' });
            }
            else {
                return res.json({ message: 'OTP successfully sent.', status: 200 });
            }
        });

    } catch (error) {
        console.log('Server error: ', error);
    }
})


router.post('/verify-otp', async (req, res) => {
    const { pin, otp } = req.body.params;
    const npin = normalizePin(pin);
    const normalizedOtp = String(otp).trim();

    const poolB = await connectToDatabase('BenefitTracker_v2');

    const savedOtpRes = await poolB.request()
        .input('pin', npin)
        .query(`
            SELECT otp AS savedOtp, rsa_pin AS rsaPin, otp_createdAt FROM BenefitTracker_v2.dbo.Clients
                WHERE rsa_pin = @pin OR mobile_phone = @pin`)

    if (!savedOtpRes.recordset || savedOtpRes.recordset.length === 0) {
        return res.json({ message: "Invalid OTP or request not found.", status: 400 });
    }

    const { savedOtp, rsaPin, otp_createdAt } = savedOtpRes.recordset[0];

    if (normalizedOtp === String(savedOtp).trim()) {
        const otpExpiryMinutes = 10;
        const now = new Date();
        const otpTime = new Date(otp_createdAt);
        const diffMins = (now - otpTime) / (1000 * 60);

        if (!otp_createdAt || diffMins > otpExpiryMinutes) {
            await poolB.request()
                .input('pin', rsaPin)
                .query(`
                    UPDATE BenefitTracker_v2.dbo.Clients
                        SET otp = NULL, otp_createdAt = NULL
                        WHERE rsa_pin = @pin`);
            return res.json({ message: "OTP has expired. Please request a new one.", status: 400 });
        }

        await poolB.request()
            .input('pin', rsaPin)
            .query(`
                UPDATE BenefitTracker_v2.dbo.Clients
                    SET otp = NULL, otp_createdAt = NULL
                    WHERE rsa_pin = @pin`);

        const result = await poolB.request()
            .input('pin', rsaPin)
            .query(`
                SELECT TOP 1 status, status_id, benefit_type, applicant_name, application_date 
                    FROM BenefitTracker_v2.dbo.Applications
                    WHERE applicant_rsa_pin = @pin
                    ORDER BY application_date DESC`)

        if (result.recordset && result.recordset.length > 0) {
            const { status, status_id, benefit_type, applicant_name, application_date } = result.recordset[0];
            return res.json({
                data: {
                    statusId: status_id,
                    status,
                    benefitType: benefit_type,
                    applicantName: applicant_name,
                    appDate: application_date
                }, message: "Correct OTP submitted.", status: 200
            });
        }

        return res.json({ message: "OTP verified successfully. No benefit request was found for this applicant yet.", status: 200 });

    } else {
        console.log('Is OTP correct: ', normalizedOtp === String(savedOtp).trim());
        return res.json({ message: "Incorrect OTP", status: 400 });
    }

    console.log('otp: ', savedOtp);

});

router.post('/web-verify-otp', async (req, res) => {
    const { pin, otp } = req.body.params;
    const npin = normalizePin(pin);

    const pool = await connectToDatabase('PFA');
    const poolB = await connectToDatabase('BenefitTracker_v2');

    const savedOtpRes = await poolB.request()
        .input('pin', npin)
        .query(`
            SELECT otp AS savedOtp, rsa_pin AS rsaPin, otp_createdAt FROM BenefitTracker_v2.dbo.Clients
                WHERE rsa_pin = @pin OR mobile_phone = @pin`)

    if (!savedOtpRes.recordset || savedOtpRes.recordset.length === 0) {
        return res.json({ message: "Invalid OTP or request not found.", status: 400 });
    }

    const { savedOtp, rsaPin, otp_createdAt } = savedOtpRes.recordset[0];

    if (otp == savedOtp) {
        const otpExpiryMinutes = 10;
        const now = new Date();
        const otpTime = new Date(otp_createdAt);
        const diffMins = (now - otpTime) / (1000 * 60);

        if (!otp_createdAt || diffMins > otpExpiryMinutes) {
            await poolB.request()
                .input('pin', rsaPin)
                .query(`
                    UPDATE BenefitTracker_v2.dbo.Clients
                        SET otp = NULL, otp_createdAt = NULL
                        WHERE rsa_pin = @pin`);
            return res.json({ message: "OTP has expired. Please request a new one.", status: 400 });
        }

        await poolB.request()
            .input('pin', rsaPin)
            .query(`
                UPDATE BenefitTracker_v2.dbo.Clients
                    SET otp = NULL, otp_createdAt = NULL
                    WHERE rsa_pin = @pin`);

        const result = await pool.request()
            .input('pin', sql.VarChar(30), rsaPin)
            .query(`
                SELECT 
                    E.PIN AS rsa_pin,
                    E.EMAIL AS email,
                    E.SURNAME AS surname,
                    E.FIRSTNAME AS firstname,
                    E.OTHERNAMES AS othername,
                    E.MOBILE_PHONE AS phone,
                    E.SSN AS nin,
                    E.BVN AS bvn,
                    S.DESCRIPTION AS state,
                    E.EMPLOYER_NAME AS employer,
                    E.EMPLOYER_RCNO AS employer_code
                    FROM PFA.dbo.EMPLOYEES E
                    LEFT JOIN PFA.dbo.STATES S
                        ON E.STATE_OF_POSTING = S.CODE
                    WHERE E.PIN = @pin;
                    `);

        // const clientDetail = result.recordset[0];

        if (result.rowsAffected[0] > 0) {
            const { rsa_pin, email, surname, firstname, othername, phone, bvn, nin, state, employer, employer_code } = result.recordset[0];
            res.json({
                details: {
                    rsa_pin,
                    email,
                    surname,
                    firstname,
                    othername,
                    phone,
                    nin,
                    bvn,
                    state,
                    employer,
                    employer_code,
                }, message: "Correct OTP submitted.", status: 200
            })
        }

    } else {
        console.log('Is OTP correct: ', otp == savedOtp);
        res.json({ message: "Incorrect OTP" });
    }

    console.log('otp: ', savedOtp);

});

router.post('/update-client-details', clientUpload.single("employmentProof"), async (req, res) => {

    try {
        const { phone, email, state, bvn, nin, pin, employer, employer_code } = req.body;
        console.log("BODY: ", phone, email, state, bvn, nin, pin, employer, employer_code);
        const file = req.file;
        console.log('File: ', file);
        let rsaPin = normalizePin(pin);
        const stateOfPosting = state.trim().slice(0, 2);
        const phoneNum = phone.trim();
        const bvnNum = bvn.trim();
        const ninNum = nin.trim();
        const emailAddr = email.trim();

        const pool = await connectToDatabase('PFA');
        const existingClientRes = await pool.request()
            .input("pin", rsaPin)
            .query(`
    SELECT PIN, SURNAME, FIRSTNAME, MOBILE_PHONE, EMAIL, BVN, SSN, STATE_OF_POSTING,
      EMPLOYER_NAME, EMPLOYER_RCNO
    FROM PFA.DBO.EMPLOYEES
    WHERE PIN = @pin
  `);

        const existingClient = existingClientRes.recordset?.[0];

        if (!existingClient) {
            return res.status(404).json({ msg: "Client not found" });
        }

        const oldData = {
            phone: existingClient.MOBILE_PHONE,
            email: existingClient.EMAIL,
            bvn: existingClient.BVN,
            nin: existingClient.SSN,
            state: existingClient.STATE_OF_POSTING,
            employer: existingClient.EMPLOYER_NAME,
            employer_code: existingClient.EMPLOYER_RCNO,
        };

        const clientDetailsUpdateRes = await pool.request()
            .input("phone", phoneNum)
            .input("email", emailAddr)
            .input("state", stateOfPosting)
            .input("bvn", bvnNum)
            .input("nin", ninNum)
            .input("pin", rsaPin)
            .input("employer", employer)
            .input("employer_code", employer_code)
            .query(`UPDATE PFA.DBO.EMPLOYEES
              SET MOBILE_PHONE = @phone,
                  EMAIL = @email, 
                  BVN = @bvn,
                  SSN = @nin,
                  STATE_OF_POSTING = @state,
                  EMPLOYER_NAME = @employer,
                  EMPLOYER_RCNO = @employer_code
              WHERE PIN = @pin`);

        const updateRes = clientDetailsUpdateRes.rowsAffected;

        const renderRow = (label, oldVal, newVal) => `
     <tr>
       <td style="padding:8px;border:1px solid #ccc;"><b>${label}</b></td>
       <td style="padding:8px;border:1px solid #ccc;">${oldVal || "-"}</td>
       <td style="padding:8px;border:1px solid #ccc;">${newVal || "-"}</td>
     </tr>
    `;

        console.log('UpdateResult: ', updateRes);
        if (updateRes) {
            // ---- Log transaction to ClientDetailsUpdates ----
            try {
                const poolB = await connectToDatabase('BenefitTracker_v2');
                await poolB.request()
                    .input("rsa_pin", rsaPin)
                    .input("old_phone", oldData.phone)
                    .input("new_phone", phoneNum)
                    .input("old_email", oldData.email)
                    .input("new_email", emailAddr)
                    .input("old_state", oldData.state)
                    .input("new_state", stateOfPosting)
                    .input("old_bvn", oldData.bvn)
                    .input("new_bvn", bvnNum)
                    .input("old_nin", oldData.nin)
                    .input("new_nin", ninNum)
                    .input("old_employer", oldData.employer)
                    .input("new_employer", employer)
                    .input("old_employer_code", oldData.employer_code)
                    .input("new_employer_code", employer_code)
                    .input("attachment_name", file ? file.originalname : null)
                    .input("created_at", new Date())
                    .query(`
                        INSERT INTO BenefitTracker_v2.dbo.ClientDetailsUpdates (
                            rsa_pin, old_phone, new_phone, old_email, new_email,
                            old_state, new_state, old_bvn, new_bvn, old_nin, new_nin,
                            old_employer, new_employer, old_employer_code, new_employer_code,
                            attachment_name, created_at
                        ) VALUES (
                            @rsa_pin, @old_phone, @new_phone, @old_email, @new_email,
                            @old_state, @new_state, @old_bvn, @new_bvn, @old_nin, @new_nin,
                            @old_employer, @new_employer, @old_employer_code, @new_employer_code,
                            @attachment_name, @created_at
                        )
                    `);
                console.log("Transaction successfully logged to ClientDetailsUpdates.");
            } catch (logErr) {
                console.error("Failed to log transaction to ClientDetailsUpdates (non-fatal):", logErr.message);
            }

            // ---- SharePoint Archiving ----
            let sharePointArchived = false;
            if (file) {
                try {
                    const surname = (existingClient.SURNAME || '').replace(/\s+/g, '');
                    const firstname = (existingClient.FIRSTNAME || '').replace(/\s+/g, '');
                    // e.g. SMITH-JOHN-PEN123456789
                    const customerFolderName = `${surname}-${firstname}-${rsaPin}`;

                    const accessToken = await getAccessToken();

                    // Step 1: Ensure the parent "Client-Detail-Updates" folder exists
                    await ensureParentFolder(accessToken);

                    // Step 2: Create the per-customer subfolder inside the parent
                    await createCustomerFolder(accessToken, customerFolderName);

                    // Step 3: Upload the file into the customer subfolder
                    await uploadClientDocToSharePoint(accessToken, customerFolderName, file);

                    console.log(`File archived to SharePoint: ${CLIENT_UPDATES_PARENT}/${customerFolderName}`);
                    sharePointArchived = true;
                } catch (spErr) {
                    console.error('SharePoint archiving failed (non-fatal):', spErr.message);
                }
            }

            const option = {
                from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
                to: `olayemi.abunsango@norrenpensions.com; clientservice@norrenpensions.com`,
                subject: "Client Detail Update from NPL Website",
                html: `
                <p><b>Dear CX Team,</b></p>

                <p>A customer has updated their details via the NPL website.</p>

                <p><b>RSA PIN:</b> ${existingClient.PIN}</p>

                  <table style="border-collapse:collapse;width:100%;margin-top:10px;">
                    <thead>
                      <tr>
                        <th style="padding:8px;border:1px solid #ccc;">Field</th>
                        <th style="padding:8px;border:1px solid #ccc;">Old Value</th>
                        <th style="padding:8px;border:1px solid #ccc;">New Value</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${renderRow("Phone Number", oldData.phone, phoneNum)}
                      ${renderRow("Email", oldData.email, emailAddr)}
                      ${renderRow("BVN", oldData.bvn, bvnNum)}
                      ${renderRow("NIN", oldData.nin, ninNum)}
                      ${renderRow("State of Posting", oldData.state, stateOfPosting)}
                      ${renderRow("Employer", oldData.employer, employer)}
                      ${renderRow("Employer Code", oldData.employer_code, employer_code)}
                    </tbody>
                  </table>
                  <p style="margin-top:15px;">
                    <b>Attachment:</b> ${file
                        ? `Employment Letter / Company ID attached${sharePointArchived ? ' (archived to SharePoint)' : ''}`
                        : 'No document attached'
                    }
                  </p>
                
                  <p>Thank you.</p>
                  <p><b>Norrenberger Pensions Limited</b></p>
                `,
            };

            // Attach file to email
            if (file) {
                const fileBuffer = fs.readFileSync(path.resolve(file.path));
                option.attachments = [
                    {
                        filename: file.originalname,
                        content: fileBuffer,
                        contentType: file.mimetype,
                    },
                ];
            }

            // Send email, then clean up local temp file
            transporter.sendMail(option, async function (err, info) {
                if (file) {
                    await safeUnlink(path.resolve(file.path));
                }
                if (err) {
                    console.error('Client update email error:', err);
                } else {
                    console.log('Client update email sent successfully.');
                }
            });

            return res.json({ code: 201, msg: "Details updated successfully" });
        }
    } catch (error) {
        console.error('Error in /update-client-details:', error);
        return res.status(500).json({ msg: 'An error occurred while updating client details.' });
    }
});

router.get('/search-employers', async (req, res) => {
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
                SELECT 
                  NAME AS name,
                  NULLIF(RCNO, '') AS employer_code
                FROM PFA.dbo.EMPLOYER_DETAILS
                WHERE NAME LIKE @query`)

        const dbData = result.recordset;

        const data = dbData.map(item => ({
            id: item.employer_code,
            name: item.name,
        }));

        console.log('result: ', data);

        res.status(200).json(data);

    } catch (error) {
        console.error('Error fetching data:', error);
        res.status(500).json({ error: 'An error occurred while fetching company details' });
    }
});

const ExcelJS = require('exceljs');

router.get('/client-updates-report', async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
            return res.status(400).json({ error: 'startDate and endDate are required.' });
        }

        const pool = await connectToDatabase('BenefitTracker_v2');

        const result = await pool.request()
            .input('startDate', sql.DateTime, new Date(startDate))
            .input('endDate', sql.DateTime, new Date(endDate + 'T23:59:59'))
            .query(`
                SELECT
                    id,
                    rsa_pin,
                    old_phone, new_phone,
                    old_email, new_email,
                    old_state, new_state,
                    old_bvn, new_bvn,
                    old_nin, new_nin,
                    old_employer, new_employer,
                    old_employer_code, new_employer_code,
                    attachment_name,
                    created_at
                FROM BenefitTracker_v2.dbo.ClientDetailsUpdates
                WHERE created_at BETWEEN @startDate AND @endDate
                ORDER BY created_at DESC
            `);

        const data = result.recordset;

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Client Detail Updates');

        worksheet.columns = [
            { header: '#', key: 'id', width: 8 },
            { header: 'RSA PIN', key: 'rsa_pin', width: 20 },
            { header: 'Old Phone', key: 'old_phone', width: 18 },
            { header: 'New Phone', key: 'new_phone', width: 18 },
            { header: 'Old Email', key: 'old_email', width: 30 },
            { header: 'New Email', key: 'new_email', width: 30 },
            { header: 'Old State', key: 'old_state', width: 12 },
            { header: 'New State', key: 'new_state', width: 12 },
            { header: 'Old BVN', key: 'old_bvn', width: 18 },
            { header: 'New BVN', key: 'new_bvn', width: 18 },
            { header: 'Old NIN', key: 'old_nin', width: 18 },
            { header: 'New NIN', key: 'new_nin', width: 18 },
            { header: 'Old Employer', key: 'old_employer', width: 30 },
            { header: 'New Employer', key: 'new_employer', width: 30 },
            { header: 'Old Employer Code', key: 'old_employer_code', width: 20 },
            { header: 'New Employer Code', key: 'new_employer_code', width: 20 },
            { header: 'Attachment', key: 'attachment_name', width: 30 },
            { header: 'Date Updated', key: 'created_at', width: 25, style: { numFmt: 'yyyy-mm-dd hh:mm:ss' } },
        ];

        data.forEach(row => worksheet.addRow(row));

        // Style header row
        worksheet.getRow(1).font = { bold: true };
        worksheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFF6600' },
        };
        worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };

        const buffer = await workbook.xlsx.writeBuffer();

        res.set({
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="client_updates_${startDate}_to_${endDate}.xlsx"`,
            'Content-Length': buffer.length,
        });

        return res.send(buffer);
    } catch (error) {
        console.error('Error generating client updates report:', error);
        return res.status(500).json({ error: 'Failed to generate report.' });
    }
});

router.post('/whistleblower', upload.single("attachment"), async (req, res) => {
    try {
        const { name, email, phone, message } = req.body;
        const file = req.file; // optional

        // Basic validation
        if (!message || message.trim() === "") {
            return res.status(400).send("Message is required.");
        }

        const option = {
            from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
            to: `bolanle.onotu@norrenpensions.com; daniel.anjili@norrenpensions.com; clement.aisedion@norrenpensions.com`,
            subject: "Whistleblower Report from NPL Website",
            html: `
                <p><b>Dear NPL Team,</b></p>
                <p>Please see the message below received from a whistleblower:</p>
                <blockquote style="margin: 0 0 1em 0.5em; padding-left: 0.75em; border-left: 3px solid #ccc;">
                    ${message}
                </blockquote>
                <p><b>Whistleblower Details:</b></p>
                <p>
                    Name: ${name || "Anonymous"} <br>
                    Email: ${email || "No email provided"} <br>
                    Phone Number: ${phone || "No phone provided"}
                </p>
                <p>Thank you.</p>
                <p><b>Norrenberger Pensions Limited</b></p>
            `
            ,
        };

        // If an attachment was included in the form
        if (file) {
            option.attachments = [
                {
                    filename: req.file.originalname,
                    content: req.file.buffer, // since multer.memoryStorage() stores it in memory
                    contentType: req.file.mimetype,
                },
            ];
        }

        transporter.sendMail(option, async function (err, info) {
            if (err) {
                console.log(err)
                return
            }
            else {
                console.log("Whistleblower email sent.");
            }
        });

        res.status(200).json({ success: true, message: "Message received successfully." });
    } catch (err) {
        console.error("Whistleblower submission error:", err);
        res.status(500).send("Failed to process whistleblower message.");
    }
});

// router.post('/send-statement', async (req, res) => {
//     const { pin, dateFrom, dateTo } = req.body;

//     if (!pin || !dateFrom || !dateTo) {
//         return res.status(400).json({ error: 'PIN, dateFrom, and dateTo are required' });
//     }

//     const pool = await connectToDatabase('PFA');

//     try {
//         const headerRes = await pool.request()
//             .input('pin', pin)
//             .query(`
//             SELECT *
//             FROM PFA.dbo.Cvi_udfMemberStmtHeader(@pin, GETDATE())
//         `);

//         const headerContent = headerRes.recordset[0];

//         res.json({ headerContent });

//     } catch (error) {
//         console.error('Error fetching balances: ', error);
//         res.status(500).json({ message: 'An error occurred while fetching balances' });
//     }

// })


router.post('/adhoc-statement', async (req, res) => {
    const { pin, dateFrom, dateTo } = req.body;

    if (!pin || !dateFrom || !dateTo) {
        return res.status(400).json({ error: 'PIN, dateFrom, and dateTo are required' });
    }

    try {
        const pool = await connectToDatabase('PFA');

        // 1. Run stored procedure
        const request = pool.request();
        request.input('PIN', sql.VarChar(30), pin);
        request.input('DATEFROM', sql.VarChar(30), dateFrom);
        request.input('DATETO', sql.VarChar(30), dateTo);
        await request.execute('proc_adhoc_statement');

        // Gain/Loss on Mandatory
        const mandGainLossRes = await pool.request()
            .input('PIN', sql.VarChar(30), pin)
            .execute("[PFA].[dbo].[sp_GetCurrentValueOfMandatory]")

        const mandGainLoss = mandGainLossRes.recordset?.[0]?.['Gain/Loss'] ?? 0;

        const mandBalance = mandGainLossRes.recordset?.[0]?.['Balance'] ?? 0;

        // Gain/Loss on PPP
        const pppGainLossRes = await pool.request()
            .input('PIN', sql.VarChar(30), pin)
            .execute("[PFA].[dbo].[sp_GetCurrentValueOfPPP]")

        const pppGainLoss = pppGainLossRes.recordset?.[0]?.['Gain/Loss'] ?? 0;

        const pppBalance = pppGainLossRes.recordset?.[0]?.['Balance'] ?? 0;

        // Total Gain/Loss
        const totalGainLoss = mandGainLoss + pppGainLoss;

        // Total Balance
        const totalBalance = mandBalance + pppBalance;

        // 2. Fetch header
        const headerResult = await pool.request()
            .input('pin', sql.VarChar(30), pin)
            .query(`SELECT * FROM ADHOC_STATEMENT_HEADER WHERE PIN = @pin`);

        if (headerResult.recordset.length === 0) {
            return res.status(404).json({ error: 'No statement header found for the provided PIN' });
        }

        const dbHeader = headerResult.recordset[0];

        // 3. Fetch body
        const bodyResult = await pool.request()
            .input('pin', sql.VarChar(30), pin)
            .query(`SELECT * FROM ADHOC_STATEMENT_BODY WHERE PIN = @pin ORDER BY SN, CONTDATE, TRANS_DATE, DESCR DESC`);

        const dbBody = bodyResult.recordset;

        // Formatter functions
        const formatAmount = (val) => {
            if (val === undefined || val === null) return '0.00';
            const num = parseFloat(val);
            if (isNaN(num)) return '0.00';
            if (num < 0) {
                return `(${Math.abs(num).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`;
            }
            return num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
        };

        const formatUnits = (val) => {
            if (val === undefined || val === null) return '0.0000';
            const num = parseFloat(val);
            if (isNaN(num)) return '0.0000';
            return num.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 });
        };

        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const formatEndLabel = (dateString) => {
            if (!dateString) return '';
            const date = new Date(dateString);
            if (isNaN(date.getTime())) return '';
            return `${date.getDate().toString().padStart(2, '0')}-${months[date.getMonth()]}-${date.getFullYear()}`;
        };

        // Format Header
        const header = {
            fullname: dbHeader.FULLNAME || '',
            addresses: dbHeader.ADDRESSES || '',
            employerName: dbHeader.EMPLOYER_NAME || '',
            states: dbHeader.STATES || '',
            dofc: dbHeader.DOFC || '',
            fund: dbHeader.FUND || '',
            pin: dbHeader.PIN || '',
            mandCont: formatAmount(dbHeader.MAND_CONT),
            volCont: formatAmount(dbHeader.VOL_CONT),
            preactNsitfCont: formatAmount(dbHeader.PREACTNSITF_CONT),
            totalCont: formatAmount(dbHeader.TOTAL_CONT),
            mandWtdr: formatAmount(dbHeader.MAND_WTDR),
            volWtdr: formatAmount(dbHeader.VOL_WTDR),
            preactNsitfWtdr: formatAmount(dbHeader.PREACTNSITF_WTDR),
            totalWtdr: formatAmount(dbHeader.TOTAL_WTDR),
            mandNet: formatAmount(dbHeader.MAND_NET),
            volNet: formatAmount(dbHeader.VOL_NET),
            preactNsitfNet: formatAmount(dbHeader.PREACTNSITF_NET),
            totalNet: formatAmount(dbHeader.TOTAL_NET),
            mandGrowth: formatAmount(mandGainLoss),
            volGrowth: formatAmount(pppGainLoss),
            preactNsitfGrowth: formatAmount(dbHeader.PREACTNSITF_GROWTH),
            totalGrowth: formatAmount(totalGainLoss),
            mandBal: formatAmount(mandBalance),
            volBal: formatAmount(pppBalance),
            preactNsitfBal: formatAmount(dbHeader.PREACTNSITF_BAL),
            totalBal: formatAmount(totalBalance),
            mandUnits: formatUnits(dbHeader.MAND_UNITS),
            volUnits: formatUnits(dbHeader.VOL_UNITS),
            preactNsitfUnits: formatUnits(dbHeader.PREACTNSITF_UNITS),
            totalUnits: formatUnits(dbHeader.TOTAL_UNITS),
            unitPrice: formatUnits(dbHeader.UNIT_PRICE)
        };

        // Format Body and Group them
        const body = [];
        let lastHeader = null;

        dbBody.forEach((row) => {
            const isGainLoss = row.DESCR && row.DESCR.toLowerCase().includes('gain/loss');

            if (row.HEADER && row.HEADER.trim() !== '') {
                const currentHeader = row.HEADER.trim();
                if (currentHeader !== lastHeader) {
                    body.push({ isGroupHeader: true, header: currentHeader });
                    lastHeader = currentHeader;
                }
            }

            body.push({
                descr: row.DESCR || '',
                transDate: row.TRANS_DATE || '',
                mandatory: formatAmount(row.MANDATORY),
                voluntary: formatAmount(row.VOLUNTARY),
                preactNsitf: formatAmount(row.PREACTNSITF),
                total: formatAmount(row.TOTAL),
                remark: row.REMARK || '',
                isFinal: isGainLoss
            });
        });

        res.status(200).json({
            statementEndLabel: formatEndLabel(dateTo),
            header,
            body
        });

    } catch (error) {
        console.error('Error generating statement data:', error);
        res.status(500).json({ error: 'An error occurred while generating statement data.' });
    }
});


module.exports = router;




