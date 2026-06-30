const express = require('express');
const router = express.Router();
const multer = require('multer');
require('dotenv').config();
const { connectToDatabase } = require('../routes/dbconnection');
const sql = require('mssql');
// const soap = require('strong-soap').soap;
const soap = require('soap');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { randomUUID } = require('crypto');
const { writeFile } = require('fs/promises');
const { removeBackground, replaceWithWhiteBackground, compressImage } = require('../utils/bgUtils');

// Configure multer for file uploads
// const storage = multer.memoryStorage();
// const upload = multer({
//     storage: storage,
//     limits: {
//         fileSize: 5 * 1024 * 1024, // 5MB limit
//     },
//     fileFilter: (req, file, cb) => {
//         // Accept images only
//         if (file.mimetype.startsWith('image/')) {
//             cb(null, true);
//         } else {
//             cb(new Error('Only image files are allowed'), false);
//         }
//     }
// });


const upload = multer({ storage: multer.memoryStorage() }); // Use memory storage to access file buffer directly

const processPassportPhoto = async (buffer) => {
    const noBgBuffer = await removeBackground(buffer); // returns buffer
    const whiteBg = await replaceWithWhiteBackground(noBgBuffer);
    const finalImage = await compressImage(whiteBg);

    return finalImage; // no saving here
};

