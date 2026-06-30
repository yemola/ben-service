const express = require('express');
const router = express.Router();
const { connectToDatabase } = require('./dbconnection');
const sql = require('mssql');

router.get('/', async (req, res) => {
    try {
        const pool = await connectToDatabase('BenefitTracker');

        const result = await pool.request()
            .query(`SELECT id, name FROM BenefitTracker_v2.dbo.Roles ORDER BY id DESC`);

        const data = await result.recordset;

        res.status(200).json(data);
    } catch (error) {
        console.log('rolesFetchError: ', error);
    } finally {
        // Close the connection
        await sql.close();
    }
});


module.exports = router;