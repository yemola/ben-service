const { exec } = require('child_process');
const { writeFile, readFile, unlink } = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const sharp = require('sharp');

const removeBackground = async (imageBuffer) => {
    const id = randomUUID();
    const inputPath = path.resolve(__dirname, `temp_${id}.png`);
    const outputPath = path.resolve(__dirname, `output_${id}.png`);

    try {
        await writeFile(inputPath, imageBuffer);

        await new Promise((resolve, reject) => {
            exec(`rembg i "${inputPath}" "${outputPath}"`, (error) => {
                if (error) return reject(error);
                resolve();
            });
        });

        const resultBuffer = await readFile(outputPath); // read output file

        await unlink(inputPath);
        await unlink(outputPath); // clean up the intermediate file

        return resultBuffer; // return as Buffer
    } catch (error) {
        console.error('BG-Removal Error:', error);
        throw error;
    }
};

const replaceWithWhiteBackground = async (buffer) => {
    const image = sharp(buffer);
    const metadata = await image.metadata();
    const { width, height } = metadata;

    const whiteBackgroundSvg = Buffer.from(
        `<svg width="${width}" height="${height}">
            <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
         </svg>`
    );

    const withWhiteBg = await sharp(buffer)
        .composite([
            {
                input: whiteBackgroundSvg,
                blend: 'dest-over'
            }
        ])
        .toBuffer();

    // Now resize it *after* compositing
    return await sharp(withWhiteBg)
        .resize(300, 300)
        .jpeg()
        .toBuffer();
};


// const replaceWithWhiteBackground = async (buffer) => {
//     const image = sharp(buffer);
//     const { width = 300, height = 300 } = await image.metadata();

//     return await image
//         .resize(300, 300)
//         .composite([
//             {
//                 input: Buffer.from(
//                     `<svg width="${width}" height="${height}">
//                         <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
//                     </svg>`
//                 ),
//                 blend: 'dest-over'
//             }
//         ])
//         .jpeg()
//         .toBuffer();
// };

const compressImage = async (buffer, maxSizeKB = 4) => {
    let quality = 80;
    let output = await sharp(buffer).jpeg({ quality }).toBuffer();

    while (output.length / 1024 > maxSizeKB && quality > 10) {
        quality -= 10;
        output = await sharp(buffer).jpeg({ quality }).toBuffer();
    }

    if (output.length / 1024 > maxSizeKB) {
        throw new Error('Cannot compress image below 4KB');
    }

    return output;
};

module.exports = {
    removeBackground,
    replaceWithWhiteBackground,
    compressImage,
};

module.exports = { removeBackground, replaceWithWhiteBackground, compressImage };

// const { exec } = require('child_process');
// const { writeFile, unlink } = require('fs/promises');
// const path = require('path');
// const { randomUUID } = require('crypto');
// import sharp from 'sharp';

// const removeBackground = async (imageBuffer) => {
//     const id = randomUUID();
//     const inputPath = path.resolve(__dirname, `temp_${id}.png`);
//     const outputPath = path.resolve(__dirname, `processed/output_${id}.png`);

//     try {
//         // Write image to disk
//         await writeFile(inputPath, imageBuffer);

//         // Run rembg
//         await new Promise((resolve, reject) => {
//             exec(`rembg i "${inputPath}" "${outputPath}"`, (error, stdout, stderr) => {
//                 if (error) return reject(error);
//                 resolve();
//             });
//         });

//         // Delete the temp input image
//         await unlink(inputPath);

//         return outputPath;
//     } catch (error) {
//         console.error('BG-Removal Error:', error);
//         throw error;
//     }
// };


// const replaceWithWhiteBackground = async (buffer) => {
//     const image = sharp(buffer);
//     const { width = 300, height = 300 } = await image.metadata();

//     return await image
//         .resize(300, 300)
//         .composite([
//             {
//                 input: Buffer.from(
//                     `<svg width="${width}" height="${height}">
//             <rect x="0" y="0" width="${width}" height="${height}" fill="white"/>
//           </svg>`
//                 ),
//                 blend: 'dest-over'
//             }
//         ])
//         .jpeg()
//         .toBuffer();
// };


// const compressImage = async (buffer, maxSizeKB = 4) => {
//     let quality = 80;
//     let output = await sharp(buffer).jpeg({ quality }).toBuffer();

//     while (output.length / 1024 > maxSizeKB && quality > 10) {
//         quality -= 10;
//         output = await sharp(buffer).jpeg({ quality }).toBuffer();
//     }

//     if (output.length / 1024 > maxSizeKB) {
//         throw new Error('Cannot compress image below 4KB');
//     }

//     return output;
// };



