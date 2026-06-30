const express = require('express');
require('dotenv').config();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const router = express.Router();
const sql = require('mssql');
const yup = require("yup");
const { connectToDatabase } = require('./dbconnection');
const validateWith = require("../middleware/validation");
const transporter = require("../utility/EmailTransporter");

const schema = yup.object().shape({
    username: yup.string().required().min(3).max(20),
    password: yup.string().required().min(5).max(20),
});

const signupSchema = yup.object().shape({
    otp: yup.string().required(),
    user_name: yup.string().required().min(3).max(20),
    password: yup.string().required().min(6).max(20),
});



router.post('/generate-otp', async (req, res) => {
    const { username } = req.body;

    const min = 200000
    const max = 900000
    const otp = Math.floor(Math.random() * (max - min) + min);
    console.log('OTP: ', otp);

    try {
        const pool = await connectToDatabase('BenefitTracker');

        const userEmail = await pool.request()
            .input('user_name', sql.VarChar(20), username)
            .query(`
                SELECT email, name FROM BenefitTracker_v2.dbo.Users
                WHERE user_name = @user_name`);



        if (userEmail.recordset.length > 0) {
            const emailRes = userEmail.recordset[0];
            const { email, name } = emailRes;

            const option = {
                from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
                to: email,
                bcc: 'olayemi.abusango@norrenpensions.com',
                subject: "Account Verification",
                html: `
				
				<b>Dear ${name},</b> <br>
				
				<p>Getting started on the Benefit Tracker application?</p>
				<p>Use this one-time-pin(OTP) <Strong style="padding:3px; margin-right:3px; font-size:1.2em; background:blue; color: white">${otp} </strong> to verify your account</p>
                <p>If you did not initiate this OTP generation, please immediately contact the ICT department to ensure the security of your account.</p>
				<p>Thank You.</p>
                <p>Norrenberger Pensions Ltd</p>
				`
            }

            transporter.sendMail(option, async function (err, info) {
                if (err) {
                    console.log(err)
                    return
                }
                else {
                    if (info.response) {
                        const otpRes = await pool.request()
                            .input('otp_ver', otp)
                            .input('user_name', username)
                            .query(
                                `UPDATE BenefitTracker_v2.dbo.Users 
                        SET otp_ver = @otp_ver,
                            otp_createdAt = GETDATE()
                        WHERE user_name = @user_name`
                            )

                        const otpSaved = otpRes.rowsAffected[0];

                        otpSaved && res.json({ message: 'OTP successfully sent.' });
                    }

                }
            });


        } else {
            res.json({ message: 'Error sending OTP.' });
        }


    } catch (error) {
        console.log('signup error: ', error);
    }

});


router.put('/signup', async (req, res) => {
    const { otp, user_name, password } = req.body;

    const hashedPassword = await bcrypt.hash(password, 10);

    const pool = await connectToDatabase('BenefitTracker');

    const findUser = await pool.request()
        .input('otp', sql.VarChar(20), otp)
        .input('user_name', sql.VarChar(20), user_name)
        .query(
            `SELECT user_name FROM BenefitTracker_v2.dbo.Users
                WHERE otp_ver = @otp`
        );

    const userFound = findUser.rowsAffected[0];

    if (userFound) {
        const result = await pool.request()
            .input('otp', sql.VarChar(20), otp)
            .input('password', sql.VarChar(255), hashedPassword)
            .input('user_name', sql.VarChar(20), user_name)
            .query(`UPDATE BenefitTracker_v2.dbo.Users
                    SET password = @password,
                    otp_ver = NULL,
                    modified_at = GETDATE()
                    WHERE user_name = @user_name`);

        const userSignedUp = result.rowsAffected[0];
        const message = userSignedUp === 1 ? 'Successfully signed up.' : 'Sign up failed.';

        res.status(200).json({ message });
    } else {
        res.status(404).json({ message: 'user not found.' });
    }
})

router.post('/', validateWith(schema), async (req, res) => {
    const body = req.body;

    const { username, password } = req.body;
    const pool = await connectToDatabase('BenefitTracker_v2');

    try {
        const result = await pool.request()
            .input('user_name', sql.VarChar(20), username)
            .query(
                `SELECT password, user_name, name, branch, email, id, role_id, role2_id FROM BenefitTracker_v2.dbo.Users
                    WHERE user_name = @user_name AND is_active = 1`
            );

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: 'User not found.' });
        }

        const user = await result.recordset[0];
        const hashedPassword = user.password;

        const isMatch = await bcrypt.compare(password, hashedPassword);

        if (isMatch) {
            const { password, ...userDetails } = user;

            const token = jwt.sign({ ...userDetails }, process.env.JWT_SEC);

            res.status(200).json(token);
        } else {
            res.status(401).json({ message: 'Invalid credentials' });
        }


    } catch (error) {
        console.error('Error during login', error);
        res.status(500).json({ message: 'Internal server error.' });
    }


})


module.exports = router;