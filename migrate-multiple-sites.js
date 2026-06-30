require('dotenv').config();
const axios = require('axios').create({
    timeout: 300000 // 5 minutes timeout
});
const qs = require('qs');
const fs = require('fs');
const path = require('path');

// Credentials (using variables from .env)
const OLD_TENANT_ID = process.env.OLD_TENANT_ID || process.env.TENANT_ID;
const OLD_CLIENT_ID = process.env.OLD_CLIENT_ID || process.env.CLIENT_ID;
const OLD_CLIENT_SECRET = process.env.OLD_CLIENT_SECRET || process.env.CLIENT_SECRET;

const NEW_TENANT_ID = process.env.NEW_TENANT_ID;
const NEW_CLIENT_ID = process.env.NEW_CLIENT_ID;
const NEW_CLIENT_SECRET = process.env.NEW_CLIENT_SECRET;

// Sites to migrate (Add site names here)
const SITES_TO_MIGRATE = [
    "Audit",
    "Benefits Sub-site",
    "Cash advice (Dividend and Coupon payment notification) from PFCs",
    "CSD",
    "Home",
    "Management Fee",
    "MD's Office",
    "Memo Sub-site",
    "NPL Admin and Facility",
    "NPL Asset Management",
    "NPL BDS",
    "NPL Client Services",
    "NPL Corporate Services",
    "NPL Credit",
    "NPL Digital Marketing and Brands",
    "NPL ERMD",
    "NPL Fund Accounting",
    "NPL Internal Control and Compliance",
    "NPL Investment",
    "NPL Legal",
    "NPL Migration",
    "NPL Operations",
    "NPL Reconciliation",
    "NPL RSA",
    "NPL Technology and Innovation",
    "NPL-Funds-Correspondence",
    "Reports"
];

// Migration status tracking
const migrationSummary = {
    totalSites: SITES_TO_MIGRATE.length,
    processedSites: [],
    startTime: null,
    endTime: null
};

// Token cache
const tokenCache = {
    oldTenant: { token: null, expiresAt: null },
    newTenant: { token: null, expiresAt: null }
};

/**
 * Get access token for a specific tenant
 */
