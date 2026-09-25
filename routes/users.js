const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const { connectToDatabase } = require('./dbconnection');
const sql = require('mssql');
const validateWith = require("../middleware/validation");
const yup = require("yup");

const schema = yup.object().shape({
    email: yup.string().email().required(),
    role: yup.string().required(),
});

router.get('/', async (req, res) => {

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const result = await pool.request()
            .query(`SELECT U.id, U.name, U.user_name, U.email, U.branch, R.name AS role 
                FROM BenefitTracker_v2.dbo.Users U JOIN BenefitTracker_v2.dbo.Roles R ON U.role_id = R.id 
                WHERE U.is_active = 1`);

        const data = await result.recordset;

        res.status(200).json(data);
    } catch (error) {
        console.log('userFetchingError', error);
    }


});

router.get('/ng-states', async (req, res) => {
    try {
        const pool = await connectToDatabase('PFA');

        const result = await pool.request()
            .query(`SELECT DESCRIPTION AS name, CODE AS code FROM PFA.dbo.STATES`);

        const data = result.recordset;
        // console.log('DATA: ', data);
        res.status(200).json(data);
    } catch (error) {
        console.log('Error fetching states: ', error);
    }
});

router.get('/ng-lga', async (req, res) => {
    try {
        console.log('REQ: ', req.body);
        const { stCode } = req.query;
        console.log('payload: ', stCode);
        const pool = await connectToDatabase('PFA');

        const result = await pool.request()
            .input('stCode', stCode)
            .query(`SELECT DESCRIPTION AS name, CODE AS code FROM PFA.dbo.LGA WHERE STATE_CODE = @stCode`);

        const data = result.recordset;
        console.log('DATA: ', data);
        res.status(200).json(data);
    } catch (error) {
        console.log('Error fetching LGA: ', error);
    }
});

router.get('/mp-employers', async (req, res) => {
    try {
        const pool = await connectToDatabase('PFA');

        const result = await pool.request()
            .query(`SELECT NAME as name, RCNO AS code FROM PFA.dbo.TradeUnions`);

        const data = await result.recordset;

        res.status(200).json(data);
    } catch (error) {
        console.log('Error fetch trade unions: ', error);
    }
})

router.get('/inactive-users', async (req, res) => {

    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        const result = await pool.request()
            .query(`SELECT U.id, U.name, U.user_name, U.email, U.branch, R.name AS role 
                FROM BenefitTracker_v2.dbo.Users U JOIN BenefitTracker_v2.dbo.Roles R ON U.role_id = R.id 
                WHERE U.is_active = 0`);

        const data = await result.recordset;

        res.status(200).json(data);
    } catch (error) {
        console.log('userFetchingError', error);
    }


});

