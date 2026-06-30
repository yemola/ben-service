const express = require('express');
const router = express.Router();
const fs = require('fs');
const axios = require('axios');
const qs = require('qs');
const path = require('path');
const sql = require('mssql');
const { connectToDatabase } = require('./dbconnection');
const combineDocuments = require('../utility/combineDocuments');
const multer = require('multer');

const { getTenantConfig, getAccessTokenForTenant } = require('../utility/sharePointTenantHelper');

const clientId = process.env.CLIENT_ID;
const clientSecret = process.env.CLIENT_SECRET;
const tenantId = process.env.TENANT_ID;
const driveId = process.env.DRIVE_ID;
const siteId = process.env.SITE_ID;

async function getAccessToken() {
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
        console.log('Token Error: ', error.response ? error.response.data : error.message);
        throw new Error('Failed to retrieve access token');
    }

}

router.post('/', async (req, res) => {
    try {
        const { docId } = req.body;

        // Get folder_path from database to determine which tenant to use
        const pool = await connectToDatabase('BenefitTracker_v2');
        const fileMetaResult = await pool.request()
            .input('fileId', docId)
            .query(`
                SELECT TOP 1 folderUrl, folderId 
                FROM BenefitTracker_v2.dbo.DocumentMetaData 
                WHERE fileId = @fileId
            `);

        let tenantConfig;
        if (fileMetaResult.recordset.length > 0) {
            const folderUrl = fileMetaResult.recordset[0].folderUrl;
            tenantConfig = getTenantConfig(folderUrl);
        } else {
            // Fallback to new tenant if not found
            tenantConfig = getTenantConfig(null);
        }

        const accessToken = await getAccessTokenForTenant(tenantConfig);

        // Step 1: Get file metadata (including the download URL)
        const metadataResponse = await axios.get(`https://graph.microsoft.com/v1.0/drives/${tenantConfig.driveId}/items/${docId}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        // Step 2: Extract the download URL
        const downloadUrl = metadataResponse.data['@microsoft.graph.downloadUrl'];
        if (!downloadUrl) {
            return res.status(500).send('Error: Unable to get download URL.');
        }

        res.json({ downloadUrl });
        // res.send(fileResponse.data);

    } catch (error) {
        console.error('Error serving file:', error);
        res.status(500).send('Error serving the file');
    }
});

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, path.join(__dirname, '../tmp/bntDoc-uploads'))
    },
    filename: function (req, file, cb) {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9)
        cb(null, file.fieldname + '-' + uniqueSuffix)
    }
});

const upload = multer({ storage: storage });

router.post('/folder', async (req, res) => {
    try {
        const { folderId, folderPath } = req.body;

        const pool = await connectToDatabase('BenefitTracker_v2');

        const resFolderName = await pool.request()
            .input('folderId', folderId)
            .query('SELECT folder_name FROM BenefitTracker_v2.dbo.Applications WHERE folder_id = @folderId')

        const folderName = resFolderName.recordset[0]?.folder_name;

        const encodedFolderName = encodeURIComponent(folderName);

        const url = `https://graph.microsoft.com/v1.0/drives/${driveId}/root:/${encodedFolderName}:/children`;
        const accessToken = await getAccessToken();

        // Fetch metadata for all items in the folder
        const folderResponse = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const files = folderResponse.data.value; // Array of file metadata
        if (!files || files.length === 0) {
            return res.status(404).json({ message: 'No files found in the folder.' });
        }

        // Fetch docOrder from database for all files in this folder
        const fileIds = files.map(file => file.id);
        console.log('FileID: ', fileIds);

        // Create a map of fileId to docOrder and database id
        const docOrderMap = new Map();
        const dbIdMap = new Map();

        // Only query database if there are files
        if (fileIds.length > 0) {
            // Add fileId parameters to the query
            const docOrderRequest = await pool.request()
                .input('folderId', folderId);

            fileIds.forEach((fileId, i) => {
                docOrderRequest.input(`fileId${i}`, fileId);
            });

            const docOrderResult = await docOrderRequest.query(`
                SELECT fileId, docOrder, id 
                FROM BenefitTracker_v2.dbo.DocumentMetaData 
                WHERE folderId = @folderId AND fileId IN (${fileIds.map((_, i) => `@fileId${i}`).join(',')})
            `);

            // Populate the maps with results
            docOrderResult.recordset.forEach(record => {
                docOrderMap.set(record.fileId, record.docOrder);
                dbIdMap.set(record.fileId, record.id);
            });
        }

        // Sort files by database id (insertion order), then by docOrder, then by creation date
        const sortedFiles = files.sort((a, b) => {
            const aDbId = dbIdMap.get(a.id);
            const bDbId = dbIdMap.get(b.id);

            // If both files have database id, sort by it (primary criterion)
            if (aDbId !== null && aDbId !== undefined &&
                bDbId !== null && bDbId !== undefined) {
                return aDbId - bDbId;
            }

            // If only one has database id, the one with id comes first
            if (aDbId !== null && aDbId !== undefined &&
                (bDbId === null || bDbId === undefined)) {
                return -1;
            }
            if ((aDbId === null || aDbId === undefined) &&
                bDbId !== null && bDbId !== undefined) {
                return 1;
            }

            // If neither has database id, fall back to docOrder
            const aDocOrder = docOrderMap.get(a.id);
            const bDocOrder = docOrderMap.get(b.id);

            if (aDocOrder !== null && aDocOrder !== undefined &&
                bDocOrder !== null && bDocOrder !== undefined) {
                return aDocOrder - bDocOrder;
            }

            if (aDocOrder !== null && aDocOrder !== undefined &&
                (bDocOrder === null || bDocOrder === undefined)) {
                return -1;
            }
            if ((aDocOrder === null || aDocOrder === undefined) &&
                bDocOrder !== null && bDocOrder !== undefined) {
                return 1;
            }

            // If neither has docOrder, sort by creation date
            const aCreated = new Date(a.createdDateTime || a.createdDate || 0);
            const bCreated = new Date(b.createdDateTime || b.createdDate || 0);

            if (aCreated.getTime() !== bCreated.getTime()) {
                return aCreated.getTime() - bCreated.getTime();
            }

            // If creation dates are the same, sort by numbered prefixes
            const getNumberPrefix = (fileName) => {
                const match = fileName.match(/^(\d+)_/);
                return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
            };

            const aNumber = getNumberPrefix(a.name);
            const bNumber = getNumberPrefix(b.name);

            // If both files have prefixes, sort numerically
            if (aNumber !== Number.MAX_SAFE_INTEGER && bNumber !== Number.MAX_SAFE_INTEGER) {
                return aNumber - bNumber;
            }

            // If only one has a prefix, the one with prefix comes first
            if (aNumber !== Number.MAX_SAFE_INTEGER && bNumber === Number.MAX_SAFE_INTEGER) {
                return -1;
            }
            if (aNumber === Number.MAX_SAFE_INTEGER && bNumber !== Number.MAX_SAFE_INTEGER) {
                return 1;
            }

            // If neither has a prefix, sort alphabetically by filename
            return a.name.localeCompare(b.name);
        });

        const formattedFiles = sortedFiles.map((file) => ({
            fileName: file.name,
            downloadUrl: file['@microsoft.graph.downloadUrl'], // Direct URL for download
            mimeType: file.file?.mimeType || 'application/octet-stream', // Fallback MIME type
            createdDate: file.createdDateTime || file.createdDate, // Include creation date in response
            docOrder: docOrderMap.get(file.id) || null, // Include docOrder in response
            dbId: dbIdMap.get(file.id) || null, // Include database id in response
        }));
        
        console.log('DownloadURL: ', formattedFiles[0]);

        // Send the formatted response to the frontend
        res.status(200).json({ files: formattedFiles });
    } catch (error) {
        console.log('Error fetching documents: ', error.message);
        res.status(500).json({ message: 'Error fetching documents', error: error.message });
    }
});

// router.post('/folder', async (req, res) => {
//     try {
//         const { folderId, folderPath } = req.body;

//         const pool = await connectToDatabase('BenefitTracker_v2');

//         const resFolderName = await pool.request()
//             .input('folderId', folderId)
//             .query('SELECT folder_name, folder_path FROM BenefitTracker_v2.dbo.Applications WHERE folder_id = @folderId')

//         const folderName = resFolderName.recordset[0]?.folder_name;
//         const folderPathA = resFolderName.recordset[0]?.folder_path;

//         if (!folderName) {
//             return res.status(404).json({ message: 'Folder not found.' });
//         }

//         // Determine which tenant to use based on folder_path
//         const tenantConfig = getTenantConfig(folderPathA);
//         const accessToken = await getAccessTokenForTenant(tenantConfig);

//         const encodedFolderName = encodeURIComponent(folderName);
//         const url = `https://graph.microsoft.com/v1.0/drives/${tenantConfig.driveId}/root:/${encodedFolderName}:/children`;

//         // console.log('URL: ', url);

//         // Fetch metadata for all items in the folder
//         const folderResponse = await axios.get(url, {
//             headers: { Authorization: `Bearer ${accessToken}` },
//         });

//         const files = folderResponse.data.value; // Array of file metadata
//         if (!files || files.length === 0) {
//             return res.status(404).json({ message: 'No files found in the folder.' });
//         }

//         // Fetch docOrder from database for all files in this folder
//         const fileIds = files.map(file => file.id);
//         console.log('File IDs: ', fileIds);

//         // Create a map of fileId to docOrder and database id
//         const docOrderMap = new Map();
//         const dbIdMap = new Map();

//         // Only query database if there are files
//         if (fileIds.length > 0) {
//             // Add fileId parameters to the query
//             const docOrderRequest = pool.request()
//                 .input('folderId', folderId);

//             fileIds.forEach((fileId, i) => {
//                 docOrderRequest.input(`fileId${i}`, fileId);
//             });

//             const docOrderResult = await docOrderRequest.query(`
//                 SELECT fileId, docOrder, id 
//                 FROM BenefitTracker_v2.dbo.DocumentMetaData 
//                 WHERE folderId = @folderId AND fileId IN (${fileIds.map((_, i) => `@fileId${i}`).join(',')})
//             `);

//             // Populate the maps with results
//             docOrderResult.recordset.forEach(record => {
//                 docOrderMap.set(record.fileId, record.docOrder);
//                 dbIdMap.set(record.fileId, record.id);
//             });
//         }

//         // Sort files by database id (insertion order), then by docOrder, then by creation date
//         const sortedFiles = files.sort((a, b) => {
//             const aDbId = dbIdMap.get(a.id);
//             const bDbId = dbIdMap.get(b.id);

//             // If both files have database id, sort by it (primary criterion)
//             if (aDbId !== null && aDbId !== undefined &&
//                 bDbId !== null && bDbId !== undefined) {
//                 return aDbId - bDbId;
//             }

//             // If only one has database id, the one with id comes first
//             if (aDbId !== null && aDbId !== undefined &&
//                 (bDbId === null || bDbId === undefined)) {
//                 return -1;
//             }
//             if ((aDbId === null || aDbId === undefined) &&
//                 bDbId !== null && bDbId !== undefined) {
//                 return 1;
//             }

//             // If neither has database id, fall back to docOrder
//             const aDocOrder = docOrderMap.get(a.id);
//             const bDocOrder = docOrderMap.get(b.id);

//             if (aDocOrder !== null && aDocOrder !== undefined &&
//                 bDocOrder !== null && bDocOrder !== undefined) {
//                 return aDocOrder - bDocOrder;
//             }

//             if (aDocOrder !== null && aDocOrder !== undefined &&
//                 (bDocOrder === null || bDocOrder === undefined)) {
//                 return -1;
//             }
//             if ((aDocOrder === null || aDocOrder === undefined) &&
//                 bDocOrder !== null && bDocOrder !== undefined) {
//                 return 1;
//             }

//             // If neither has docOrder, sort by creation date
//             const aCreated = new Date(a.createdDateTime || a.createdDate || 0);
//             const bCreated = new Date(b.createdDateTime || b.createdDate || 0);

//             if (aCreated.getTime() !== bCreated.getTime()) {
//                 return aCreated.getTime() - bCreated.getTime();
//             }

//             // If creation dates are the same, sort by numbered prefixes
//             const getNumberPrefix = (fileName) => {
//                 const match = fileName.match(/^(\d+)_/);
//                 return match ? parseInt(match[1], 10) : Number.MAX_SAFE_INTEGER;
//             };

//             const aNumber = getNumberPrefix(a.name);
//             const bNumber = getNumberPrefix(b.name);

//             // If both files have prefixes, sort numerically
//             if (aNumber !== Number.MAX_SAFE_INTEGER && bNumber !== Number.MAX_SAFE_INTEGER) {
//                 return aNumber - bNumber;
//             }

//             // If only one has a prefix, the one with prefix comes first
//             if (aNumber !== Number.MAX_SAFE_INTEGER && bNumber === Number.MAX_SAFE_INTEGER) {
//                 return -1;
//             }
//             if (aNumber === Number.MAX_SAFE_INTEGER && bNumber !== Number.MAX_SAFE_INTEGER) {
//                 return 1;
//             }

//             // If neither has a prefix, sort alphabetically by filename
//             return a.name.localeCompare(b.name);
//         });

//         const formattedFiles = sortedFiles.map((file) => ({
//             fileName: file.name,
//             downloadUrl: file['@microsoft.graph.downloadUrl'], // Direct URL for download
//             mimeType: file.file?.mimeType || 'application/octet-stream', // Fallback MIME type
//             createdDate: file.createdDateTime || file.createdDate, // Include creation date in response
//             docOrder: docOrderMap.get(file.id) || null, // Include docOrder in response
//             dbId: dbIdMap.get(file.id) || null, // Include database id in response
//         }));

//         // Send the formatted response to the frontend
//         res.status(200).json({ files: formattedFiles });
//     } catch (error) {
//         console.log('Error fetching documents: ', error.message);
//         res.status(500).json({ message: 'Error fetching documents', error: error.message });
//     }
// });

router.post('/files-metadata', async (req, res) => {
    try {
        const { folderId } = req.body;

        const pool = await connectToDatabase('BenefitTracker_v2');

        const metadataRes = await pool.request()
            .input('folderId', folderId)
            .query(`
                    SELECT fileId, fileName FROM BenefitTracker_v2.dbo.DocumentMetaData
                        WHERE folderId = @folderId ORDER BY id`);

        const metadata = metadataRes.recordset;

        res.json(metadata);

    } catch (error) {
        console.log('error fetching metadata: ', error);
    }
});

router.put('/delete-file', async (req, res) => {
    const { fileId } = req.body.params;
    console.log('filEID: ', fileId);

    // Get folder_path from database to determine which tenant to use
    const pool = await connectToDatabase('BenefitTracker_v2');
    const fileMetaResult = await pool.request()
        .input('fileId', fileId)
        .query(`
            SELECT TOP 1 folderUrl 
            FROM BenefitTracker_v2.dbo.DocumentMetaData 
            WHERE fileId = @fileId
        `);

    let tenantConfig;
    if (fileMetaResult.recordset.length > 0) {
        const folderUrl = fileMetaResult.recordset[0].folderUrl;
        tenantConfig = getTenantConfig(folderUrl);
    } else {
        tenantConfig = getTenantConfig(null);
    }

    const deletionUrl = `https://graph.microsoft.com/v1.0/sites/${tenantConfig.siteId}/drives/${tenantConfig.driveId}/items/${fileId}`;
    const accessToken = await getAccessTokenForTenant(tenantConfig);

    try {
        const response = await fetch(deletionUrl, {
            method: 'DELETE',
            headers: {
                Authorization: `Bearer ${accessToken}`,
            },
        });

        if (response.ok) {
            console.log("File deleted successfully.");

            try {
                const fileDeleteRes = await pool.request()
                    .input('fileId', fileId)
                    .query(`DELETE FROM BenefitTracker_v2.dbo.DocumentMetaData
                            WHERE fileId = @fileId`);

                if (fileDeleteRes.rowsAffected && fileDeleteRes.rowsAffected[0] > 0) {
                    res.status(204).send();
                } else {
                    res.status(404).json({
                        error: {
                            message: "File metadata not found in the database.",
                            code: "FILE_METADATA_NOT_FOUND",
                        }
                    });
                }
            } catch (dbError) {
                console.error("Database error:", dbError);
                res.status(500).json({
                    error: {
                        message: "An error occurred while deleting file metadata.",
                        code: "DATABASE_ERROR",
                        details: dbError.message
                    }
                });
            }

        } else {
            console.error(`Failed to delete file: ${response.status} ${response.statusText}`);
            res.json({
                "error": {
                    "message": "File not found or cannot be deleted.",
                    "code": "FILE_NOT_FOUND",
                    "details": {
                        "fileId": "your-file-id"
                    }
                }
            })
        }

    } catch (error) {
        console.error(`Error deleting file: ${error}`);
    }

});

router.post('/merge-docs', async (req, res) => {
    console.log('Payload: ', req.body);

    try {
        const { folderId, clientName } = req.body;
        if (!folderId) return res.status(400).json({ message: 'folderId is required' });

        const pool = await connectToDatabase('BenefitTracker_v2');
        const result = await pool
            .request()
            .input('folderId', folderId)
            .query('SELECT folder_name, folder_path FROM BenefitTracker_v2.dbo.Applications WHERE folder_id = @folderId');

        const folderName = result.recordset[0]?.folder_name;
        const folderPath = result.recordset[0]?.folder_path;
        if (!folderName) return res.status(404).json({ message: 'Folder not found in DB' });

        // Determine which tenant to use based on folder_path
        const tenantConfig = getTenantConfig(folderPath);
        const accessToken = await getAccessTokenForTenant(tenantConfig);
        const encodedFolderName = encodeURIComponent(folderName);
        const url = `https://graph.microsoft.com/v1.0/drives/${tenantConfig.driveId}/root:/${encodedFolderName}:/children`;

        const folderResponse = await axios.get(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
        });

        const files = folderResponse.data.value;
        if (!files || files.length === 0) {
            return res.status(404).json({ message: 'No files found in the folder.' });
        }


        //LOG FILES INFO 
        // console.log('Files in SharePoint folder:', files.map(f => ({
        //     id: f.id,
        //     name: f.name,
        //     createdDateTime: f.createdDateTime,
        //     mimeType: f.file?.mimeType
        // })));

        const fileBuffers = [];
        const supportedExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];

        for (const file of files) {
            // Skip folders or unsupported file types
            if (file.folder) continue;

            const extension = file.name.toLowerCase().slice(file.name.lastIndexOf('.'));
            if (!supportedExtensions.includes(extension)) continue;

            const downloadUrl = file['@microsoft.graph.downloadUrl'];
            if (!downloadUrl) continue;

            try {
                const fileResponse = await axios.get(downloadUrl, {
                    responseType: 'arraybuffer', // important to get binary data
                });

                fileBuffers.push({
                    name: file.name,
                    ext: extension,
                    buffer: fileResponse.data,
                });
            } catch (err) {
                console.warn(`Error downloading file ${file.name}:`, err.message);
            }
        }

        const mergedPdfPath = await combineDocuments(fileBuffers, clientName);

        const fileBuffer = fs.readFileSync(mergedPdfPath);

        res.set({
            'Content-Type': 'application/pdf',
            'Content-Disposition': `attachment; filename="${clientName}-combined.pdf"`,
        });
        res.send(fileBuffer);
    } catch (error) {
        console.error('Error combining documents:', error.message);
        res.status(500).json({ message: 'Failed to combine documents', error: error.message });
    }
});

