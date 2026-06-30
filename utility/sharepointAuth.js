const axios = require('axios');
const qs = require('qs');

/* ================= TOKEN CACHE ================= */

let cachedToken = null;
let tokenExpiresAt = null;

/* ================= ACCESS TOKEN ================= */

async function getAccessToken() {
    const now = Date.now();

    // Refresh 5 minutes before expiry
    if (cachedToken && tokenExpiresAt && now < tokenExpiresAt - 300000) {
        return cachedToken;
    }

    const response = await axios.post(
        `https://login.microsoftonline.com/${process.env.TENANT_ID}/oauth2/v2.0/token`,
        qs.stringify({
            grant_type: 'client_credentials',
            client_id: process.env.CLIENT_ID,
            client_secret: process.env.CLIENT_SECRET,
            scope: 'https://graph.microsoft.com/.default'
        }),
        {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
        }
    );

    cachedToken = response.data.access_token;
    tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

    console.log('✓ Access token refreshed');
    return cachedToken;
}

module.exports = { getAccessToken };