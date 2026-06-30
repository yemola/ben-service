const express = require('express');
const router = express.Router();
const { connectToDatabase } = require('../routes/dbconnection');
const sql = require('mssql');


router.get('/ng-states', async (req, res) => {

    try {
        const pool = await connectToDatabase('PFA');

        const result = await pool.request()
            .query(`SELECT DESCRIPTION AS label, CODE AS value FROM PFA.dbo.STATES`);

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

module.exports = router;