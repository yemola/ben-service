require('dotenv').config();
const axios = require('axios');
const qs = require('qs');
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const { connectToDatabase } = require('./routes/dbconnection');

// Old tenant credentials (current production tenant - norrenberger)
const OLD_TENANT_ID = process.env.TENANT_ID;
const OLD_CLIENT_ID = process.env.CLIENT_ID;
const OLD_CLIENT_SECRET = process.env.CLIENT_SECRET;
const OLD_SITE_ID = process.env.SITE_ID;
const OLD_DRIVE_ID = process.env.DRIVE_ID;
const OLD_BASE_URL = process.env.BASE_URL || "https://graph.microsoft.com/v1.0/drives";

// New tenant credentials (norrenpensions)
const NEW_TENANT_ID = process.env.NEW_TENANT_ID;
const NEW_CLIENT_ID = process.env.NEW_CLIENT_ID;
const NEW_CLIENT_SECRET = process.env.NEW_CLIENT_SECRET;
const NEW_SITE_ID = process.env.NEW_SITE_ID;
const NEW_DRIVE_ID = process.env.NEW_DRIVE_ID;
const NEW_BASE_URL = process.env.NEW_BASE_URL || "https://graph.microsoft.com/v1.0/drives";

// Migration status tracking
const migrationLog = {
    totalFolders: 0,
    migratedFolders: 0,
    failedFolders: [],
    totalFiles: 0,
    migratedFiles: 0,
    failedFiles: [],
    startTime: null,
    endTime: null
};

// Token cache with expiration tracking
const tokenCache = {
    oldTenant: {
        token: null,
        expiresAt: null
    },
    newTenant: {
        token: null,
        expiresAt: null
    }
};

/**
 * Get access token for a specific tenant with caching and auto-refresh
 */