router.put('/replace-file', upload.single('newFile'), async (req, res) => {
    try {
        const { fileId, folderId } = req.body;
        const file = req.file;
        console.log('Payload: ', fileId, file, folderId);
        if (!fileId || !file || !folderId) {
            return res.status(400).json({
                error: {
                    message: "Missing required parameters: fileId, newFile, or folderId",
                    code: "MISSING_PARAMETERS"
                }
            });
        }

        const accessToken = await getAccessToken();
        const pool = await connectToDatabase('BenefitTracker_v2');

        // Get folder information
        const folderResult = await pool.request()
            .input('folderId', folderId)
            .query('SELECT folder_name FROM BenefitTracker_v2.dbo.Applications WHERE folder_id = @folderId');

        const folderName = folderResult.recordset[0]?.folder_name;
        if (!folderName) {
            return res.status(404).json({
                error: {
                    message: "Folder not found",
                    code: "FOLDER_NOT_FOUND"
                }
            });
        }

        // Get the original file metadata
        const fileMetadataResult = await pool.request()
            .input('fileId', fileId)
            .query('SELECT fileName FROM BenefitTracker_v2.dbo.DocumentMetaData WHERE fileId = @fileId');

        if (fileMetadataResult.recordset.length === 0) {
            return res.status(404).json({
                error: {
                    message: "File metadata not found",
                    code: "FILE_NOT_FOUND"
                }
            });
        }

        // Replace the file in SharePoint
        const replaceUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${fileId}/content`;

        try {
            // Read the uploaded file from the file system
            const fileBuffer = fs.readFileSync(file.path);

            await axios.put(replaceUrl, fileBuffer, {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/octet-stream'
                }
            });

            // Update file metadata if needed (e.g., if the file size changed)
            const updatedFileMetadata = await axios.get(
                `https://graph.microsoft.com/v1.0/sites/${siteId}/drives/${driveId}/items/${fileId}`,
                {
                    headers: { Authorization: `Bearer ${accessToken}` }
                }
            );

            // Update the file size in the database
            await pool.request()
                .input('fileId', fileId)
                .input('fileSize', sql.Int, updatedFileMetadata.data.size / 1024)
                .query(`
                    UPDATE BenefitTracker_v2.dbo.DocumentMetaData
                    SET fileSize = @fileSize
                    WHERE fileId = @fileId
                `);

            // Clean up the temporary uploaded file
            fs.unlink(file.path, (err) => {
                if (err) console.error(`Error deleting temporary file: ${file.path}`, err);
                else console.log(`Deleted temporary file: ${file.path}`);
            });

            res.status(200).json({
                message: "File replaced successfully",
                updatedFile: {
                    id: fileId,
                    name: updatedFileMetadata.data.name,
                    size: updatedFileMetadata.data.size
                }
            });

        } catch (error) {
            console.error('Error replacing file:', error);
            res.status(500).json({
                error: {
                    message: "Failed to replace file",
                    code: "REPLACE_ERROR",
                    details: error.message
                }
            });
        }

    } catch (error) {
        console.error('Error in replace-file route:', error);
        res.status(500).json({
            error: {
                message: "Internal server error",
                code: "SERVER_ERROR",
                details: error.message
            }
        });
    }
});

module.exports = router;