router.post('/add-pmi-user', async (req, res) => {
    const body = req.body;
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return res.status(400).json({ message: 'A JSON object is required.', errors: { form: 'Invalid request body.' } });
    }
    const errors = {};
    const readName = (field, label) => {
        const value = body[field];
        if (typeof value !== 'string' || !value.trim()) {
            errors[field] = `${label} is required and must be text.`;
            return '';
        }
        const trimmed = value.trim();
        if (trimmed.length > 253) errors[field] = `${label} is too long.`;
        if (/[\u0000-\u001f\u007f]/.test(trimmed)) errors[field] = `${label} must not contain control characters.`;
        return trimmed;
    };
    const firstname = readName('firstname', 'First name');
    const lastname = readName('lastname', 'Last name');
    const name = `${firstname} ${lastname}`;
    if (firstname && lastname && name.length > 255) {
        errors.lastname = 'First and last name combined must not exceed 255 characters, including the separating space.';
    }
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    if (!email || email.length > 255 || !yup.string().email().isValidSync(email) ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || /[\u0000-\u001f\u007f]/.test(email)) {
        errors.email = 'Enter a valid email address of at most 255 characters.';
    }
    const institutionId = body.pmi_institution_id;
    if (!Number.isInteger(institutionId) || institutionId < 1 || institutionId > 2147483647) {
        errors.pmi_institution_id = 'Select a valid PMI.';
    }
    // Account type, active status, institution name and admin identity are server-owned.
    if (Object.keys(errors).length) {
        return res.status(400).json({ message: 'Please correct the highlighted fields.', errors });
    }

    let transaction;
    let started = false;
    try {
        const pool = await connectToDatabase('BenefitTracker_v2');

        // The existing password column is NOT NULL. No usable password is assigned or emailed.
        const password = await bcrypt.hash(require('crypto').randomBytes(32).toString('hex'), 10);
        transaction = new sql.Transaction(pool);
        await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
        started = true;
        const existing = await new sql.Request(transaction)
            .input('email', sql.NVarChar(255), email).query(`
                SELECT TOP 1 id FROM dbo.Users WITH (UPDLOCK, HOLDLOCK)
                WHERE LOWER(LTRIM(RTRIM(email))) = @email
            `);
        if (existing.recordset.length) {
            await transaction.rollback();
            started = false;
            return res.status(409).json({ message: 'An account with this email already exists.', errors: { email: 'An account with this email already exists.' } });
        }
        const institution = await new sql.Request(transaction)
            .input('id', sql.Int, institutionId).query(`
                SELECT id, name FROM dbo.PMIs WHERE id = @id AND is_active = 1
            `);
        if (!institution.recordset.length) {
            await transaction.rollback();
            started = false;
            return res.status(400).json({ message: 'Select an active PMI.', errors: { pmi_institution_id: 'The selected PMI does not exist or is inactive.' } });
        }
        const result = await new sql.Request(transaction)
            .input('name', sql.NVarChar(255), name)
            .input('email', sql.NVarChar(255), email)
            .input('password', sql.VarChar(255), password)
            .input('pmiId', sql.Int, institution.recordset[0].id)
            .input('pmiName', sql.NVarChar(200), institution.recordset[0].name)
            .query(`
                INSERT INTO dbo.Users
                    (name, email, password, account_type, pmi_institution_id,
                     pmi_institution_name, is_active, role_id, branch, ff_user_id,
                     created_at, modified_at, user_picture_path, user_name,
                     otp_ver, otp_createdAt, picture, picture_type, role2_id)
                OUTPUT INSERTED.id
                VALUES (@name, @email, @password, 'pmi', @pmiId, @pmiName, 1,
                        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL)
            `);
        await transaction.commit();
        started = false;
        return res.status(201).json({
            userCreated: true,
            userId: result.recordset[0].id,
            invitationSent: false,
            message: 'PMI user created. Password setup invitation is pending implementation.',
        });
    } catch (error) {
        if (started) {
            try { await transaction.rollback(); } catch (rollbackError) {
                console.error('PMI user transaction rollback failed:', rollbackError);
            }
        }
        if ([2601, 2627].includes(error.number)) {
            return res.status(409).json({ message: 'An account with these details already exists.' });
        }
        console.error('Error adding PMI user:', error);
        return res.status(500).json({ message: 'Unable to add PMI user.' });
    }
});

