const fs = require('fs');
const { exec } = require('child_process');
const sharp = require('sharp');
const path = require('path');
const { PDFDocument } = require('pdf-lib');

async function compressAddedDocs(documents, clientName) {
    const compressedFiles = [];

    for (const document of documents) {
        const fileExtension = document.mimetype === 'application/pdf' ? 'pdf' : 'jpg';
        const fileBaseName = path.parse(document.originalname || 'default').name;
        const compressedFilePath = `tmp/bntDoc-uploads/${fileBaseName}-${clientName}.${fileExtension}`;

        try {
            if (document.mimetype === 'application/pdf') {
                // Load the source PDF document
                const srcPdfDoc = await PDFDocument.load(document.buffer);
                const pageCount = srcPdfDoc.getPageCount();

                if (pageCount === 0) {
                    throw new Error('PDF document has no pages');
                }

                // Create a new PDF document
                const pdfDoc = await PDFDocument.create();

                // Copy all pages from the source document
                const copiedPages = await pdfDoc.copyPages(srcPdfDoc, srcPdfDoc.getPageIndices());
                copiedPages.forEach((page) => pdfDoc.addPage(page));

                // Save the PDF with all pages
                const pdfBytes = await pdfDoc.save();
                fs.writeFileSync(compressedFilePath, pdfBytes);

                compressedFiles.push({
                    originalName: document.originalname,
                    compressedPath: compressedFilePath,
                    pageCount: pageCount
                });
            }
            // Compress image files using sharp
            else if (['image/png', 'image/jpeg', 'image/jpg'].includes(document.mimetype)) {
                const compressedImageBuffer = await sharp(document.buffer)
                    .jpeg({ quality: 70 })
                    .toBuffer();

                fs.writeFileSync(compressedFilePath, compressedImageBuffer);
                compressedFiles.push({
                    originalName: document.originalname,
                    compressedPath: compressedFilePath,
                    pageCount: 1
                });
            }
        } catch (error) {
            console.error(`Error processing file ${document.originalname}:`, error);
            throw new Error(`Failed to process file ${document.originalname}: ${error.message}`);
        }
    }

    return compressedFiles;
}

module.exports = compressAddedDocs;