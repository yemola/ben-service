const fs = require('fs');
const path = require('path');
const { PDFDocument } = require('pdf-lib');
const sharp = require('sharp');


async function combineDocuments(documents, clientName) {
  console.log(
    `Starting document merge for "${clientName}"`
  );

  console.log(
    `Total documents to merge: ${documents.length}`
  );

  console.log(
    'Documents received for merging:',
    documents.map(doc => ({
      name: doc.name,
      ext: doc.ext,
      type: doc.type,
      bufferLength: doc.buffer?.length
    }))
  );

  const pdfDoc = await PDFDocument.create();

  let processedCount = 0;
  let totalPagesAdded = 0;

  for (const document of documents) {
    const startTime = Date.now();

    console.log(
      `\n[${processedCount + 1}/${documents.length}] ` +
      `Starting: ${document.name}`
    );

    console.log(
      `Type: ${document.type}, ` +
      `Extension: ${document.ext}, ` +
      `Size: ${document.buffer?.length} bytes`
    );

    try {
      if (!Buffer.isBuffer(document.buffer)) {
        throw new Error(
          `Invalid buffer for document: ${document.name}`
        );
      }

      if (document.buffer.length === 0) {
        throw new Error(
          `Empty document: ${document.name}`
        );
      }

      switch (document.type) {
        case 'pdf': {
          console.log(
            `Loading PDF: ${document.name}`
          );

          const existingPdf =
            await PDFDocument.load(
              document.buffer
            );

          const pageIndices =
            existingPdf.getPageIndices();

          console.log(
            `PDF loaded successfully: ` +
            `${document.name} ` +
            `(${pageIndices.length} page(s))`
          );

          const copiedPages =
            await pdfDoc.copyPages(
              existingPdf,
              pageIndices
            );

          copiedPages.forEach(page => {
            pdfDoc.addPage(page);
          });

          totalPagesAdded += copiedPages.length;

          console.log(
            `Added ${copiedPages.length} page(s) ` +
            `from ${document.name}`
          );

          break;
        }

        case 'jpeg': {
          console.log(
            `Embedding JPEG: ${document.name}`
          );

          const embeddedImage =
            await pdfDoc.embedJpg(
              document.buffer
            );

          const { width, height } =
            embeddedImage.scale(1);

          console.log(
            `JPEG dimensions: ` +
            `${width} x ${height}`
          );

          const page =
            pdfDoc.addPage([
              width,
              height
            ]);

          page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width,
            height
          });

          totalPagesAdded++;

          console.log(
            `JPEG added successfully: ` +
            `${document.name}`
          );

          break;
        }

        case 'png': {
          console.log(
            `Embedding PNG: ${document.name}`
          );

          const embeddedImage =
            await pdfDoc.embedPng(
              document.buffer
            );

          const { width, height } =
            embeddedImage.scale(1);

          console.log(
            `PNG dimensions: ` +
            `${width} x ${height}`
          );

          const page =
            pdfDoc.addPage([
              width,
              height
            ]);

          page.drawImage(embeddedImage, {
            x: 0,
            y: 0,
            width,
            height
          });

          totalPagesAdded++;

          console.log(
            `PNG added successfully: ` +
            `${document.name}`
          );

          break;
        }

        default:
          throw new Error(
            `Unsupported document type ` +
            `"${document.type}" ` +
            `for ${document.name}`
          );
      }

      processedCount++;

      const elapsed =
        Date.now() - startTime;

      console.log(
        `Completed: ${document.name} ` +
        `(${elapsed} ms)`
      );

    } catch (error) {
      const elapsed =
        Date.now() - startTime;

      console.error(
        `FAILED: ${document.name}`,
        {
          type: document.type,
          extension: document.ext,
          bufferLength: document.buffer?.length,
          elapsedMs: elapsed,
          error: error.message
        }
      );

      throw new Error(
        `Failed to process "${document.name}" ` +
        `as ${document.type}: ${error.message}`
      );
    }
  }

  console.log(
    `\nAll documents processed successfully. ` +
    `Documents: ${processedCount}/${documents.length}, ` +
    `Pages: ${totalPagesAdded}`
  );

  console.log(
    'Generating final PDF...'
  );

  const saveStartTime = Date.now();

  const pdfBytes =
    await pdfDoc.save();

  const saveElapsed =
    Date.now() - saveStartTime;

  console.log(
    `Final PDF generated successfully. ` +
    `Size: ${pdfBytes.length} bytes, ` +
    `Save time: ${saveElapsed} ms`
  );

  const outputPath =
    path.join(
      'tmp',
      'bntDoc-uploads',
      `${clientName}-docs.pdf`
    );

  await fs.promises.mkdir(
    path.dirname(outputPath),
    { recursive: true }
  );

  console.log(
    `Writing merged PDF to: ${outputPath}`
  );

  await fs.promises.writeFile(
    outputPath,
    pdfBytes
  );

  console.log(
    `Merged PDF written successfully: ${outputPath}`
  );

  const outputStats =
    await fs.promises.stat(outputPath);

  console.log(
    `Output file size: ${outputStats.size} bytes`
  );

  console.log(
    `Document merge completed successfully for "${clientName}"`
  );

  return outputPath;
}

module.exports = combineDocuments;


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




