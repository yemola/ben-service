const fs = require('fs');
const path = require('path');
const sharp = require('sharp');
const { PDFDocument } = require('pdf-lib');

async function compressDocuments(documents, requiredDocs, clientName) {
    const compressedFiles = [];

    for (let i = 0; i < documents.length; i++) {
        const document = documents[i];
        const originalName = requiredDocs[i] || `document${i}`;
        // Zero-pad the order number to ensure proper sorting (01, 02, 03, etc.)
        const orderNumber = String(i + 1).padStart(2, '0');
        const truncatedName = originalName.length > 20 ? originalName.slice(0, 20) : originalName;
        // All output files will be PDF
        const fileExtension = 'pdf';
        const safeName = truncatedName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

        // New file name format: '01_proof_of_address-jonah_labaga.pdf'
        const filenameWithOrder = `${orderNumber}_${safeName}`;
        const compressedFilePath = `tmp/bntDoc-uploads/${filenameWithOrder}-${clientName}.${fileExtension}`;

        try {
            if (document.mimetype === 'application/pdf') {
                const srcPdfDoc = await PDFDocument.load(document.buffer);
                const pageCount = srcPdfDoc.getPageCount();

                if (pageCount === 0) {
                    throw new Error(`PDF "${originalName}" has no pages.`);
                }

                const pdfDoc = await PDFDocument.create();
                const copiedPages = await pdfDoc.copyPages(srcPdfDoc, srcPdfDoc.getPageIndices());
                copiedPages.forEach((page) => pdfDoc.addPage(page));
                const pdfBytes = await pdfDoc.save();
                fs.writeFileSync(compressedFilePath, pdfBytes);
            } else if (["image/png", "image/jpeg", "image/jpg"].includes(document.mimetype)) {
                // Convert image to PDF
                const pdfDoc = await PDFDocument.create();
                let embeddedImage;
                if (document.mimetype === 'image/png') {
                    embeddedImage = await pdfDoc.embedPng(document.buffer);
                } else {
                    embeddedImage = await pdfDoc.embedJpg(document.buffer);
                }
                const dims = embeddedImage.scale(1);
                const page = pdfDoc.addPage([dims.width, dims.height]);
                page.drawImage(embeddedImage, {
                    x: 0,
                    y: 0,
                    width: dims.width,
                    height: dims.height,
                });
                const pdfBytes = await pdfDoc.save();
                fs.writeFileSync(compressedFilePath, pdfBytes);
            } else {
                throw new Error(`Unsupported file type: ${document.mimetype}`);
            }

            compressedFiles.push({
                originalName: `${safeName}.${fileExtension}`,
                numberedName: `${filenameWithOrder}.${fileExtension}`,
                compressedPath: compressedFilePath
            });
        } catch (error) {
            console.error(`Failed to process ${originalName}:`, error);
            throw new Error(`Error processing ${originalName}: ${error.message}`);
        }
    }

    return compressedFiles;
}

module.exports = compressDocuments;


// const fs = require('fs');
// const path = require('path');
// const sharp = require('sharp');
// const { PDFDocument } = require('pdf-lib');

// async function compressDocuments(documents, requiredDocs, clientName) {
//     const compressedFiles = [];

//     for (let i = 0; i < documents.length; i++) {
//         const document = documents[i];
//         const originalName = requiredDocs[i] || `document${i}`;
//         const truncatedName = originalName.length > 20 ? originalName.slice(0, 20) : originalName;
//         const fileExtension = document.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
//         const safeName = truncatedName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

//         const compressedFilePath = `tmp/bntDoc-uploads/${safeName}-${clientName}.${fileExtension}`;

//         try {
//             if (document.mimetype === 'application/pdf') {
//                 // Load the uploaded PDF
//                 const srcPdfDoc = await PDFDocument.load(document.buffer);
//                 const pageCount = srcPdfDoc.getPageCount();

//                 if (pageCount === 0) {
//                     throw new Error(`PDF "${originalName}" has no pages.`);
//                 }

//                 // Create a new PDF and copy all pages
//                 const pdfDoc = await PDFDocument.create();
//                 const copiedPages = await pdfDoc.copyPages(srcPdfDoc, srcPdfDoc.getPageIndices());
//                 copiedPages.forEach((page) => pdfDoc.addPage(page));