async function getAccessToken(tenantId, clientId, clientSecret, cacheKey) {
    try {
        // Check if we have a valid cached token
        if (tokenCache[cacheKey] && tokenCache[cacheKey].token && tokenCache[cacheKey].expiresAt) {
            const now = Date.now();
            const expiresAt = tokenCache[cacheKey].expiresAt;
            // Refresh token if it expires in less than 5 minutes (300000 ms)
            if (now < expiresAt - 300000) {
                return tokenCache[cacheKey].token;
            }
            console.log(`Token for ${cacheKey} expired or expiring soon, refreshing...`);
        }

        // Fetch new token
        const response = await axios.post(
            `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
            qs.stringify({
                grant_type: 'client_credentials',
                client_id: clientId,
                client_secret: clientSecret,
                scope: 'https://graph.microsoft.com/.default',
            }),
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            }
        );

        const accessToken = response.data.access_token;
        const expiresIn = response.data.expires_in || 3599; // Default to 3599 seconds if not provided

        // Cache the token with expiration time
        const expiresAt = Date.now() + (expiresIn * 1000);
        tokenCache[cacheKey] = {
            token: accessToken,
            expiresAt: expiresAt
        };

        console.log(`✓ Refreshed token for ${cacheKey} (expires in ${expiresIn}s)`);
        return accessToken;
    } catch (error) {
        console.error('Token Error: ', error.response ? error.response.data : error.message);
        throw new Error(`Failed to retrieve access token for tenant ${tenantId}`);
    }
}

/**
 * Get old tenant access token (with caching)
 */
async function getOldAccessToken() {
    return getAccessToken(OLD_TENANT_ID, OLD_CLIENT_ID, OLD_CLIENT_SECRET, 'oldTenant');
}

/**
 * Get new tenant access token (with caching)
 */
async function getNewAccessToken() {
    return getAccessToken(NEW_TENANT_ID, NEW_CLIENT_ID, NEW_CLIENT_SECRET, 'newTenant');
}

/**
 * List all folders from the old tenant
 */
async function listOldTenantFolders(accessToken) {
    try {
        const url = `https://graph.microsoft.com/v1.0/drives/${OLD_DRIVE_ID}/root/children?$filter=folder ne null&$top=1000`;
        const folders = [];
        let nextUrl = url;

        while (nextUrl) {
            const response = await axios.get(nextUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const items = response.data.value || [];
            folders.push(...items.filter(item => item.folder));

            nextUrl = response.data['@odata.nextLink'];
            if (nextUrl) {
                // Remove the host part if it's a full URL, keep only the path
                nextUrl = nextUrl.replace('https://graph.microsoft.com/v1.0', '');
                nextUrl = `https://graph.microsoft.com/v1.0${nextUrl}`;
            }
        }

        return folders;
    } catch (error) {
        console.error('Error listing folders:', error.response ? error.response.data : error.message);
        throw error;
    }
}

/**
 * Get all files in a folder from old tenant
 */
async function listFilesInFolder(accessToken, folderId, driveId = OLD_DRIVE_ID) {
    try {
        // Note: $filter is not supported on /items/{id}/children endpoint
        // So we get all children and filter in code
        const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children`;
        const files = [];
        let nextUrl = url;

        while (nextUrl) {
            const response = await axios.get(nextUrl, {
                headers: { Authorization: `Bearer ${accessToken}` }
            });

            const items = response.data.value || [];
            // Filter out folders, keep only files
            files.push(...items.filter(item => !item.folder));

            nextUrl = response.data['@odata.nextLink'];
            if (nextUrl) {
                // Handle both relative and absolute URLs
                if (!nextUrl.startsWith('http')) {
                    nextUrl = `https://graph.microsoft.com/v1.0${nextUrl}`;
                }
            }
        }

        return files;
    } catch (error) {
        console.error(`Error listing files in folder ${folderId}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

/**
 * Download a file from old tenant
 */
async function downloadFile(accessToken, fileId, driveId = OLD_DRIVE_ID) {
    try {
        // Get file metadata
        const metadataResponse = await axios.get(
            `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${fileId}`,
            { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        const downloadUrl = metadataResponse.data['@microsoft.graph.downloadUrl'];
        if (!downloadUrl) {
            throw new Error('No download URL found');
        }

        // Download the file
        const fileResponse = await axios.get(downloadUrl, {
            responseType: 'arraybuffer'
        });

        return {
            buffer: fileResponse.data,
            name: metadataResponse.data.name,
            size: metadataResponse.data.size,
            mimeType: metadataResponse.data.file?.mimeType || 'application/octet-stream'
        };
    } catch (error) {
        console.error(`Error downloading file ${fileId}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

/**
 * Check if a folder exists in the new tenant
 */
async function checkFolderExists(accessToken, folderName) {
    try {
        const encodedFolderName = encodeURIComponent(folderName);
        const url = `${NEW_BASE_URL}/${NEW_DRIVE_ID}/root:/${encodedFolderName}`;
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        return response.data; // Return folder data if exists
    } catch (error) {
        if (error.response && error.response.status === 404) {
            return null; // Folder doesn't exist
        }
        throw error; // Other errors should be thrown
    }
}

/**
 * Create a folder in the new tenant (or return existing folder if it already exists)
 */
async function createFolderInNewTenant(accessToken, folderName) {
    try {
        // First, check if folder already exists
        const existingFolder = await checkFolderExists(accessToken, folderName);
        if (existingFolder) {
            console.log(`  Folder "${folderName}" already exists in new tenant, using existing folder`);
            return existingFolder;
        }

        // Folder doesn't exist, create it
        const encodedFolderName = encodeURIComponent(folderName);
        // BASE_URL format: "https://graph.microsoft.com/v1.0/drives"
        // Construct full URL: BASE_URL/DRIVE_ID/root:/folderName
        const url = `${NEW_BASE_URL}/${NEW_DRIVE_ID}/root:/${encodedFolderName}`;
        const response = await axios.put(
            url,
            {
                name: folderName,
                folder: {},
                "@microsoft.graph.conflictBehavior": "fail" // Fail if somehow exists (shouldn't happen after check)
            },
            {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                },
            }
        );
        console.log(`  Created new folder "${folderName}" in new tenant`);
        return response.data;
    } catch (error) {
        // If folder creation fails with conflict error, try to get it again
        if (error.response && error.response.status === 409) {
            console.log(`  Folder "${folderName}" was created by another process, retrieving it`);
            return await checkFolderExists(accessToken, folderName);
        }
        console.error(`Error creating folder ${folderName}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

/**
 * Upload a file to the new tenant folder
 */
async function uploadFileToNewTenant(accessToken, folderUrl, fileBuffer, fileName) {
    try {
        const uploadUrl = `${folderUrl}/${fileName}:/content`;
        const response = await axios.put(uploadUrl, fileBuffer, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                'Content-Type': 'application/octet-stream',
                'Accept': 'application/json',
            },
        });
        return response.data;
    } catch (error) {
        console.error(`Error uploading file ${fileName}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

/**
 * Update DocumentMetaData table with new folderId and folderUrl
 */
async function updateDocumentMetaData(pool, oldFolderId, newFolderId, newFolderUrl, fileMapping) {
    try {
        // Update all DocumentMetaData records for this folder
        // First, update files that we successfully migrated
        for (const [oldFileId, newFileId] of Object.entries(fileMapping)) {
            await pool.request()
                .input('oldFileId', sql.VarChar(100), oldFileId)
                .input('oldFolderId', sql.VarChar(100), oldFolderId)
                .input('newFileId', sql.VarChar(100), newFileId)
                .input('newFolderId', sql.VarChar(100), newFolderId)
                .input('newFolderUrl', sql.VarChar(500), newFolderUrl)
                .query(`
                    UPDATE BenefitTracker_v2.dbo.DocumentMetaData
                    SET fileId = @newFileId,
                        folderId = @newFolderId,
                        folderUrl = @newFolderUrl
                    WHERE folderId = @oldFolderId AND fileId = @oldFileId
                `);
        }

        // Also update folderId and folderUrl for any remaining records in this folder
        // (in case some files weren't in the mapping but should still have their folder updated)
        await pool.request()
            .input('oldFolderId', sql.VarChar(100), oldFolderId)
            .input('newFolderId', sql.VarChar(100), newFolderId)
            .input('newFolderUrl', sql.VarChar(500), newFolderUrl)
            .query(`
                UPDATE BenefitTracker_v2.dbo.DocumentMetaData
                SET folderId = @newFolderId,
                    folderUrl = @newFolderUrl
                WHERE folderId = @oldFolderId
            `);

        console.log(`Updated DocumentMetaData for folder ${oldFolderId} -> ${newFolderId}`);
    } catch (error) {
        console.error(`Error updating DocumentMetaData:`, error.message);
        throw error;
    }
}

/**
 * Update Applications table with new folderId and folder_path
 */
async function updateApplications(pool, oldFolderId, newFolderId, newFolderUrl) {
    try {
        await pool.request()
            .input('oldFolderId', sql.VarChar(100), oldFolderId)
            .input('newFolderId', sql.VarChar(100), newFolderId)
            .input('newFolderUrl', sql.VarChar(500), newFolderUrl)
            .query(`
                UPDATE BenefitTracker_v2.dbo.Applications
                SET folder_id = @newFolderId,
                    folder_path = @newFolderUrl
                WHERE folder_id = @oldFolderId
            `);

        console.log(`Updated Applications for folder ${oldFolderId} -> ${newFolderId}`);
    } catch (error) {
        console.error(`Error updating Applications:`, error.message);
        throw error;
    }
}

/**
 * Migrate a single folder from old tenant to new tenant
 */
async function migrateFolder(oldFolder, pool) {
    const folderName = oldFolder.name;
    const oldFolderId = oldFolder.id;
    const oldFolderUrl = oldFolder.webUrl;

    console.log(`\n--- Migrating folder: ${folderName} (${oldFolderId}) ---`);

    try {
        // Get fresh tokens (will use cache if still valid, auto-refresh if expiring soon)
        const oldAccessToken = await getOldAccessToken();
        const newAccessToken = await getNewAccessToken();

        // Step 1: Get all files in the old folder
        const oldFiles = await listFilesInFolder(oldAccessToken, oldFolderId);
        console.log(`Found ${oldFiles.length} files in folder ${folderName}`);

        if (oldFiles.length === 0) {
            console.log(`No files to migrate in folder ${folderName}, creating empty folder`);
        }

        // Step 2: Create folder in new tenant (or use existing if it already exists)
        const newAccessTokenForFolder = await getNewAccessToken();
        const newFolder = await createFolderInNewTenant(newAccessTokenForFolder, folderName);
        const newFolderId = newFolder.id;
        const newFolderUrl = newFolder.webUrl;
        // Use the folder's webUrl to construct the Graph API URL for file uploads
        // The folder.id can be used directly, or we construct the path-based URL
        const encodedFolderName = encodeURIComponent(folderName);
        const newFolderGraphUrl = `https://graph.microsoft.com/v1.0/sites/${NEW_SITE_ID}/drives/${NEW_DRIVE_ID}/root:/${encodedFolderName}`;

        // Step 3: Migrate all files
        // First, check what files already exist in the new folder
        const newAccessTokenForFiles = await getNewAccessToken();
        const existingFiles = await listFilesInFolder(newAccessTokenForFiles, newFolderId, NEW_DRIVE_ID);
        const existingFileNames = new Set(existingFiles.map(f => f.name));
        console.log(`  Found ${existingFiles.length} existing files in new tenant folder`);

        const fileMapping = {}; // oldFileId -> newFileId
        let fileCount = 0;
        let skippedCount = 0;

        for (const oldFile of oldFiles) {
            try {
                // Check if file already exists in new tenant
                if (existingFileNames.has(oldFile.name)) {
                    console.log(`  ⚠ Skipping ${oldFile.name} - already exists in new tenant`);
                    // Try to find the existing file ID for database mapping
                    const existingFile = existingFiles.find(f => f.name === oldFile.name);
                    if (existingFile) {
                        fileMapping[oldFile.id] = existingFile.id;
                    }
                    skippedCount++;
                    continue;
                }

                console.log(`  Migrating file: ${oldFile.name}`);
                
                // Get fresh tokens for each file operation (auto-refreshes if needed)
                const oldTokenForFile = await getOldAccessToken();
                const newTokenForFile = await getNewAccessToken();
                
                // Download file from old tenant
                const fileData = await downloadFile(oldTokenForFile, oldFile.id);
                
                // Upload file to new tenant
                const newFile = await uploadFileToNewTenant(
                    newTokenForFile,
                    newFolderGraphUrl,
                    fileData.buffer,
                    fileData.name
                );

                fileMapping[oldFile.id] = newFile.id;
                fileCount++;
                migrationLog.migratedFiles++;

                console.log(`  ✓ Migrated: ${oldFile.name} (${oldFile.id} -> ${newFile.id})`);
            } catch (error) {
                console.error(`  ✗ Failed to migrate file ${oldFile.name}:`, error.message);
                migrationLog.failedFiles.push({
                    folderName,
                    fileName: oldFile.name,
                    error: error.message
                });
            }
        }

        if (skippedCount > 0) {
            console.log(`  ℹ Skipped ${skippedCount} file(s) that already exist in new tenant`);
        }

        migrationLog.totalFiles += oldFiles.length;

        // Step 4: Update database records (only if files were migrated or folder was created)
        if (fileCount > 0 || oldFiles.length === 0) {
            console.log(`Updating database records for folder ${folderName}...`);
            await updateDocumentMetaData(pool, oldFolderId, newFolderId, newFolderUrl, fileMapping);
            await updateApplications(pool, oldFolderId, newFolderId, newFolderUrl);
        } else {
            console.log(`Skipping database update - no files migrated for folder ${folderName}`);
        }

        console.log(`✓ Successfully migrated folder: ${folderName}`);
        migrationLog.migratedFolders++;

        return {
            success: true,
            oldFolderId,
            newFolderId,
            filesMigrated: fileCount
        };
    } catch (error) {
        console.error(`✗ Failed to migrate folder ${folderName}:`, error.message);
        migrationLog.failedFolders.push({
            folderName,
            folderId: oldFolderId,
            error: error.message
        });
        return {
            success: false,
            oldFolderId,
            error: error.message
        };
    }
}

/**
 * Main migration function
 */
async function migrateSharePoint() {
    console.log('========================================');
    console.log('SharePoint Tenant Migration Script');
    console.log('From: norrenberger');
    console.log('To: norrenpensions');
    console.log('========================================\n');

    // Validate environment variables
    // Old tenant uses current production vars (without OLD_ prefix)
    const requiredOldVars = ['TENANT_ID', 'CLIENT_ID', 'CLIENT_SECRET', 'SITE_ID', 'DRIVE_ID'];
    // New tenant uses NEW_ prefix
    const requiredNewVars = ['NEW_TENANT_ID', 'NEW_CLIENT_ID', 'NEW_CLIENT_SECRET', 'NEW_SITE_ID', 'NEW_DRIVE_ID'];

    const missingOldVars = requiredOldVars.filter(v => !process.env[v]);
    const missingNewVars = requiredNewVars.filter(v => !process.env[v]);

    if (missingOldVars.length > 0) {
        console.error('Missing required environment variables for OLD tenant (current production):');
        missingOldVars.forEach(v => console.error(`  - ${v}`));
        console.error('\nNote: These are your CURRENT production credentials (norrenberger)');
        process.exit(1);
    }

    if (missingNewVars.length > 0) {
        console.error('Missing required environment variables for NEW tenant:');
        missingNewVars.forEach(v => console.error(`  - ${v}`));
        console.error('\nNote: Add NEW_ prefix to your new tenant credentials (norrenpensions)');
        process.exit(1);
    }

    migrationLog.startTime = new Date();
    let pool;

    try {
        // Connect to database
        console.log('Connecting to database...');
        pool = await connectToDatabase('BenefitTracker_v2');
        console.log('✓ Connected to database\n');

        // Get initial access tokens (will be auto-refreshed as needed)
        console.log('Authenticating with SharePoint tenants...');
        const initialOldToken = await getOldAccessToken();
        console.log('✓ Authenticated with OLD tenant');
        
        const initialNewToken = await getNewAccessToken();
        console.log('✓ Authenticated with NEW tenant\n');

        // List all folders from old tenant
        console.log('Fetching folders from old tenant...');
        const oldFolders = await listOldTenantFolders(initialOldToken);
        migrationLog.totalFolders = oldFolders.length;
        console.log(`Found ${oldFolders.length} folders to migrate\n`);

        if (oldFolders.length === 0) {
            console.log('No folders found to migrate.');
            return;
        }

        // Migrate each folder (tokens will be auto-refreshed inside migrateFolder)
        console.log('Starting folder migration...\n');
        for (const folder of oldFolders) {
            await migrateFolder(folder, pool);
            // Add a small delay to avoid rate limiting
            await new Promise(resolve => setTimeout(resolve, 1000));
        }

        migrationLog.endTime = new Date();
        const duration = (migrationLog.endTime - migrationLog.startTime) / 1000;

        // Print summary
        console.log('\n========================================');
        console.log('Migration Summary');
        console.log('========================================');
        console.log(`Total Folders: ${migrationLog.totalFolders}`);
        console.log(`Migrated: ${migrationLog.migratedFolders}`);
        console.log(`Failed: ${migrationLog.failedFolders.length}`);
        console.log(`Total Files: ${migrationLog.totalFiles}`);
        console.log(`Migrated: ${migrationLog.migratedFiles}`);
        console.log(`Failed: ${migrationLog.failedFiles.length}`);
        console.log(`Duration: ${Math.round(duration)}s`);
        console.log('========================================\n');

        if (migrationLog.failedFolders.length > 0) {
            console.log('Failed Folders:');
            migrationLog.failedFolders.forEach(f => {
                console.log(`  - ${f.folderName}: ${f.error}`);
            });
            console.log();
        }

        if (migrationLog.failedFiles.length > 0) {
            console.log('Failed Files:');
            migrationLog.failedFiles.forEach(f => {
                console.log(`  - ${f.folderName}/${f.fileName}: ${f.error}`);
            });
            console.log();
        }

        // Save migration log to file
        const logFilePath = path.join(__dirname, `migration-log-${Date.now()}.json`);
        fs.writeFileSync(logFilePath, JSON.stringify(migrationLog, null, 2));
        console.log(`Migration log saved to: ${logFilePath}`);

    } catch (error) {
        console.error('Migration failed:', error);
        throw error;
    } finally {
        if (pool) {
            await pool.close();
            console.log('Database connection closed');
        }
    }
}

// Run migration if called directly
if (require.main === module) {
    migrateSharePoint()
        .then(() => {
            console.log('\nMigration completed successfully!');
            process.exit(0);
        })
        .catch((error) => {
            console.error('\nMigration failed:', error);
            process.exit(1);
        });
}

module.exports = { migrateSharePoint };

