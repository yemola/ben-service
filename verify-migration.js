require('dotenv').config();
const axios = require('axios');
const qs = require('qs');
const sql = require('mssql');
const { connectToDatabase } = require('./routes/dbconnection');

/**
 * Verification Script for SharePoint Migration
 * 
 * This script verifies that the migration completed successfully by:
 * 1. Comparing folder counts between old and new tenants
 * 2. Comparing file counts in each folder
 * 3. Verifying database records are updated correctly
 * 4. Checking that folder IDs and URLs in database match new tenant
 */

// Old tenant credentials (current production - norrenberger)
const OLD_TENANT_ID = process.env.TENANT_ID;
const OLD_CLIENT_ID = process.env.CLIENT_ID;
const OLD_CLIENT_SECRET = process.env.CLIENT_SECRET;
const OLD_DRIVE_ID = process.env.DRIVE_ID;

// New tenant credentials (norrenpensions)
const NEW_TENANT_ID = process.env.NEW_TENANT_ID;
const NEW_CLIENT_ID = process.env.NEW_CLIENT_ID;
const NEW_CLIENT_SECRET = process.env.NEW_CLIENT_SECRET;
const NEW_DRIVE_ID = process.env.NEW_DRIVE_ID;
const NEW_SITE_ID = process.env.NEW_SITE_ID;

async function getAccessToken(tenantId, clientId, clientSecret) {
    try {
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
        return response.data.access_token;
    } catch (error) {
        console.error('Token Error: ', error.response ? error.response.data : error.message);
        throw new Error(`Failed to retrieve access token for tenant ${tenantId}`);
    }
}

async function listFolders(accessToken, driveId) {
    try {
        const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root/children?$filter=folder ne null&$top=1000`;
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

async function listFilesInFolder(accessToken, folderId, driveId) {
    try {
        // Note: $filter is not supported on /items/{id}/children endpoint
        // So we get all children and filter in code
        const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children`;
        const response = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });
        const items = response.data.value || [];
        // Filter out folders, keep only files
        return items.filter(item => !item.folder);
    } catch (error) {
        console.error(`Error listing files in folder ${folderId}:`, error.response ? error.response.data : error.message);
        return [];
    }
}