//                 // Save the new PDF to disk
//                 const pdfBytes = await pdfDoc.save();
//                 fs.writeFileSync(compressedFilePath, pdfBytes);
//             }
//             else if (['image/png', 'image/jpeg', 'image/jpg'].includes(document.mimetype)) {
//                 const compressedImageBuffer = await sharp(document.buffer)
//                     .jpeg({ quality: 70 })
//                     .toBuffer();
//                 fs.writeFileSync(compressedFilePath, compressedImageBuffer);
//             }
//             else {
//                 throw new Error(`Unsupported file type: ${document.mimetype}`);
//             }

//             compressedFiles.push({
//                 originalName: `${safeName}.${fileExtension}`,
//                 compressedPath: compressedFilePath
//             });
//         } catch (error) {
//             console.error(`Failed to process ${originalName}:`, error);
//             throw new Error(`Error processing ${originalName}: ${error.message}`);
//         }
//     }

//     return compressedFiles;
// }

// module.exports = compressDocuments;



// const fs = require('fs');
// const { exec } = require('child_process');
// const sharp = require('sharp');
// const path = require('path');


// async function compressDocuments(documents, requiredDocs, clientName) {
//     const compressedFiles = [];

//     for (let i = 0; i < documents.length; i++) {
//         const document = documents[i];
//         const originalName = requiredDocs[i] || `document${i}`;
//         const truncatedName = originalName.length > 20 ? originalName.slice(0, 20) : originalName;
//         const fileExtension = document.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
//         const safeName = truncatedName.replace(/[^a-z0-9]/gi, '_').toLowerCase();

//         const compressedFilePath = `tmp/bntDoc-uploads/${safeName}-${clientName}.${fileExtension}`;

//         if (document.mimetype === 'application/pdf') {
//             fs.writeFileSync(compressedFilePath, document.buffer);
//         } else if (['image/png', 'image/jpeg', 'image/jpg'].includes(document.mimetype)) {
//             const compressedImageBuffer = await sharp(document.buffer)
//                 .jpeg({ quality: 70 })
//                 .toBuffer();
//             fs.writeFileSync(compressedFilePath, compressedImageBuffer);
//         }

//         compressedFiles.push({
//             originalName: `${safeName}.${fileExtension}`,
//             compressedPath: compressedFilePath
//         });
//     }

//     return compressedFiles;
// }


// module.exports = compressDocuments;





// async function compressPdf(inputPath, outputPath) {
//     const gsPath = '"C:\\Program Files\\gs\\gs10.04.0\\bin\\gswin64c"';
//     return new Promise((resolve, reject) => {
//         exec(`${gsPath} -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`, (error) => {
//             if (error) {
//                 return reject(`Ghostscript compression error: ${error}`);
//             }
//             resolve(outputPath);
//         });
//     });
// }


// async function compressPdf(inputPath, outputPath) {
//     return new Promise((resolve, reject) => {
//         exec(`gswin64c -sDEVICE=pdfwrite -dCompatibilityLevel=1.4 -dPDFSETTINGS=/ebook -dNOPAUSE -dQUIET -dBATCH -sOutputFile="${outputPath}" "${inputPath}"`, (error) => {
//             if (error) {
//                 return reject(`Ghostscript compression error: ${error}`);
//             }
//             resolve(outputPath);
//         });
//     });
// }


// async function compressDocuments(documents, clientName) {
//     const compressedFiles = [];

//     for (const document of documents) {
//         const fileExtension = document.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
//         const fileBaseName = path.parse(document.originalname || 'default').name;

//         const compressedFilePath = `tmp/bntDoc-uploads/${fileBaseName}-compressed.${fileExtension}`;

//         // Simply write the PDF file as-is without Ghostscript compression
//         if (document.mimetype === 'application/pdf') {
//             fs.writeFileSync(compressedFilePath, document.buffer);
//             compressedFiles.push({ originalName: document.originalname, compressedPath: compressedFilePath });
//         }
//         // Compress image files using sharp
//         else if (['image/png', 'image/jpeg', 'image/jpg'].includes(document.mimetype)) {
//             const compressedImageBuffer = await sharp(document.buffer)
//                 .jpeg({ quality: 70 })
//                 .toBuffer();

//             fs.writeFileSync(compressedFilePath, compressedImageBuffer);
//             compressedFiles.push({ originalName: document.originalname, compressedPath: compressedFilePath });
//         }
//     }

//     return compressedFiles;
// }