router.post('/remove-bg', upload.single('passport'), async (req, res) => {
    try {
        const file = req.file;

        if (!file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const uuid = randomUUID();
        const processedBuffer = await processPassportPhoto(file.buffer); // Just process, no saving inside

        const finalFilename = `${uuid}_${file.originalname}`;
        const finalPath = path.resolve(__dirname, `../processed/${finalFilename}`);
        await writeFile(finalPath, processedBuffer); // Save final image in handler

        // You can either send response or just log for further backend use
        res.status(200).json({ message: 'Image processed successfully', filePath: finalPath });

    } catch (error) {
        console.error('BG-Removal Error:', error);
        res.status(500).json({ error: 'Failed to process image' });
    }
});


router.post('/mp-registration', upload.fields([
    { name: 'passportPhotograph', maxCount: 1 },
    { name: 'signature', maxCount: 1 }
]), async (req, res) => {
    try {
        const url = process.env.SM_BASE_URL;

        const registrationData = JSON.parse(req.body.registrationData);
        console.log('REGDATA: ', registrationData);

        const files = req.files;

        const pictureCid = uuidv4().replace(/-/g, '');
        const signatureCid = uuidv4().replace(/-/g, '');
        const consentFormCid = uuidv4().replace(/-/g, '');

        const consentFormPath = path.join(__dirname, '..', 'templates', 'consent-form.jpg');
        const consentFormBuffer = fs.readFileSync(consentFormPath);
        const formNumber = 'S36CR17950';

        const soapPayload = {
            USER_ID: process.env.ECRS_USER_ID || '',
            Password: process.env.ECRS_PASSWORD || '',
            ContributorRegistrationRequestDetail: {
                header: {
                    pfaCode: process.env.PFA_CODE || '',
                    requestCode: process.env.REQUEST_CODE || '',
                },
                body: {
                    contributor: {
                        formNumber: formNumber,
                        personalData: {
                            registrationType: 'N',
                            temporaryPin: '',
                            bvn: registrationData.bvn,
                            nin: registrationData.nin,
                            title: registrationData.title,
                            surname: registrationData.surname,
                            firstName: registrationData.firstName,
                            middleName: registrationData.otherNames || '',
                            maidenOrFormerName: '',
                            gender: registrationData.gender,
                            maritalStatus: registrationData.maritalStatus,
                            nationality: 'NG',
                            stateOfOriginCode: registrationData.stateOfOrigin,
                            localGovernmentOfOriginCode: registrationData.resLocalGovernment || '',
                            dateOfBirth: registrationData.dateOfBirth,
                            placeOfBirth: registrationData.placeOfBirth,
                            email: registrationData.email || '',
                            phoneNumber: registrationData.mobileNumber,
                            poBox: registrationData.poBox || '',
                            nigeriaOrAbroad: registrationData.nigeriaOrAbroad,
                            residenceCountryCode: registrationData.countryOfResidence,
                            residenceStateCode: registrationData.stateCode,
                            residenceLocalGovernmentCode: registrationData.localGovernment,
                            residenceTownCity: registrationData.village,
                            residenceStreetName: registrationData.streetName || '',
                            residenceHouseNameOrNumber: registrationData.houseNumber || '',
                            residenceZipCode: registrationData.zipCode || ''
                        },
                        employmentRecord: {
                            sectorClass: 'MP',
                            employerCode: registrationData.employerCode,
                            nigeriaOrAbroad: registrationData.nigeriaOrAbroad,
                            countryCode: registrationData.clientOfficeCountryCode,
                            stateCode: registrationData.clientOfficeStateCode || '',
                            localGovernmentCode: registrationData.clientOfficeLocalGovernment || '',
                            townCity: registrationData.clientOfficeVillage || '',
                            streetName: registrationData.clientOfficeStreetName || '',
                            buildingNameOrNumber: registrationData.clientOfficeBuildingNumber || '',
                            zipCode: registrationData.clientOfficeZipCode || '',
                            poBox: registrationData.clientOfficePoBox || '',
                            phoneNumber: registrationData.emplPhoneNumber || '',
                            natureOfBusiness: registrationData.natureOfBusiness,
                            dateOfFirstAppointment: registrationData.dateOfFirstAppointment,
                            dateOfCurrentEmployment: registrationData.dateOfFirstAppointment || ''
                        },
                        nextOfKinDetail: {
                            title: registrationData.nokTitle,
                            gender: registrationData.nokGender || 'M',
                            surname: registrationData.nokSurname,
                            firstName: registrationData.nokFirstName,
                            middleName: registrationData.nokMiddleName || '',
                            relationship: registrationData.nokRelationship,
                            nigeriaOrAbroad: registrationData.nokLocation,
                            residenceCountryCode: registrationData.nokCountryOfResidence,
                            residenceStateCode: registrationData.nokStateCode,
                            residenceLocalGovernmentCode: registrationData.nokLocalGovernment,
                            residenceTownCity: registrationData.nokVillage,
                            residenceStreetName: registrationData.nokStreetName || '',
                            residenceHouseNumber: registrationData.nokHouseNumber || '',
                            zipCode: registrationData.nokZipCode,
                            poBox: '',
                            email: '',
                            phoneNumber: registrationData.nokPhoneNumber || ''
                        },
                        biometric: {
                            picture: `cid:${pictureCid}`,
                            signature: `cid:${signatureCid}`,
                            consentForm: `cid:${consentFormCid}`
                        }
                    }
                }
            }
        };

        const attachments = [];

        if (files.passportPhotograph && files.passportPhotograph[0]) {
            attachments.push({
                contentId: `<${pictureCid}>`,
                contentType: files.passportPhotograph[0].mimetype,
                content: files.passportPhotograph[0].buffer
            });
        }

        if (files.signature && files.signature[0]) {
            attachments.push({
                contentId: `<${signatureCid}>`,
                contentType: files.signature[0].mimetype,
                content: files.signature[0].buffer
            });
        }

        if (consentFormBuffer) {
            attachments.push({
                contentId: `<${consentFormCid}>`,
                contentType: 'image/jpeg',
                content: consentFormBuffer
            });
        }

        const certPath = path.join(__dirname, 'certs', 'full-chain.pem');
        const rawCert = fs.readFileSync(certPath, 'utf8');

        // If needed, normalize and split certs
        const certsArray = rawCert
            .replace(/\r\n/g, '\n')
            .split(/(?=-----BEGIN CERTIFICATE-----)/g)
            .map(cert => cert.trim());

        const agent = new https.Agent({
            ca: certsArray
        });

        const options = {
            enableMTOM: true,
            wsdl_options: {
                agent
            }
        };


        // const options = {
        //     enableMTOM: true,
        //     wsdl_options: {} // no agent, no certificates
        // };

        console.log('Certs loaded:', certsArray.length, 'certs');
        console.log('Custom CA path:', certPath);


        soap.createClient(url, options, (err, client) => {
            if (err) {
                console.error('SOAP client error:', err);
                return res.status(500).json({
                    message: 'Failed to create SOAP client',
                    error: err.message
                });
            }

            const soapRequest = {
                args: soapPayload,
                attachments: attachments
            };

            client.addSoapHeader({}); // Optional placeholder

            client.registrationRequest(soapRequest, (err, result) => {
                if (err) {
                    console.error('SOAP request error:', err);
                    return res.status(500).json({
                        message: 'Failed to process registration request',
                        error: err.message
                    });
                }

                console.log('SOAP registration successful:', result);
                res.json({
                    success: true,
                    message: 'Registration submitted successfully',
                    data: result
                });
            });
        });

    } catch (error) {
        console.error('Registration processing error:', error);
        res.status(500).json({
            message: 'Failed to process registration',
            error: error.message
        });
    }
});


// router.post('/mp-registration', upload.fields([
//     { name: 'passportPhotograph', maxCount: 1 },
//     { name: 'signature', maxCount: 1 }
// ]), async (req, res) => {
//     try {
//         const url = process.env.SM_BASE_URL;

//         // Parse the registration data from form
//         const registrationData = JSON.parse(req.body.registrationData);
//         console.log('REGDATA: ', registrationData);
//         return;
//         const files = req.files;

//         // Generate unique cid values for attachments
//         const pictureCid = uuidv4().replace(/-/g, '');
//         const signatureCid = uuidv4().replace(/-/g, '');
//         const consentFormCid = uuidv4().replace(/-/g, '');

//         // Generate the consent form JPG
//         const consentFormPath = path.join(__dirname, '..', 'templates', 'consent-form.jpg');
//         const consentFormBuffer = fs.readFileSync(consentFormPath);
//         let formNumber = 'S36CR17950';

//         // Restructure data for SOAP service to match ECRS format
//         const soapPayload = {
//             USER_ID: process.env.ECRS_USER_ID || '',
//             Password: process.env.ECRS_PASSWORD || '',
//             ContributorRegistrationRequestDetail: {
//                 header: {
//                     pfaCode: process.env.PFA_CODE || '',
//                     requestCode: process.env.REQUEST_CODE || '',
//                 },
//                 body: {
//                     contributor: {
//                         formNumber: formNumber,
//                         personalData: {
//                             registrationType: 'N',
//                             temporaryPin: '',
//                             bvn: registrationData.bvn,
//                             nin: registrationData.nin,
//                             title: registrationData.title,
//                             surname: registrationData.surname,
//                             firstName: registrationData.firstName,
//                             middleName: registrationData.otherNames || '',
//                             maidenOrFormerName: '',
//                             gender: registrationData.gender,
//                             maritalStatus: registrationData.maritalStatus,
//                             nationality: 'N',
//                             stateOfOriginCode: registrationData.stateOfOrigin,
//                             localGovernmentOfOriginCode: registrationData.localGovernment || '',
//                             dateOfBirth: registrationData.dateOfBirth,
//                             placeOfBirth: registrationData.placeOfBirth,
//                             email: registrationData.email || '',
//                             phoneNumber: registrationData.mobileNumber,
//                             poBox: registrationData.poBox || '',
//                             nigeriaOrAbroad: registrationData.nigeriaOrAbroad,
//                             residenceCountryCode: registrationData.countryOfResidence,
//                             residenceStateCode: registrationData.stateCode,
//                             residenceLocalGovernmentCode: registrationData.localGovernment,
//                             residenceTownCity: registrationData.village,
//                             residenceStreetName: registrationData.streetName || '',
//                             residenceHouseNameOrNumber: registrationData.houseNumber || '',
//                             residenceZipCode: registrationData.zipCode || ''
//                         },
//                         employmentRecord: {
//                             sectorClass: 'MP',
//                             employerCode: registrationData.employerCode,
//                             nigeriaOrAbroad: registrationData.nigeriaOrAbroad,
//                             countryCode: registrationData.clientOfficeCountryCode,
//                             stateCode: registrationData.clientOfficeStateCode || '',
//                             localGovernmentCode: registrationData.clientOfficeLocalGovernment || '',
//                             townCity: registrationData.clientOfficeVillage || '',
//                             streetName: registrationData.clientOfficeStreetName || '',
//                             buildingNameOrNumber: registrationData.clientOfficeBuildingNumber || '',
//                             zipCode: registrationData.clientOfficeZipCode || '',
//                             poBox: registrationData.clientOfficePoBox || '',
//                             phoneNumber: registrationData.emplPhoneNumber || '',
//                             natureOfBusiness: registrationData.natureOfBusiness,
//                             dateOfFirstAppointment: registrationData.dateOfFirstAppointment,
//                             dateOfCurrentEmployment: registrationData.dateOfFirstAppointment || ''
//                         },
//                         nextOfKinDetail: {
//                             title: registrationData.nokTitle,
//                             gender: registrationData.nokGender || 'M',
//                             surname: registrationData.nokSurname,
//                             firstName: registrationData.nokFirstName,
//                             middleName: registrationData.nokMiddleName || '',
//                             relationship: registrationData.nokRelationship,
//                             nigeriaOrAbroad: registrationData.nokLocation,
//                             residenceCountryCode: registrationData.nokCountryOfResidence,
//                             residenceStateCode: registrationData.nokStateCode,
//                             residenceLocalGovernmentCode: registrationData.nokLocalGovernment,
//                             residenceTownCity: registrationData.nokVillage,
//                             residenceStreetName: registrationData.nokStreetName || '',
//                             residenceHouseNumber: registrationData.nokHouseNumber || '',
//                             zipCode: registrationData.nokZipCode,
//                             poBox: '',
//                             email: '',
//                             phoneNumber: registrationData.nokPhoneNumber || ''
//                         },
//                         biometric: {
//                             picture: `cid:${pictureCid}`,
//                             signature: `cid:${signatureCid}`,
//                             consentForm: `cid:${consentFormCid}`
//                         }
//                     }
//                 }
//             }
//         };

//         // Prepare attachments for SOAP request
//         const attachments = [];

//         if (files.passportPhotograph && files.passportPhotograph[0]) {
//             attachments.push({
//                 contentId: `<${pictureCid}>`,
//                 contentType: files.passportPhotograph[0].mimetype,
//                 content: files.passportPhotograph[0].buffer
//             });
//         }

//         if (files.signature && files.signature[0]) {
//             attachments.push({
//                 contentId: `<${signatureCid}>`,
//                 contentType: files.signature[0].mimetype,
//                 content: files.signature[0].buffer
//             });
//         }

//         if (consentFormBuffer) {
//             attachments.push({
//                 contentId: `<${consentFormCid}>`,
//                 contentType: 'image/jpeg',
//                 content: consentFormBuffer
//             });
//         }

//         const certPath = path.join(__dirname, 'certs', 'full-chain.pem');
//         const rawCert = fs.readFileSync(certPath, 'utf8');

//         const certsArray = rawCert
//         .replace(/\r\n/g, '\n') // normalizes line endings (Windows to Unix style)
//         .split(/(?=-----BEGIN CERTIFICATE-----)/g) // splits at each cert start
//         .map(cert => cert.trim()); // removes extra whitespace

//         console.log('Number of certificates loaded:', certsArray.length);

//         const agent = new http.Agent({
//           ca: certsArray,
//         });

//         const options = {
//           enableMTOM: true,
//           wsdl_options: {},
//           agent
//         };

//         soap.createClient(url, options, (err, client) => {
//             if (err) {
//                 console.error('SOAP client error:', err);
//                 return res.status(500).json({
//                     message: 'Failed to create SOAP client',
//                     error: err.message
//                 });
//             }

//             // Set up SOAP request with attachments
//             const soapRequest = {
//                 args: soapPayload,
//                 attachments: attachments
//             };

//             client.addSoapHeader({}); // Empty header just to force introspection

//             client.registrationRequest(soapRequest, (err, result) => {
//                 if (err) {
//                     console.error('SOAP request error:', err);
//                     return res.status(500).json({
//                         message: 'Failed to process registration request',
//                         error: err.message
//                     });
//                 }

//                 console.log('SOAP registration successful:', result);
//                 res.json({
//                     success: true,
//                     message: 'Registration submitted successfully',
//                     data: result
//                 });
//             });
//         });

//     } catch (error) {
//         console.error('Registration processing error:', error);
//         res.status(500).json({
//             message: 'Failed to process registration',
//             error: error.message
//         });
//     }
// });


module.exports = router;