async function verifyMigration() {
    console.log('========================================');
    console.log('SharePoint Migration Verification');
    console.log('========================================\n');

    let pool;
    const verificationResults = {
        oldTenantFolders: 0,
        newTenantFolders: 0,
        folderMismatches: [],
        databaseRecords: {
            totalApplications: 0,
            totalDocumentMetaData: 0,
            updatedApplications: 0,
            updatedDocumentMetaData: 0,
            orphanedRecords: []
        }
    };

    try {
        // Connect to database
        console.log('Connecting to database...');
        pool = await connectToDatabase('BenefitTracker_v2');
        console.log('✓ Connected to database\n');

        // Get access tokens
        console.log('Authenticating with SharePoint tenants...');
        const oldAccessToken = await getAccessToken(OLD_TENANT_ID, OLD_CLIENT_ID, OLD_CLIENT_SECRET);
        console.log('✓ Authenticated with OLD tenant');
        
        const newAccessToken = await getAccessToken(NEW_TENANT_ID, NEW_CLIENT_ID, NEW_CLIENT_SECRET);
        console.log('✓ Authenticated with NEW tenant\n');

        // List folders from both tenants
        console.log('Fetching folders from tenants...');
        const oldFolders = await listFolders(oldAccessToken, OLD_DRIVE_ID);
        const newFolders = await listFolders(newAccessToken, NEW_DRIVE_ID);
        
        verificationResults.oldTenantFolders = oldFolders.length;
        verificationResults.newTenantFolders = newFolders.length;

        console.log(`Old tenant folders: ${oldFolders.length}`);
        console.log(`New tenant folders: ${newFolders.length}\n`);

        // Create maps for quick lookup
        const oldFolderMap = new Map(oldFolders.map(f => [f.name, f]));
        const newFolderMap = new Map(newFolders.map(f => [f.name, f]));

        // Compare folders
        console.log('Comparing folders...');
        for (const oldFolder of oldFolders) {
            const newFolder = newFolderMap.get(oldFolder.name);
            
            if (!newFolder) {
                verificationResults.folderMismatches.push({
                    folderName: oldFolder.name,
                    issue: 'Folder missing in new tenant'
                });
                console.log(`  ✗ Missing: ${oldFolder.name}`);
                continue;
            }

            // Compare file counts
            const oldFiles = await listFilesInFolder(oldAccessToken, oldFolder.id, OLD_DRIVE_ID);
            const newFiles = await listFilesInFolder(newAccessToken, newFolder.id, NEW_DRIVE_ID);

            if (oldFiles.length !== newFiles.length) {
                verificationResults.folderMismatches.push({
                    folderName: oldFolder.name,
                    issue: `File count mismatch (old: ${oldFiles.length}, new: ${newFiles.length})`
                });
                console.log(`  ⚠ File count mismatch in ${oldFolder.name}: ${oldFiles.length} vs ${newFiles.length}`);
            } else {
                console.log(`  ✓ ${oldFolder.name}: ${oldFiles.length} files`);
            }
        }

        // Verify database records
        console.log('\nVerifying database records...');
        
        // Check Applications table
        const appsResult = await pool.request().query(`
            SELECT COUNT(*) as total FROM BenefitTracker_v2.dbo.Applications
        `);
        verificationResults.databaseRecords.totalApplications = appsResult.recordset[0].total;

        // Check DocumentMetaData table
        const metaResult = await pool.request().query(`
            SELECT COUNT(*) as total FROM BenefitTracker_v2.dbo.DocumentMetaData
        `);
        verificationResults.databaseRecords.totalDocumentMetaData = metaResult.recordset[0].total;

        // Check if any records still reference old tenant (check if folderId exists in new tenant)
        const newFolderIds = new Set(newFolders.map(f => f.id));
        
        const appsWithOldFolders = await pool.request().query(`
            SELECT DISTINCT folder_id, folder_name 
            FROM BenefitTracker_v2.dbo.Applications 
            WHERE folder_id IS NOT NULL
        `);

        for (const app of appsWithOldFolders.recordset) {
            if (app.folder_id && !newFolderIds.has(app.folder_id)) {
                // Check if it's actually an old folder ID
                const isOldFolder = oldFolders.some(f => f.id === app.folder_id);
                if (isOldFolder) {
                    verificationResults.databaseRecords.orphanedRecords.push({
                        table: 'Applications',
                        folderId: app.folder_id,
                        folderName: app.folder_name
                    });
                }
            } else {
                verificationResults.databaseRecords.updatedApplications++;
            }
        }

        // Check DocumentMetaData
        const metaWithOldFolders = await pool.request().query(`
            SELECT DISTINCT folderId 
            FROM BenefitTracker_v2.dbo.DocumentMetaData 
            WHERE folderId IS NOT NULL
        `);

        for (const meta of metaWithOldFolders.recordset) {
            if (meta.folderId && !newFolderIds.has(meta.folderId)) {
                const isOldFolder = oldFolders.some(f => f.id === meta.folderId);
                if (isOldFolder) {
                    verificationResults.databaseRecords.orphanedRecords.push({
                        table: 'DocumentMetaData',
                        folderId: meta.folderId
                    });
                }
            } else {
                verificationResults.databaseRecords.updatedDocumentMetaData++;
            }
        }

        // Print summary
        console.log('\n========================================');
        console.log('Verification Summary');
        console.log('========================================');
        console.log(`Old Tenant Folders: ${verificationResults.oldTenantFolders}`);
        console.log(`New Tenant Folders: ${verificationResults.newTenantFolders}`);
        console.log(`Folder Mismatches: ${verificationResults.folderMismatches.length}`);
        console.log(`\nDatabase Records:`);
        console.log(`  Applications: ${verificationResults.databaseRecords.totalApplications}`);
        console.log(`  DocumentMetaData: ${verificationResults.databaseRecords.totalDocumentMetaData}`);
        console.log(`  Orphaned Records: ${verificationResults.databaseRecords.orphanedRecords.length}`);
        console.log('========================================\n');

        if (verificationResults.folderMismatches.length > 0) {
            console.log('Folder Mismatches:');
            verificationResults.folderMismatches.forEach(m => {
                console.log(`  - ${m.folderName}: ${m.issue}`);
            });
            console.log();
        }

        if (verificationResults.databaseRecords.orphanedRecords.length > 0) {
            console.log('Orphaned Database Records (still referencing old tenant):');
            verificationResults.databaseRecords.orphanedRecords.forEach(r => {
                console.log(`  - ${r.table}: folderId=${r.folderId}${r.folderName ? `, folderName=${r.folderName}` : ''}`);
            });
            console.log();
        }

        // Save verification report
        const reportPath = `verification-report-${Date.now()}.json`;
        require('fs').writeFileSync(reportPath, JSON.stringify(verificationResults, null, 2));
        console.log(`Verification report saved to: ${reportPath}`);

        // Overall status
        const isSuccessful = 
            verificationResults.oldTenantFolders === verificationResults.newTenantFolders &&
            verificationResults.folderMismatches.length === 0 &&
            verificationResults.databaseRecords.orphanedRecords.length === 0;

        if (isSuccessful) {
            console.log('\n✓ Verification PASSED - Migration appears successful!');
        } else {
            console.log('\n⚠ Verification found issues - Please review the report above');
        }

    } catch (error) {
        console.error('Verification failed:', error);
        throw error;
    } finally {
        if (pool) {
            await pool.close();
            console.log('Database connection closed');
        }
    }
}

// Run verification if called directly
if (require.main === module) {
    verifyMigration()
        .then(() => {
            process.exit(0);
        })
        .catch((error) => {
            console.error('Verification failed:', error);
            process.exit(1);
        });
}

module.exports = { verifyMigration };

