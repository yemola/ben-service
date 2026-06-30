
// /**
//  * SharePoint Tenant Helper
//  * 
//  * This utility helps determine which SharePoint tenant to use based on folder_path
//  * stored in the database. This enables zero-downtime migration where:
//  * - Old folders (norrenberger) are accessed using old tenant credentials
//  * - New folders (norrenpensions) are accessed using new tenant credentials
//  */

// /**
//  * Determine tenant configuration based on folder_path or folderUrl
//  * @param {string} folderPath - The folder_path or folderUrl from database
//  * @returns {object} Tenant configuration object
//  */
// function getTenantConfig(folderPath) {
//     // If no folderPath provided, default to new tenant (for new uploads)
//     if (!folderPath) {
//         return getNewTenantConfig();
//     }

//     // Check if folder path contains old tenant domain
//     if (folderPath.includes('norrenberger.sharepoint.com')) {
//         return getOldTenantConfig();
//     }

//     // Check if folder path contains new tenant domain
//     if (folderPath.includes('norrenpensions.sharepoint.com')) {
//         return getNewTenantConfig();
//     }

//     // Default to new tenant for any other case (including null/undefined)
//     return getNewTenantConfig();
// }

// /**
//  * Get old tenant configuration (norrenberger)
//  */
// function getOldTenantConfig() {
//     return {
//         tenantId: process.env.TENANT_ID,
//         clientId: process.env.CLIENT_ID,
//         clientSecret: process.env.CLIENT_SECRET,
//         siteId: process.env.SITE_ID,
//         driveId: process.env.DRIVE_ID,
//         baseUrl: process.env.BASE_URL || "https://graph.microsoft.com/v1.0/drives",
//         isOldTenant: true
//     };
// }

// /**
//  * Get new tenant configuration (norrenpensions)
//  */
// function getNewTenantConfig() {
//     return {
//         tenantId: process.env.TENANT_ID,
//         clientId: process.env.CLIENT_ID,
//         clientSecret: process.env.CLIENT_SECRET,
//         siteId: process.env.SITE_ID,
//         driveId: process.env.DRIVE_ID,
//         baseUrl: process.env.BASE_URL || process.env.BASE_URL || "https://graph.microsoft.com/v1.0/drives",
//         isOldTenant: false
//     };
// }

// /**
//  * Get access token for a specific tenant configuration
//  */
// async function getAccessTokenForTenant(tenantConfig) {
//     const axios = require('axios');
//     const qs = require('qs');

//     try {
//         const response = await axios.post(
//             `https://login.microsoftonline.com/${tenantConfig.tenantId}/oauth2/v2.0/token`,
//             qs.stringify({
//                 grant_type: 'client_credentials',
//                 client_id: tenantConfig.clientId,
//                 client_secret: tenantConfig.clientSecret,
//                 scope: 'https://graph.microsoft.com/.default',
//             }),
//             {
//                 headers: {
//                     'Content-Type': 'application/x-www-form-urlencoded'
//                 }
//             }
//         );
//         return response.data.access_token;
//     } catch (error) {
//         console.error('Token Error: ', error.response ? error.response.data : error.message);
//         throw new Error(`Failed to retrieve access token for tenant ${tenantConfig.tenantId}`);
//     }
// }


// module.exports = {
//     getTenantConfig,
//     getOldTenantConfig,
//     getNewTenantConfig,
//     getAccessTokenForTenant
// };

