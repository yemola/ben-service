const express = require('express');
const router = express.Router();
const xlsx = require('xlsx');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { contSummary } = require('./contSummary');
const { connectToDatabase } = require('./dbconnection');
const calculateAge = require('./ageCal');
const formatAsCurrency = require('./moneyFig');
const capitalizeWords = require('./capitalizeWords');

router.get('/balances', async (req, res) => {
    const { pinArray } = req.body;

    const pool = await connectToDatabase('PFA');

    try {
        // Process all pins concurrently
        const balances = await Promise.all(
            pinArray.map(async (pin) => {
                const result = await contSummary(pin);
                const rsaBalStr = result?.TOTAL_BALANCE ? result.TOTAL_BALANCE.toFixed(2) : "";
                const volContr = result?.VOLUNTARY_CONTRIBUTION ? result.VOLUNTARY_CONTRIBUTION.toFixed(2) : "";

                const empAddrRes = await pool.request().input('pin', pin).query(`
                    SELECT TITLE, SURNAME, FIRSTNAME, OTHERNAMES FROM PFA.dbo.EMPLOYEES WHERE PIN = @pin
                    `);
                const empAddr = await empAddrRes.recordset[0];

                // parseFloat(rsaBalStr);
                const rsaBal = rsaBalStr ? parseFloat(rsaBalStr) : "";
                return {
                    pin: pin,
                    surname: empAddr?.SURNAME || "",
                    firstname: empAddr?.FIRSTNAME || "",
                    middlename: empAddr?.OTHERNAMES || "",
                    fundType: result?.FUND_CODE || "",
                    ...result
                    //bal: rsaBal,
                    //volContr: volContr
                };
            })
        );

        // Create a new worksheet from the balances data
        const ws = xlsx.utils.json_to_sheet(balances);

        // Create a new workbook and append the worksheet to it
        const wb = xlsx.utils.book_new();
        xlsx.utils.book_append_sheet(wb, ws, 'Balances');

        // Generate the Excel file as a buffer
        const excelBuffer = xlsx.write(wb, { bookType: 'xlsx', type: 'buffer' });

        // Define the path to save the Excel file (root directory)
        const filePath = path.join(__dirname, 'balances.xlsx');

        // Write the Excel buffer to a file in the backend
        fs.writeFileSync(filePath, excelBuffer);

        res.status(200).json({ data: balances, message: 'Completed conversion.' });

    } catch (error) {
        console.error('Error fetching balances: ', error);
        res.status(500).json({ message: 'An error occurred while fetching balances' });
    }
});


// router.get('/balances', async (req, res) => {
//     const { pinArray } = req.body;

//     try {
//         const balances = [];

//         // const pool = await connectToDatabase('PFA');

//         for (pin of pinArray) {
//             const result = await contSummary(pin);
//             const rsaBalStr = result?.TOTAL_BALANCE ? result?.TOTAL_BALANCE.toFixed(2) : "";
//             const rsaBal = rsaBalStr ? formatAsCurrency(rsaBalStr) : "";
//             const balData = {
//                 fundType: result.FUND_CODE,
//                 bal: rsaBal,
//             }

//             balances.push(balData);

//             res.status(200).json(balances);
//         }

//     } catch (error) {
//         console.log('Error fetching balances: ', error);
//     }
// });

router.get('/:pin', async (req, res) => {
    const { pin } = req.params;
    try {
        const pool = await connectToDatabase('PFA');
        const poolB = await connectToDatabase('BenefitTracker_v2');

        const pinSearchRes = await pool.request().input('pin', pin).query(`
        SELECT COUNT(*) AS pinCount FROM PFA.dbo.EMPLOYEES WHERE PIN = @pin
        `);

        const pinCount = await pinSearchRes.recordset[0]['pinCount'];

        if (pinCount === 0) return res.status(404).json({ message: 'Incorrect pin' });

        const testres = await poolB.request().input('pin', pin)
            .execute('BenefitTracker_v2.dbo.GetRecaptureStatus');

        const pinStatus = testres.recordset.length > 0 ? testres.recordset[0]['RECAPTURE STATUS'] : 'Unknown';

        const jsonRes = await pool.request().input('pin', pin).query(`
            SELECT 
            PIN, 
            SURNAME, 
            FIRSTNAME, 
            OTHERNAMES, 
            GENDER, 
            CONVERT(char(10), DATE_OF_BIRTH, 23) AS date_of_birth, 
            EMPLOYER_NAME, 
            MOBILE_PHONE, 
            EMAIL, 
            EMPLOYER_RCNO 
        FROM PFA.dbo.EMPLOYEES 
        WHERE PIN = @pin`);

        const employeeInfo = await jsonRes.recordset[0];

        const result = await contSummary(pin);
        // console.log('contSummary: ', result);

        const rsaBalStr = result?.TOTAL_BALANCE ? result?.TOTAL_BALANCE.toFixed(2) : "";
        const rsaBal = rsaBalStr ? formatAsCurrency(rsaBalStr) : "";
        const fundType = result.FUND_CODE;
        const employerName = await capitalizeWords(employeeInfo.EMPLOYER_NAME);
        const firstName = await capitalizeWords(employeeInfo.FIRSTNAME);
        const surName = await capitalizeWords(employeeInfo.SURNAME);
        const otherName = await employeeInfo.OTHERNAMES ? capitalizeWords(employeeInfo.OTHERNAMES) : '';

        const age = calculateAge(employeeInfo.date_of_birth);

        const clientDetails = {
            pin: employeeInfo.PIN,
            surname: surName,
            firstname: firstName,
            othernames: otherName,
            gender: employeeInfo.GENDER,
            dateOfBirth: employeeInfo.date_of_birth,
            age,
            employer: employerName,
            phoneNumber: employeeInfo.MOBILE_PHONE,
            pinStatus: pinStatus,
            email: employeeInfo.EMAIL,
            rsaBal,
            fundType
        };

        res.status(200).json(clientDetails);

    } catch (error) {
        console.log("Error: ", error);
        return res.status(500).json({
            status: 'error',
            message: 'Something went wrong, please try again later.',
            details: error.message // Optionally send the error details
        });

    } finally {
        await sql.close();
        console.log('SQL connection closed');
    }
})





module.exports = router;