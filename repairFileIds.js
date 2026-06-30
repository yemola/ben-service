require('dotenv').config();

const axios = require('axios');
const sql = require('mssql');
const { connectToDatabase } = require('./routes/dbconnection');
const { getAccessToken } = require('./utility/sharepointAuth');

/* ================= ENV ================= */

const DRIVE_ID = process.env.DRIVE_ID;

/* ================= GRAPH LOOKUP ================= */

/**
 * Directly fetches the children of a folder by its ID and finds the matching filename.
 */
async function resolveFileIdByFolderId(token, folderId, fileName) {
    // Direct endpoint using Drive ID and Folder (Item) ID
    const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}/children`;

    try {
        const res = await axios.get(url, { 
            headers: { Authorization: `Bearer ${token}` } 
        });

        // Find file by name (using case-insensitive matching for safety)
        const file = res.data.value.find(
            f => f.name.toLowerCase() === fileName.toLowerCase()
        );

        if (!file) {
            throw new Error(`File not found in folder`);
        }

        return file.id;
    } catch (err) {
        if (err.response) {
            // Provides more context if the Folder ID itself is invalid or Drive ID is wrong
            throw new Error(`Graph API error ${err.response.status}: ${err.response.data?.error?.message || err.message}`);
        }
        throw err;
    }
}

/* ================= MAIN ================= */

async function repairFileIds() {
    const pool = await connectToDatabase('BenefitTracker_v2');
    const token = await getAccessToken();

    console.log('--- Starting Repair Process ---');

    // Query for records where we have a folderId to look up
    const records = await pool.request().query(`
        SELECT id, fileName, fileId, folderId
        FROM BenefitTracker_v2.dbo.DocumentMetaData
        WHERE folderId IS NOT NULL 
          AND fileName IS NOT NULL
    `);

    let fixed = 0;
    let failed = 0;
    let skipped = 0;

    for (const row of records.recordset) {
        try {
            const realFileId = await resolveFileIdByFolderId(
                token,
                row.folderId,
                row.fileName
            );

            // Only update if the ID in the DB is missing or incorrect
            if (realFileId !== row.fileId) {
                await pool.request()
                    .input('id', sql.Int, row.id)
                    .input('fileId', sql.VarChar(200), realFileId)
                    .query(`
                        UPDATE BenefitTracker_v2.dbo.DocumentMetaData
                        SET fileId = @fileId
                        WHERE id = @id
                    `);

                console.log(`✓ Updated: ${row.fileName}`);
                fixed++;
            } else {
                skipped++;
            }
        } catch (err) {
            console.error(`✗ Failed: ${row.fileName} (FolderID: ${row.folderId}) - ${err.message}`);
            failed++;
        }
    }

    console.log('\n============================');
    console.log(`Updated : ${fixed}`);
    console.log(`Skipped : ${skipped} (Already correct)`);
    console.log(`Failed  : ${failed}`);
    console.log('============================');

    await pool.close();
}

/* ================= RUN ================= */

if (require.main === module) {
    repairFileIds()
        .then(() => {
            console.log('Process completed successfully.');
            process.exit(0);
        })
        .catch(err => {
            console.error('Fatal Error:', err);
            process.exit(1);
        });
}





// require('dotenv').config();

// const axios = require('axios');
// const sql = require('mssql');
// const { connectToDatabase } = require('./routes/dbconnection');
// const { getAccessToken } = require('./utility/sharepointAuth');

// /* ================= ENV ================= */

// const SITE_ID = process.env.SITE_ID;
// const DRIVE_ID = process.env.DRIVE_ID;

// /* ================= GRAPH LOOKUP ================= */

// async function resolveFileIdByFolderId(token, folderId, fileName) {
//     // The endpoint is direct: /drives/{driveId}/items/{folderId}/children
//     const url = `https://graph.microsoft.com/v1.0/drives/${DRIVE_ID}/items/${folderId}/children`;

//     try {
//         const res = await axios.get(url, { headers: { Authorization: `Bearer ${token}` } });
        
//         // Find the file by name in the children collection
//         const file = res.data.value.find(f => f.name.toLowerCase() === fileName.toLowerCase());
        
//         if (!file) {
//             throw new Error(`File "${fileName}" not found in folder ID: ${folderId}`);
//         }
        
//         return file.id;
//     } catch (err) {
//         if (err.response) {
//             throw new Error(`Graph API error ${err.response.status}: ${err.response.data?.error?.message || err.message}`);
//         }
//         throw err;
//     }
// }

// /* ================= MAIN ================= */

// async function repairFileIds() {
//     const pool = await connectToDatabase('BenefitTracker_v2');
//     const token = await getAccessToken();

//     const records = await pool.request().query(`
//         SELECT id, fileName, fileId, folderId
//         FROM BenefitTracker_v2.dbo.DocumentMetaData
//         WHERE folderUrl IS NOT NULL
//           AND fileName IS NOT NULL
//     `);

//     let fixed = 0;
//     let failed = 0;

//     for (const row of records.recordset) {
//         try {
//             const realFileId = await resolveFileIdByFolderId(
//                 token,
//                 row.folderId,
//                 row.fileName
//             );

//             if (realFileId !== row.fileId) {
//                 await pool.request()
//                     .input('id', sql.Int, row.id)
//                     .input('fileId', sql.VarChar(200), realFileId)
//                     .query(`
//                         UPDATE BenefitTracker_v2.dbo.DocumentMetaData
//                         SET fileId = @fileId
//                         WHERE id = @id
//                     `);

//                 console.log(`✓ Updated: ${row.fileName}`);
//                 fixed++;
//             }
//         } catch (err) {
//             console.error(`✗ Failed: ${row.fileName} - ${err.message}`);
//             failed++;
//         }
//     }

//     console.log('\n============================');
//     console.log(`Fixed : ${fixed}`);
//     console.log(`Failed: ${failed}`);
//     console.log('============================');

//     await pool.close();
// }

// /* ================= RUN ================= */

// if (require.main === module) {
//     repairFileIds()
//         .then(() => process.exit(0))
//         .catch(err => {
//             console.error(err);
//             process.exit(1);
//         });
// }

