const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');

async function combineDocuments(documents, clientName) {
  const pdfDoc = await PDFDocument.create();

  console.log(documents.map(doc => ({
    mimetype: doc.mimetype,
    bufferLength: doc.buffer?.length
  })));


  for (const document of documents) {

    if (document.ext === '.pdf') {
      // Add existing PDF to the document
      const existingPdf = await PDFDocument.load(document.buffer);
      const copiedPages = await pdfDoc.copyPages(existingPdf, existingPdf.getPageIndices());
      copiedPages.forEach((page) => pdfDoc.addPage(page));
    } else if (['.png', '.jpeg', '.jpg'].includes(document.ext)) {
      // Embed the image in the PDF directly without compression
      let embeddedImage;
      let imageDims;

      if (document.ext === '.png') {
        embeddedImage = await pdfDoc.embedPng(document.buffer);
      } else {
        embeddedImage = await pdfDoc.embedJpg(document.buffer);
      }

      imageDims = embeddedImage.scale(1);

      const page = pdfDoc.addPage([imageDims.width, imageDims.height]);
      page.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: imageDims.width,
        height: imageDims.height,
      });
    }
  }

  const pdfBytes = await pdfDoc.save();
  const outputPath = `tmp/bntDoc-uploads/${clientName}-docs.pdf`;
  fs.writeFileSync(outputPath, pdfBytes);

  return outputPath;
}

module.exports = combineDocuments;


// const fs = require('fs');
// const path = require('path');
// const { PDFDocument } = require('pdf-lib');
// const sharp = require('sharp');

// async function combineDocuments(documents, clientName) {
//   const pdfDoc = await PDFDocument.create();

//   console.log(documents.map(doc => ({
//     mimetype: doc.mimetype,
//     bufferLength: doc.buffer?.length
//   })));


//   for (const document of documents) {

//     if (document.ext === '.pdf') {
//       // Add existing PDF to the document
//       const existingPdf = await PDFDocument.load(document.buffer);
//       const copiedPages = await pdfDoc.copyPages(existingPdf, existingPdf.getPageIndices());
//       copiedPages.forEach((page) => pdfDoc.addPage(page));
//     } else if (['.png', '.jpeg', '.jpg'].includes(document.ext)) {
//       // Embed the image in the PDF directly without compression
//       let embeddedImage;
//       let imageDims;

//       if (document.ext === '.png') {
//         embeddedImage = await pdfDoc.embedPng(document.buffer);
//       } else {
//         embeddedImage = await pdfDoc.embedJpg(document.buffer);
//       }

//       imageDims = embeddedImage.scale(1);

//       const page = pdfDoc.addPage([imageDims.width, imageDims.height]);
//       page.drawImage(embeddedImage, {
//         x: 0,
//         y: 0,
//         width: imageDims.width,
//         height: imageDims.height,
//       });
//     }
//   }

//   const pdfBytes = await pdfDoc.save();
//   const outputPath = `tmp/bntDoc-uploads/${clientName}-docs.pdf`;
//   fs.writeFileSync(outputPath, pdfBytes);

//   return outputPath;
// }

// module.exports = combineDocuments;




