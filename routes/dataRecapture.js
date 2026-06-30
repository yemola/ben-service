const express = require('express');
const sql = require('mssql');
const router = express.Router();
const { connectToDatabase } = require('./dbconnection');


router.get('/agent-locations', async (req, res) => {
    try {
        const poolC = await connectToDatabase('DataRecapture');

        const allLocationsRes = await poolC.request().query(`
            SELECT TITLE AS name, ID AS value FROM DataRecapture.dbo.LOCATIONS 
	        WHERE ID != 3013;
            `)
        const data = allLocationsRes.recordset;
        res.status(200).json(data);
    } catch (error) {
        console.log('Error fetching agent locations: ', error);
    }
})

router.put('/re-assign-pin', async (req, res) => {
    const { rsaPins, agentId, userInfo } = req.body.params;

    if (!agentId) {
        throw new Error('Agent ID is required.');
    }

    try {
        const poolC = await connectToDatabase('DataRecapture');

        for (const pin of rsaPins) {
            const pinSearchRes = await poolC.request().input('pin', pin).query(`
                SELECT COUNT(*) AS pinCount FROM DataRecapture.dbo.Employees WHERE pin = @pin
            `);

            const pinCount = pinSearchRes.recordset[0]['pinCount'];

            if (pinCount === 0) {
                // Return a specific error immediately
                return res.status(400).send({ error: `${pin} not found in the database.` });
            }
        }


        const result = await poolC.request()
            .input('query', sql.Int, agentId)
            .query(`SELECT STAFF_ID, STAFF_NAME, LOCATION_ID FROM DataRecapture.dbo.USERS
                    WHERE ID = @query`)

        const agentData = result.recordset[0];
        // console.log('agentDeatils: ', agentData);

        if (!agentData) {
            throw new Error('No agent data found for the given agent ID');
        }

        if (!rsaPins || rsaPins.length === 0) {
            throw new Error('rsaPins array cannot be empty');
        }

        // Dynamically generate query placeholders for pins
        const pinPlaceholders = rsaPins.map((_, index) => `@pin${index}`).join(', ');

        const query = `
            UPDATE DataRecapture.dbo.EMPLOYEES
            SET staffID = @staffId,
                staffName = @staffName,
                LOCATION_ID = @location
            WHERE pin IN (${pinPlaceholders})
    `;

        const request = poolC.request();

        request.input('staffId', sql.VarChar, agentData.STAFF_ID);
        request.input('staffName', sql.VarChar, agentData.STAFF_NAME);
        request.input('location', sql.VarChar, agentData.LOCATION_ID);

        rsaPins.forEach((pin, index) => {
            request.input(`pin${index}`, sql.VarChar, pin); // Bind each pin value
        });

        await request.query(query);

        // const poolB = await connectToDatabase('BenefitTracker');

        const logDescription = `${rsaPins.join(', ')} assigned to ${agentData.STAFF_NAME}`;

        const updateLog = await poolC.request()
            .input('userId', sql.Int, userInfo.id)
            .input('desc', sql.NVarChar(sql.MAX), logDescription)
            .input('staffId', sql.VarChar(50), agentData.STAFF_ID)
            .input('staffName', sql.NVarChar(255), agentData.STAFF_NAME)
            .input('locationId', sql.NVarChar(255), agentData.LOCATION_ID)
            .query(`
                    INSERT INTO DataRecapture.dbo.DataRecapPinReassignLog
                        (userID, details, staffID, staffName, location)
                        VALUES (@userId, @desc, @staffId, @staffName, @locationId)`)


        console.log('Update completed successfully!');

        res.status(200).json({ message: 'Update completed successfully!' });

    } catch (error) {
        console.error(error.message);
        res.status(400).send({ error: error.message });
    }


})


