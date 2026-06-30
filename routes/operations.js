const express = require('express');
const sql = require('mssql');
const router = express.Router();
const { connectToDatabase } = require('./dbconnection');


router.put('/invalidate-pin', async (req, res) => {
    try {
        const { rsaPins, userInfo } = req.body.params;
        console.log("InvalidPINS: ", rsaPins, userInfo);

        if (!rsaPins || !Array.isArray(rsaPins) || rsaPins.length === 0) {
            return res.status(400).json({ error: 'rsaPins array cannot be empty' });
        }

        if (!userInfo || !userInfo.name) {
            return res.status(400).json({ error: 'User info with a name is required for logging' });
        }

        const pool = await connectToDatabase('PFA');

        let missingPins = [];

        for (const pin of rsaPins) {
            const pinSearchRes = await pool.request().input('pin', sql.VarChar, pin).query(`
                    SELECT COUNT(*) AS pinCount FROM PFA.dbo.EMPLOYEES WHERE PIN = @pin
                `);
            if (pinSearchRes.recordset[0]['pinCount'] === 0) {
                missingPins.push(pin);
            }
        }

        if (missingPins.length > 0) {
            return res.status(400).json({ error: `Pins not found: ${missingPins.join(', ')}` });
        }

        // Begin Transaction
        const transaction = pool.transaction();
        await transaction.begin();

        try {
            // Generate placeholders dynamically
            const pinPlaceholders = rsaPins.map((_, index) => `@pin${index}`).join(', ');
            const invalidationQuery = `UPDATE PFA.dbo.EMPLOYEES 
                                        SET PIN_INVALID = 1
                                        WHERE PIN IN (${pinPlaceholders})`;

            const invalidationRequest = transaction.request();
            rsaPins.forEach((pin, index) => {
                invalidationRequest.input(`pin${index}`, sql.VarChar, pin);
            });

            await invalidationRequest.query(invalidationQuery);

            // Log deletions into DataRecapPinDeletionLog
            for (const pin of rsaPins) {
                await transaction.request()
                    .input('name', sql.VarChar, userInfo.name)
                    .input('pin', sql.VarChar, pin)
                    .query(`
                            INSERT INTO BenefitTracker_v2.dbo.PinInvalidationLog (name, pin)
                            VALUES (@name, @pin)
                        `);
            }

            // Commit Transaction
            await transaction.commit();

            console.log('Invalidation successful!');
            res.status(200).json({ message: 'Invalidation successful!' });

        } catch (logError) {
            await transaction.rollback();
            throw new Error('Failed to invalidate pins: ' + logError.message);
        }


    } catch (error) {
        console.error('Error invalidating pins:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.put('/validate-pin', async (req, res) => {
    try {
        const { rsaPins, userInfo } = req.body.params;
        console.log("ValidPINS: ", rsaPins, userInfo);

        if (!rsaPins || !Array.isArray(rsaPins) || rsaPins.length === 0) {
            return res.status(400).json({ error: 'rsaPins array cannot be empty' });
        }

        if (!userInfo || !userInfo.name) {
            return res.status(400).json({ error: 'User info with a name is required for logging' });
        }

        const pool = await connectToDatabase('PFA');

        let missingPins = [];

        for (const pin of rsaPins) {
            const pinSearchRes = await pool.request().input('pin', sql.VarChar, pin).query(`
                    SELECT COUNT(*) AS pinCount FROM PFA.dbo.EMPLOYEES WHERE PIN = @pin
                `);
            if (pinSearchRes.recordset[0]['pinCount'] === 0) {
                missingPins.push(pin);
            }
        }

        if (missingPins.length > 0) {
            return res.status(400).json({ error: `Pins not found: ${missingPins.join(', ')}` });
        }

        // Begin Transaction
        const transaction = pool.transaction();
        await transaction.begin();

        try {
            // Generate placeholders dynamically
            const pinPlaceholders = rsaPins.map((_, index) => `@pin${index}`).join(', ');
            const validationQuery = `UPDATE PFA.dbo.EMPLOYEES 
                                        SET PIN_INVALID = 0
                                        WHERE PIN IN (${pinPlaceholders})`;

            const validationRequest = transaction.request();
            rsaPins.forEach((pin, index) => {
                validationRequest.input(`pin${index}`, sql.VarChar, pin);
            });

            await validationRequest.query(validationQuery);

            // Log deletions into DataRecapPinDeletionLog
            for (const pin of rsaPins) {
                await transaction.request()
                    .input('name', sql.VarChar, userInfo.name)
                    .input('pin', sql.VarChar, pin)
                    .query(`
                            INSERT INTO BenefitTracker_v2.dbo.PinInvalidationLog (name, pin)
                            VALUES (@name, @pin)
                        `);
            }

            // Commit Transaction
            await transaction.commit();

            console.log('Validation successful!');
            res.status(200).json({ message: 'Validation successful!' });

        } catch (logError) {
            await transaction.rollback();
            throw new Error('Failed to validate pins: ' + logError.message);
        }


    } catch (error) {
        console.error('Error validating pins:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});



module.exports = router;