async function getAccessToken(tenantId, clientId, clientSecret, cacheKey) {
    if (tokenCache[cacheKey]?.token && Date.now() < tokenCache[cacheKey].expiresAt - 300000) {
        return tokenCache[cacheKey].token;
    }

    const response = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        qs.stringify({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const expiresAt = Date.now() + (response.data.expires_in * 1000);
    tokenCache[cacheKey] = { token: response.data.access_token, expiresAt };
    return tokenCache[cacheKey].token;
}

/**
 * Resolve Site ID and Drive ID by Site Name
 */
async function resolveSiteAndDrive(accessToken, siteName, tenantName) {
    try {
        console.log(`  Resolving IDs for site: ${siteName} on ${tenantName}...`);
        // Use search endpoint to find site by name
        const siteSearchUrl = `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(siteName)}`;
        const siteResponse = await axios.get(siteSearchUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        // Find exact match
        const site = siteResponse.data.value.find(s => s.name.toLowerCase() === siteName.toLowerCase() || s.displayName.toLowerCase() === siteName.toLowerCase());

        if (!site) {
            // Try direct path if search fails (SharePoint classic/modern site URL pattern)
            try {
                const directUrl = `https://graph.microsoft.com/v1.0/sites/${tenantName}.sharepoint.com:/sites/${siteName}`;
                const directResponse = await axios.get(directUrl, {
                    headers: { Authorization: `Bearer ${accessToken}` }
                });
                return await getDrive(accessToken, directResponse.data.id, siteName);
            } catch (e) {
                throw new Error(`Site "${siteName}" not found in tenant "${tenantName}"`);
            }
        }

        return await getDrive(accessToken, site.id, siteName);
    } catch (error) {
        console.error(`  Error resolving site/drive for ${siteName}:`, error.response?.data || error.message);
        throw error;
    }
}

async function getDrive(accessToken, siteId, siteName) {
    const driveSearchUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`;
    const driveResponse = await axios.get(driveSearchUrl, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });

    const drive = driveResponse.data.value.find(d => d.name === 'Documents') || driveResponse.data.value[0];
    if (!drive) throw new Error(`No drive found for site ${siteName}`);
    return { siteId, driveId: drive.id };
}

/**
 * List files in folder
 */
async function listFilesInFolder(accessToken, folderId, driveId) {
    let retries = 3;
    while (retries > 0) {
        try {
            const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children`;
            const response = await axios.get(url, { headers: { Authorization: `Bearer ${accessToken}` } });
            return response.data.value || [];
        } catch (error) {
            retries--;
            console.error(`  Error listing items in folder ${folderId} (${retries} retries left):`, error.message);
            if (retries === 0) return [];
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

/**
 * Download file
 */
async function downloadFile(accessToken, fileId, driveId) {
    try {
        const metadataResponse = await axios.get(
            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const downloadUrl = metadataResponse.data['@microsoft.graph.downloadUrl'];
        if (!downloadUrl) throw new Error('No download URL found');

        const fileResponse = await axios.get(downloadUrl, { responseType: 'arraybuffer' });
        return { buffer: fileResponse.data, name: metadataResponse.data.name };
    } catch (error) {
        console.error(`  Error downloading file ${fileId}:`, error.message);
        throw error;
    }
}

/**
 * Upload file
 */
async function uploadFile(accessToken, driveId, folderId, fileBuffer, fileName) {
    let retries = 3;
    while (retries > 0) {
        try {
            const uploadUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}:/${encodeURIComponent(fileName)}:/content`;
            const response = await axios.put(uploadUrl, fileBuffer, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/octet-stream'
                },
            });
            return response.data;
        } catch (error) {
            retries--;
            console.error(`  Error uploading file ${fileName} (${retries} retries left):`, error.message);
            if (retries === 0) throw error;
            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait before retry
        }
    }
}

/**
 * Create folder
 */
async function createFolder(accessToken, driveId, parentId, folderName) {
    try {
        // Check if exists
        const items = await listFilesInFolder(accessToken, parentId || 'root', driveId);
        const existing = items.find(i => i.name === folderName && i.folder);
        if (existing) return existing;

        const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${parentId || 'root'}/children`;
        const response = await axios.post(url, {
            name: folderName,
            folder: {},
            "@microsoft.graph.conflictBehavior": "replace"
        }, {
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });
        return response.data;
    } catch (error) {
        console.error(`  Error creating folder ${folderName}:`, error.message);
        throw error;
    }
}

/**
 * Migrate folder recursively
 */
async function migrateFolderRecursive(tokenOld, tokenNew, driveIdOld, driveIdNew, oldFolderId, newParentId, folderName) {
    // Check if folder exists in new tenant
    let newFolder = await createFolder(tokenNew, driveIdNew, newParentId, folderName);

    const itemsOld = await listFilesInFolder(tokenOld, oldFolderId, driveIdOld);
    const itemsNew = await listFilesInFolder(tokenNew, newFolder.id, driveIdNew);
    const existingMap = new Map(itemsNew.map(i => [i.name, i]));

    // If all items already exist in target, we say "Syncing", otherwise "Migrating"
    const isReturningFolder = itemsNew.length >= itemsOld.length;
    console.log(`    ${isReturningFolder ? 'Syncing' : 'Migrating'} folder: ${folderName}`);

    for (const item of itemsOld) {
        if (item.folder) {
            await migrateFolderRecursive(tokenOld, tokenNew, driveIdOld, driveIdNew, item.id, newFolder.id, item.name);
        } else {
            const existing = existingMap.get(item.name);
            if (existing && existing.size === item.size) {
                console.log(`      Skipping (already exists): ${item.name}`);
                continue;
            }

            console.log(`      Uploading file: ${item.name}`);
            try {
                const fileData = await downloadFile(tokenOld, item.id, driveIdOld);
                await uploadFile(tokenNew, driveIdNew, newFolder.id, fileData.buffer, item.name);
            } catch (err) {
                console.error(`      Failed to migrate file ${item.name}:`, err.message);
            }
        }
    }
}

async function migrateSite(siteName) {
    console.log(`\n========================================`);
    console.log(`MIGRATING SITE: ${siteName}`);
    console.log(`========================================`);

    const startTime = new Date();
    try {
        const tokenOld = await getAccessToken(OLD_TENANT_ID, OLD_CLIENT_ID, OLD_CLIENT_SECRET, 'oldTenant');
        const tokenNew = await getAccessToken(NEW_TENANT_ID, NEW_CLIENT_ID, NEW_CLIENT_SECRET, 'newTenant');

        const oldInfo = await resolveSiteAndDrive(tokenOld, siteName, process.env.OLD_TENANT_NAME || 'norrenberger');
        const newInfo = await resolveSiteAndDrive(tokenNew, siteName, process.env.NEW_TENANT_NAME || 'norrenpensions');

        const rootItems = await listFilesInFolder(tokenOld, 'root', oldInfo.driveId);

        for (const item of rootItems) {
            if (item.folder) {
                await migrateFolderRecursive(tokenOld, tokenNew, oldInfo.driveId, newInfo.driveId, item.id, 'root', item.name);
            } else {
                console.log(`    Uploading root file: ${item.name}`);
                const fileData = await downloadFile(tokenOld, item.id, oldInfo.driveId);
                await uploadFile(tokenNew, newInfo.driveId, 'root', fileData.buffer, item.name);
            }
        }

        const duration = (new Date() - startTime) / 1000;
        console.log(`✓ Successfully migrated site: ${siteName} in ${duration}s`);
        return { siteName, status: 'Success', duration };
    } catch (error) {
        console.error(`✗ Failed to migrate site ${siteName}:`, error.message);
        return { siteName, status: 'Failed', error: error.message };
    }
}

async function main() {
    if (SITES_TO_MIGRATE.length === 0) {
        console.log('No sites specified in SITES_TO_MIGRATE array. Please update the script or provide names.');
        return;
    }

    // Load partial log if exists to resume
    const partialLogPath = path.join(__dirname, `multi-site-log-partial.json`);
    if (fs.existsSync(partialLogPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(partialLogPath, 'utf8'));
            migrationSummary.processedSites = data.processedSites || [];
            console.log(`Resuming migration. ${migrationSummary.processedSites.length} sites already processed.`);
        } catch (e) {
            console.log('Could not load partial log, starting fresh.');
        }
    }

    migrationSummary.startTime = new Date();
    for (const siteName of SITES_TO_MIGRATE) {
        // Skip if already successfully processed
        if (migrationSummary.processedSites.find(s => s.siteName === siteName && s.status === 'Success')) {
            console.log(`\nSKIPPING SITE (Already Migrated): ${siteName}`);
            continue;
        }

        const result = await migrateSite(siteName);
        migrationSummary.processedSites.push(result);

        // Save log incrementally
        const logPath = path.join(__dirname, `multi-site-log-partial.json`);
        fs.writeFileSync(logPath, JSON.stringify(migrationSummary, null, 2));
    }
    migrationSummary.endTime = new Date();

    const logPathFinal = path.join(__dirname, `multi-site-log-${Date.now()}.json`);
    fs.writeFileSync(logPathFinal, JSON.stringify(migrationSummary, null, 2));
    console.log(`\nMigration log saved to: ${logPathFinal}`);

    // Cleanup partial log
    if (fs.existsSync(path.join(__dirname, `multi-site-log-partial.json`))) {
        fs.unlinkSync(path.join(__dirname, `multi-site-log-partial.json`));
    }
}

if (require.main === module) {
    main().catch(console.error);
}