router.put('/delete-recaptured-pin', async (req, res) => {
    try {
        const { rsaPins, userInfo } = req.body.params;
        console.log("RSAPINS: ", rsaPins);

        if (!rsaPins || !Array.isArray(rsaPins) || rsaPins.length === 0) {
            return res.status(400).json({ error: 'rsaPins array cannot be empty' });
        }

        if (!userInfo || !userInfo.name) {
            return res.status(400).json({ error: 'User info with a name is required for logging' });
        }

        const poolC = await connectToDatabase('DataRecapture');
        let missingPins = [];

        for (const pin of rsaPins) {
            const pinSearchRes = await poolC.request().input('pin', sql.VarChar, pin).query(`
                SELECT COUNT(*) AS pinCount FROM DataRecapture.dbo.Employees WHERE pin = @pin
            `);
            if (pinSearchRes.recordset[0]['pinCount'] === 0) {
                missingPins.push(pin);
            }
        }

        if (missingPins.length > 0) {
            return res.status(400).json({ error: `Pins not found: ${missingPins.join(', ')}` });
        }

        // Begin Transaction
        const transaction = poolC.transaction();
        await transaction.begin();

        try {
            // Generate placeholders dynamically
            const pinPlaceholders = rsaPins.map((_, index) => `@pin${index}`).join(', ');
            const deleteQuery = `DELETE FROM DataRecapture.dbo.Employees WHERE pin IN (${pinPlaceholders})`;

            const deleteRequest = transaction.request();
            rsaPins.forEach((pin, index) => {
                deleteRequest.input(`pin${index}`, sql.VarChar, pin);
            });

            await deleteRequest.query(deleteQuery);

            // Log deletions into DataRecapPinDeletionLog
            for (const pin of rsaPins) {
                await transaction.request()
                    .input('name', sql.VarChar, userInfo.name)
                    .input('pin', sql.VarChar, pin)
                    .query(`
                        INSERT INTO DataRecapture.dbo.DataRecapPinDeletionLog (name, pin)
                        VALUES (@name, @pin)
                    `);
            }

            // Commit Transaction
            await transaction.commit();

            console.log('Deletion and logging successful!');
            res.status(200).json({ message: 'Deletion and logging successful!' });

        } catch (logError) {
            await transaction.rollback();
            throw new Error('Failed to delete and log pins: ' + logError.message);
        }

    } catch (error) {
        console.error('Error deleting pins:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});


router.put('/change-pin-status', async (req, res) => {

    try {
        const { rsaPins, userInfo } = req.body.params;
        console.log("RSAPINS: ", rsaPins);

        if (!rsaPins || !Array.isArray(rsaPins) || rsaPins.length === 0) {
            return res.status(400).json({ error: 'rsaPins array cannot be empty' });
        }

        if (!userInfo || !userInfo.name) {
            return res.status(400).json({ error: 'User info with a name is required for logging' });
        }

        const poolC = await connectToDatabase('DataRecapture');
        let missingPins = [];

        for (const pin of rsaPins) {
            const pinSearchRes = await poolC.request().input('pin', sql.VarChar, pin).query(`
                SELECT COUNT(*) AS pinCount FROM DataRecapture.dbo.Employees WHERE pin = @pin
            `);
            if (pinSearchRes.recordset[0]['pinCount'] === 0) {
                missingPins.push(pin);
            }
        }

        if (missingPins.length > 0) {
            return res.status(400).json({ error: `Pins not found: ${missingPins.join(', ')}` });
        }

        // Begin Transaction
        const transaction = poolC.transaction();
        await transaction.begin();

        try {
            // Generate placeholders dynamically
            const pinPlaceholders = rsaPins.map((_, index) => `@pin${index}`).join(', ');
            const updateQuery = `UPDATE DataRecapture.dbo.Employees 
                                    SET AcceptedByPencom = 0
                                    WHERE pin IN (${pinPlaceholders})`;

            const updateRequest = transaction.request();
            rsaPins.forEach((pin, index) => {
                updateRequest.input(`pin${index}`, sql.VarChar, pin);
            });

            await updateRequest.query(updateQuery);

            // Log deletions into DataRecapPinDeletionLog
            for (const pin of rsaPins) {
                await transaction.request()
                    .input('name', sql.VarChar, userInfo.name)
                    .input('pin', sql.VarChar, pin)
                    .query(`
                        INSERT INTO DataRecapture.dbo.PinStatusChangeLog (name, pin)
                        VALUES (@name, @pin)
                    `);
            }

            // Commit Transaction
            await transaction.commit();

            console.log('Status update successful!');
            res.status(200).json({ message: 'Status update successful!' });

        } catch (logError) {
            await transaction.rollback();
            throw new Error('Failed to update status pins: ' + logError.message);
        }

    } catch (error) {
        console.error('Error changing pins status:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }

})




module.exports = router;