router.post('/add-user', async (req, res) => {
    const { adminId, usersToAdd } = req.body;
    console.log('paayload: ', usersToAdd);

    const defaultPassword = 'defaultPassword123';
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const createdAt = new Date();

    try {
        const pool = await connectToDatabase('PFA');
        const poolB = await connectToDatabase('BenefitTracker_v2');
        const existingUsers = [];

        for (const agent of usersToAdd) {
            const { email, role } = agent;
            console.log('Email: ', email);

            // Check if the user already exists in the BenefitTracker database
            const userExistsResult = await poolB.request()
                .input('email', sql.VarChar(255), email)
                .query(`
                    SELECT * FROM BenefitTracker_v2.dbo.Users
                    WHERE email = @email
                `);

            if (userExistsResult.recordset.length > 0) {

                existingUsers.push(email);
                continue;
            }

            // Fetch user information from PFA database
            const jsonRes = await pool.request()
                .input('email', sql.NVarChar, email)
                .query(`
                    SELECT B.DESCRIPTION, FULL_NAME, U.USERID, U.USER_NAME, U.EMAIL
                    FROM PFA.dbo.S_USER U
                    LEFT OUTER JOIN PFA.DBO.BRANCH B ON U.BRANCH_CODE = B.CODE
                    WHERE U.USER_DISABLED = '0' AND U.EMAIL = @email
                `);

            const userInfo = jsonRes.recordset[0];
            console.log('userInfo: ', userInfo);

            if (userInfo === undefined) {
                console.log(`User with email ${email} not found or is disabled.`);
                return res.status(404).json({ message: `User with email ${email} not found or is disabled in PFA database.` });
                continue;
            }

            const user = {
                branch: userInfo.DESCRIPTION,
                name: userInfo.FULL_NAME,
                username: userInfo.USER_NAME,
                ffUserId: userInfo.USERID,
                email: userInfo.EMAIL,
                password: hashedPassword,
                roleId: parseInt(role),
                createdAt,
                modifiedAt: null,
                isActive: true,
                userPicturePath: null
            };

            console.log('user: ', user);

            const result = await poolB.request()
                .input('Name', sql.VarChar(255), user.name)
                .input('UserName', sql.VarChar(20), user.username || null)
                .input('Email', sql.VarChar(255), user.email)
                .input('Password', sql.VarChar(255), user.password)
                .input('RoleId', sql.Int, user.roleId)
                .input('Branch', sql.VarChar(20), user.branch || null)
                .input('FfUserId', sql.Int, user.ffUserId)
                .input('CreatedAt', sql.DateTime, user.createdAt)
                .input('ModifiedAt', sql.DateTime, user.modifiedAt || null)
                .input('IsActive', sql.Bit, user.isActive)
                .input('UserPicturePath', sql.VarChar(255), user.userPicturePath || null)
                .query(`
                    INSERT INTO BenefitTracker_v2.dbo.Users
                    (name, user_name, email, password, role_id, branch, ff_user_id, created_at, modified_at, is_active, user_picture_path)
                    VALUES (@Name, @UserName, @Email, @Password, @RoleId, @Branch, @FfUserId, @CreatedAt, @ModifiedAt, @IsActive, @UserPicturePath);

                    SELECT SCOPE_IDENTITY() AS NewUserId;
                `);

            const newUserId = result.recordset[0].NewUserId;
            console.log('newUserId: ', newUserId);

            const logActionRes = await poolB.request()
                .input('adminId', adminId)
                .input('affectedUserId', newUserId)
                .input('actionType', 'New User Added')
                .input('description', `A new user with id ${newUserId} has been added to the BenefitTracker Users table`)
                .query(`
            INSERT INTO BenefitTracker_v2.dbo.AdminActionsLog (admin_user_id, action_type, affected_user_id, description)
            VALUES (@adminId, @actionType, @affectedUserId, @description);
        `)

            const logAction = logActionRes.rowsAffected[0];
            console.log('logAction: ', logAction);
        }

        const option = {
            from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
            to: user.email,
            cc: `olayemi.abusango@norrenpensions.com`,
            subject: "Benefit Tracker Sign Up Guide",
            html: `
                        
                    <p>Dear ${user.name},</p>
                        
                    <p>We are pleased to inform you that you have been added as a user to the Benefit Tracker application. Below is your assigned username:</p>
                    <p>${user.username}</p>

                    <p>Please read carefully the short instructions on each page as you follow each step.</p>

                    <p>To get started:</p>
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


        if (existingUsers.length > 0) {
            const existingEmails = existingUsers.join(', ');

            res.json({ message: `The following users already exist in the system: ${existingEmails}` });
        } else {
            res.status(200).json({ message: 'Users successfully added.' });
        }

    } catch (error) {
        console.error('Error: ', error);
        res.status(500).json({ message: error.message });
    } finally {
        // Close the connections
        await sql.close();
    }
});

router.put('/enable-user', async (req, res) => {
    const { adminId, id } = req.body;

    const poolB = await connectToDatabase('BenefitTracker_v2');
    const result = await poolB.request()
        .input('id', sql.Int, id)
        .query(`UPDATE BenefitTracker_v2.dbo.Users
            SET is_active = 1,
            modified_at = GETDATE()
            WHERE id = @id;`);

    const userEnabled = result.rowsAffected[0];
    const message = userEnabled === 1 ? 'User has been enabled.' : 'User not enabled.';

    const logActionRes = await poolB.request()
        .input('adminId', adminId)
        .input('affectedUserId', id)
        .input('actionType', 'User Enabled')
        .input('description', `User enabled`)
        .query(`
            INSERT INTO BenefitTracker_v2.dbo.AdminActionsLog (admin_user_id, action_type, affected_user_id, description)
            VALUES (@adminId, @actionType, @affectedUserId, @description);
        `)

    const logAction = logActionRes.rowsAffected[0];
    console.log('logAction: ', logAction);

    res.json({ message });

});

router.put('/disable-user', async (req, res) => {
    const { adminId, id } = req.body;

    const poolB = await connectToDatabase('BenefitTracker_v2');
    const result = await poolB.request()
        .input('id', sql.Int, id)
        .query(`UPDATE BenefitTracker_v2.dbo.Users
            SET is_active = 0,
            modified_at = GETDATE()
            WHERE id = @id;`);

    const userDisabled = await result.rowsAffected[0];
    const message = userDisabled === 1 ? 'User has been disabled.' : 'User not disabled.';

    const logActionRes = await poolB.request()
        .input('adminId', adminId)
        .input('affectedUserId', id)
        .input('actionType', 'User Disabled')
        .input('description', `User disabled`)
        .query(`
            INSERT INTO BenefitTracker_v2.dbo.AdminActionsLog (admin_user_id, action_type, affected_user_id, description)
            VALUES (@adminId, @actionType, @affectedUserId, @description);
        `)

    const logAction = logActionRes.rowsAffected[0];
    console.log('logAction: ', logAction);
    res.json({ message });

});

router.put('/change-user-role', async (req, res) => {
    const { adminId, userId, roleId } = req.body;
    const role_id = parseInt(roleId);

    const poolB = await connectToDatabase('BenefitTracker_v2');
    const result = await poolB.request()
        .input('userId', sql.Int, userId)
        .input('role_id', sql.Int, role_id)
        .query(`UPDATE BenefitTracker_v2.dbo.Users
            SET role_id = @role_id,
            modified_at = GETDATE()
            WHERE id = @userId`);

    const userRoleChanged = await result.rowsAffected[0];
    const message = userRoleChanged === 1 ? 'User role has been changed.' : 'Unable to change user role.';

    const logActionRes = await poolB.request()
        .input('adminId', adminId)
        .input('affectedUserId', userId)
        .input('actionType', 'Changed User Role')
        .input('description', `User role ID changed to ${role_id}`)
        .query(`
            INSERT INTO BenefitTracker_v2.dbo.AdminActionsLog (admin_user_id, action_type, affected_user_id, description)
            VALUES (@adminId, @actionType, @affectedUserId, @description);
        `)

    const logAction = logActionRes.rowsAffected[0];
    console.log('logAction: ', logAction);

    res.json({ message: message });
})


router.put('/assign-assistant-reviewer', async (req, res) => {
    const { adminId, assistantId, assistantName, origReviewerId } = req.body;
    console.log('asstId, origRev: ', assistantId, origReviewerId);

    if (!assistantId || !origReviewerId) {
        return res.status(400).json({ message: 'Assistant ID and original reviewer ID are required.' });
    }

    try {
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const result = await poolB.request()
            .input('taskOwnerId', assistantId)
            .input('taskOwner', assistantName)
            .input('lastReviewerId', origReviewerId)
            .query(`
                UPDATE BenefitTracker_v2.dbo.Applications 
                SET taskOwner_id = @taskOwnerId, 
                taskOwner = @taskOwner
                WHERE taskOwner_id = @lastReviewerId`)

        const poolUpdateRes = await poolB.request()
            .input('newReviewerId', assistantId)
            .input('newReviewerName', assistantName)
            .input('lastReviewerId', origReviewerId)
            .query(`
                UPDATE BenefitTracker_v2.dbo.ApplicationLog
                SET current_reviewer_id = @newReviewerId, current_reviewer = @newReviewerName, 
                    taskOwner_id = @newReviewerId, taskOwner = @newReviewerName,
                    prev_reviewer_id = @newReviewerId, prev_reviewer = @newReviewerName
                WHERE taskOwner_id = @lastReviewerId`)

        const assistantUpdated = await result.rowsAffected[0];
        console.log('updated records: ', assistantUpdated);

        if (assistantUpdated) {
            const logActionRes = await poolB.request()
                .input('adminId', adminId)
                .input('affectedUserId', origReviewerId)
                .input('actionType', 'Assistant Assigned')
                .input('description', `The user with id ${assistantId} has been assigned to temporarily assist the user with id ${origReviewerId}`)
                .query(`
            INSERT INTO BenefitTracker_v2.dbo.AdminActionsLog (admin_user_id, action_type, affected_user_id, description)
            VALUES (@adminId, @actionType, @affectedUserId, @description);
        `)

            const logAction = logActionRes.rowsAffected[0];
            console.log('logAction: ', logAction);

            res.status(200).json({ message: 'assistant successfully assigned!' });
        }


    } catch (error) {
        console.log('updating error: ', error);
    }
});


router.put('/restore-reviewer', async (req, res) => {
    const { adminId, reviewerId } = req.body;

    try {
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const result = await poolB.request()
            .input('origReviewerId', reviewerId)
            .query(`
                UPDATE BenefitTracker_v2.dbo.Statuses
                SET taskOwner_id = orig_taskOwner_id,
                    next_taskOwner_id = orig_next_taskOwner_id
                WHERE orig_taskOwner_id = @origReviewerId OR
                    orig_next_taskOwner_id = @origReviewerId`)

        const reviewerRestored = result.rowsAffected[0];
        if (reviewerRestored) {
            const logActionRes = await poolB.request()
                .input('adminId', adminId)
                .input('affectedUserId', reviewerId)
                .input('actionType', 'Reviewer Restored')
                .input('description', `The user with id ${assistantId} has been restored`)
                .query(`
                    INSERT INTO BenefitTracker_v2.dbo.AdminActionsLog (admin_user_id, action_type, affected_user_id, description)
                    VALUES (@adminId, @actionType, @affectedUserId, @description);
                    `)

            const logAction = logActionRes.rowsAffected[0];
            console.log('logAction: ', logAction);

            res.status(200).json({ message: 'Original reviewer restored.' });
        }

    } catch (error) {
        console.log('Restoring error: ', error);
    }
});

router.put('/new-benefit-officer', async (req, res) => {
    const { adminId, newOfficerId, currentOfficerId } = req.body;
    console.log('newOfficer: ', newOfficerId, "currentOfficerId: ", currentOfficerId);

    try {
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const result = await poolB.request()
            .input('origReviewerId', reviewerId)
            .input('newOfficerId', newOfficerId)
            .input('currentOfficerId', currentOfficerId)
            .query(`
                UPDATE BenefitTracker_v2.dbo.Statuses
                SET taskOwner_id = @newOfficerId,
                    next_TaskOwner_id = @newOfficerId,
                    orig_taskOwner_id = @newOfficerId,
                    next_orig_taskOwner_id = @newOfficerId
                WHERE taskOwner_id = @currentOfficerId OR
                    next_TaskOwner_id = @currentOfficerId OR
                    orig_taskOwner_id = @currentOfficerId OR
                    orig_next_taskOwner_id = @currentOfficerId
                    `)

        const newOfficerAssigned = await result.rowsAffected[0];
        console.log('newAssignment: ', newOfficerAssigned);

        if (newOfficerAssigned) {
            const logActionRes = await poolB.request()
                .input('adminId', adminId)
                .input('affectedUserId', currentOfficerId)
                .input('actionType', 'Officer Replaced')
                .input('description', `The officer with id ${currentOfficerId} has been replaced with officer with id ${newOfficerId}`)
                .query(`
                    INSERT INTO BenefitTracker_v2.dbo.AdminActionsLog (admin_user_id, action_type, affected_user_id, description)
                    VALUES (@adminId, @actionType, @affectedUserId, @description);
                    `)

            const logAction = logActionRes.rowsAffected[0];
            console.log('logAction: ', logAction);

            res.status(200).json({ message: 'New officer assigned to replace current officer.' });
        }
    } catch (error) {
        console.log("Error assigning new officer", error);
    }
})

module.exports = router;