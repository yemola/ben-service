const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.office365.com',
    port: 587,
    auth: {
        user: 'noreply-npl@norrenpensions.com',
        pass: 'G3n3r@l.comm'
    },
    tls: {
        rejectUnauthorized: false
    }
});

module.exports = transporter;