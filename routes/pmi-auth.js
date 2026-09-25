// Resolve configuration from the API project, regardless of the launch directory.
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const sql = require('mssql');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { connectToDatabase } = require('./dbconnection');
const transporter = require('../utility/EmailTransporter');
const router = express.Router();
const fingerprint = value => crypto.createHash('sha256').update(value).digest('hex');
const emailOf = body => typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
const validEmail = value => value.length <= 255 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
// Bound repeated attempts per IP. Production deployments with multiple processes should share this limiter.
const attempts = new Map();
router.use((req, res, next) => {
    const now = Date.now();
    for (const [key, value] of attempts) if (value.until <= now) attempts.delete(key);
    const key = `${req.ip}:${req.path}`;
    const value = attempts.get(key) || { count: 0, until: now + 15 * 60 * 1000 };
    value.count++;
    attempts.set(key, value);
    if (value.count > 10) return res.status(429).json({ message: 'Too many attempts. Please try again in 15 minutes.' });
    next();
});
router.post('/password-link', async (req, res) => {
    const email = emailOf(req.body);
    if (!validEmail(email)) return res.status(400).json({ message: 'Enter a valid email address.' });
    try {
        const origin = process.env.PMI_PORTAL_URL;
        if (!origin || !/^https?:\/\//.test(origin)) return res.status(503).json({ message: 'Password setup is unavailable because the server PMI_PORTAL_URL setting is missing or invalid. Contact your administrator.' });
        const pool = await connectToDatabase('BenefitTracker_v2');
        const result = await pool.request().input('email', sql.NVarChar(255), email).query(`
            SELECT id, email, password FROM dbo.Users WHERE LOWER(LTRIM(RTRIM(email))) = @email
            AND account_type = 'pmi' AND is_active = 1`);
        const user = result.recordset[0];
        if (user) {
            const token = jwt.sign({ sub: String(user.id), purpose: 'pmi-password', version: fingerprint(user.password) }, process.env.JWT_SEC,
                { expiresIn: '15m', audience: 'pmi-password' });
            const link = `${origin.replace(/\/$/, '')}/pmi/create-password?token=${encodeURIComponent(token)}`;
            await transporter.sendMail({ from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>', to: user.email,
                subject: 'Create your PMI Benefit Tracker password',
                text: `Use this link to create or reset your PMI password: ${link}\nIt expires in 15 minutes and can be used once. If you did not request it, ignore this email.` });
        }
        return res.json({ message: 'If an active PMI account exists for this email, a password setup link has been sent.' });
    } catch (error) {
        console.error('PMI password email failed');
        return res.status(500).json({ message: 'Unable to send password setup email. Please try again later.' });
    }
});
router.post('/password', async (req, res) => {
    const { token, password } = req.body || {};
    if (typeof token !== 'string' || typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72) {
        return res.status(400).json({ message: 'Provide the setup link and a password of at least 8 characters (at most 72 UTF-8 bytes).' });
    }
    let claims;
    try {
        claims = jwt.verify(token, process.env.JWT_SEC, { audience: 'pmi-password' });
        if (claims.purpose !== 'pmi-password' || !/^\d+$/.test(claims.sub)) throw new Error();
    } catch { return res.status(400).json({ message: 'This password link is invalid or expired. Request a new one.' }); }
    try {
        const pool = await connectToDatabase('BenefitTracker_v2');
        const result = await pool.request().input('id', sql.Int, Number(claims.sub)).query(`SELECT password FROM dbo.Users WHERE id = @id AND account_type = 'pmi' AND is_active = 1`);
        const oldPassword = result.recordset[0]?.password;
        if (!oldPassword || fingerprint(oldPassword) !== claims.version) return res.status(400).json({ message: 'This link has already been used or is no longer valid.' });
        const hash = await bcrypt.hash(password, 12);
        const updated = await pool.request().input('id', sql.Int, Number(claims.sub))
            .input('old', sql.VarChar(255), oldPassword).input('hash', sql.VarChar(255), hash).query(`
                UPDATE dbo.Users SET password = @hash, modified_at = GETDATE()
                WHERE id = @id AND password = @old AND account_type = 'pmi' AND is_active = 1`);
        if (updated.rowsAffected[0] !== 1) return res.status(400).json({ message: 'This link is no longer valid.' });
        return res.json({ message: 'Password saved. You can now sign in with your email.' });
    } catch { return res.status(500).json({ message: 'Unable to save password.' }); }
});
router.post('/login', async (req, res) => {
    const email = emailOf(req.body);
    const password = req.body?.password;
    if (!validEmail(email) || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) return res.status(400).json({ message: 'Enter a valid email and password.' });
    try {
        const pool = await connectToDatabase('BenefitTracker_v2');
        const result = await pool.request().input('email', sql.NVarChar(255), email).query(`
            SELECT id, name, email, password, pmi_institution_id, pmi_institution_name FROM dbo.Users
            WHERE LOWER(LTRIM(RTRIM(email))) = @email AND account_type = 'pmi' AND is_active = 1`);
        const user = result.recordset[0];
        if (!user || !await bcrypt.compare(password, user.password)) return res.status(401).json({ message: 'Invalid email or password.' });
        const { password: ignored, ...identity } = user;
        const token = jwt.sign({ ...identity, account_type: 'pmi' }, process.env.JWT_SEC, { expiresIn: '8h', audience: 'pmi-portal' });
        return res.json({ token, user: { ...identity, account_type: 'pmi' } });
    } catch { return res.status(500).json({ message: 'Unable to sign in.' }); }
});
module.exports = router;
