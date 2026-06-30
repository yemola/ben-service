const express = require('express');
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const router = express.Router();
const { connectToDatabase } = require('./dbconnection');
const ExcelJS = require('exceljs');

// Import the mappers from the utility module
const mappers = require('../utility/scheduleMappers');

// ---------------------------------------------------------------------------
// BENEFIT_CONFIG — the single source of truth for all benefit types.
// ---------------------------------------------------------------------------
const BENEFIT_CONFIG = {
  'Additional Death Benefit': {
    template: 'Additional Death Benefit.xlsx',
    procedure: 'sp_GetAdditionalDeathBenefitByPins',
    mapRow: mappers.mapDeathBenefit,
    startRow: 6,
  },
  'Death Benefit - Private': {
    template: 'Death Benefit.xlsx',
    procedure: 'sp_GetDeathBenefitByPins',
    mapRow: mappers.mapDeathBenefit,
    startRow: 8,
  },
  'Death Benefit - Public': {
    template: 'Death Benefit.xlsx',
    procedure: 'sp_GetDeathBenefitByPins',
    mapRow: mappers.mapDeathBenefit,
    startRow: 8,
  },
  'Mortgage': {
    template: 'Mortgage.xlsx',
    procedure: 'spGetMortgageDetailsByPin',
    mapRow: mappers.mapMortgage,
    startRow: 8,
  },
  'Annuity - Public': {
    template: 'Annuity.xlsx',
    procedure: 'sp_GetAnnuityByPins',
    mapRow: mappers.mapAnnuity,
    startRow: 5,
  },
  'Annuity - Private': {
    template: 'Annuity.xlsx',
    procedure: 'sp_GetAnnuityByPins',
    mapRow: mappers.mapAnnuity,
    startRow: 5,
  },
  'Additional Annuity': {
    template: 'Additional Annuity.xlsx',
    procedure: 'sp_GetAdditionalAnnuityByPins',
    mapRow: mappers.mapDeathBenefit,
    startRow: 6,
  },
  'Additional Lumpsum': {
    template: 'Additional Lumpsum.xlsx',
    procedure: 'sp_GetAdditionalLumpsumByPins',
    mapRow: mappers.mapDeathBenefit,
    startRow: 6,
  },
  'AVC - Active Contributor': {
    template: 'AVC.xlsx',
    procedure: 'sp_GetAVCByPins',
    mapRow: mappers.mapAVC,
    startRow: 6,
  },
  'AVC Retiree Contribution': {
    template: 'AVC.xlsx',
    procedure: 'sp_GetAVCByPins',
    mapRow: mappers.mapAVC,
    startRow: 6,
  },
  'AVC Retiree Contribution - Foreign': {
    template: 'AVC.xlsx',
    procedure: 'sp_GetAVCByPins',
    mapRow: mappers.mapAVC,
    startRow: 6,
  },
  'EnBloc': {
    template: 'EnBloc.xlsx',
    procedure: 'sp_GetEnBlocByPins',
    mapRow: mappers.mapEnBloc,
    startRow: 5,
  },
  'EnBloc - Private': {
    template: 'EnBloc.xlsx',
    procedure: 'sp_GetEnBlocByPins',
    mapRow: mappers.mapEnBloc,
    startRow: 5,
  },
  'Minimum PW to Enbloc Withdrawal': {
    template: 'Minimum PW to Enbloc Withdrawal.xlsx',
    procedure: 'sp_GetMinPWToEnblocByPins',
    mapRow: mappers.mapMinPWToEnbloc,
    startRow: 5,
  },
  'Twenty-Five Percent - Private': {
    template: 'Twenty-Five Percent.xlsx',
    procedure: 'sp_GetTwentyFivePercentByPins',
    mapRow: mappers.mapTwentyFivePercent,
    startRow: 5,
  },
  'Twenty-Five Percent - Public': {
    template: 'Twenty-Five Percent.xlsx',
    procedure: 'sp_GetTwentyFivePercentByPins',
    mapRow: mappers.mapTwentyFivePercent,
    startRow: 5,
  },
  'PRE-ACT': {
    template: 'PRE-ACT.xlsx',
    procedure: 'sp_GetPreActByPins',
    mapRow: mappers.mapDeathBenefit, 
    startRow: 6,
  },
  'Retirement Program Withdrawal': {
    template: 'Retirement Program Withdrawal.xlsx',
    procedure: 'sp_GetRetirementPWByPins',
    mapRow: mappers.mapProgramWithdrawal,
    startRow: 6,
  },
  'Program Withdrawal - Public': {
    template: 'Program Withdrawal Prof.xlsx',
    procedure: 'sp_GetProgramWithdrawalProfByPins',
    mapRow: mappers.mapProgramWithdrawal,
    startRow: 6,
  },
  'Program Withdrawal - Private': {
    template: 'Program Withdrawal Prof.xlsx',
    procedure: 'sp_GetProgramWithdrawalProfByPins',
    mapRow: mappers.mapProgramWithdrawal,
    startRow: 6,
  },
  'Exhausted RSA': {
    template: '10. EXHAUSTED RSA_Submission Format.xlsx',
    procedure: 'sp_GetExhaustedRSAByPins',
    mapRow: mappers.mapExhaustedRSA,
    startRow: 7,
  },
  'NSITF': {
    template: '11.NSITF_Submissin Format.xlsx',
    procedure: 'sp_GetNSITFByPins',
    mapRow: mappers.mapNSITF,
    startRow: 9,
  },
  'Pension Enhancement': {
    template: '9.PENSION ENH_Submission Format_PFAs USING NOW.xlsx',
    procedure: 'sp_GetPensionEnhancementByPins',
    mapRow: mappers.mapPensionEnhancement,
    startRow: 6,
  },
  'Mandatory to Voluntary': {
    template: '16. Movement MANDATORY TO VOLUNTARY CONTR_Submission Format.xlsx',
    procedure: 'sp_GetMandatoryToVoluntaryByPins',
    mapRow: mappers.mapMandatoryToVoluntary,
    startRow: 8,
  },
};

// ---------------------------------------------------------------------------
// fillTemplate — generic, knows nothing about benefit types.
// ---------------------------------------------------------------------------
async function fillTemplate(config, benefitType, requestPins, records) {
  const templatePath = path.join(__dirname, '..', 'templates', config.template);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(templatePath);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new Error('No worksheets found in the template: ' + config.template);
  }

  const startRow = config.startRow || 6;
  for (let i = 0; i < records.length; i++) {
    // Sanitize string values to prevent XML control character errors
    const sanitizedRecord = {};
    for (const key in records[i]) {
      if (typeof records[i][key] === 'string') {
        sanitizedRecord[key] = records[i][key].replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');
      } else {
        sanitizedRecord[key] = records[i][key];
      }
    }
    config.mapRow(sanitizedRecord, sheet, startRow + i, i + 1);
  }

  const tmpDir = path.join(__dirname, '..', 'tmp', 'genSchedules');
  if (!fs.existsSync(tmpDir)) {
    fs.mkdirSync(tmpDir, { recursive: true });
  }

  const dateStr = new Date().toISOString().slice(0, 19).replace(/[T:.]/g, '-');
  const formattedBenefit = benefitType.replace(/\s+/g, '_');
  const firstPin = requestPins[0] || 'unknown';
  const countLabel = requestPins.length > 1 ? `_${requestPins.length}requests` : '';
  const outputPath = path.join(tmpDir, `${formattedBenefit}_${firstPin}${countLabel}_${dateStr}.xlsx`);

  await workbook.xlsx.writeFile(outputPath);
  console.log(`Schedule generated: ${outputPath}`);
  return outputPath;
}

// ---------------------------------------------------------------------------
// POST /generate
// ---------------------------------------------------------------------------
router.post('/generate', async (req, res) => {
  try {
    const { userId, benefitType, requests } = req.body;
    console.log('Generate request — user:', userId, '| benefitType:', benefitType, '| count:', requests?.length);

    const config = BENEFIT_CONFIG[benefitType];
    if (!config) {
      return res.status(400).json({ error: `Invalid benefit type: "${benefitType}".` });
    }

    const requestPins = requests.map(r => r.applicantRsaPin);

    if (!requestPins.length) {
      return res.status(400).json({ error: 'No PINs provided.' });
    }

    let records;
    try {
      const pool = await connectToDatabase('PFA');
      const dbRequest = pool.request();

      const pinsTable = new sql.Table('ListOfPins');
      pinsTable.columns.add('pin', sql.VarChar(50));
      requestPins.forEach(pin => pinsTable.rows.add(pin));

      dbRequest.input('listOfPins', pinsTable);
      const result = await dbRequest.execute(config.procedure);
      records = result?.recordset;
    } catch (dbError) {
      console.error('Database query failed:', dbError);
      console.error('Failed PINs:', requestPins);

      // Surface a more helpful message for date conversion errors
      const errMsg = dbError?.message || '';
      if (errMsg.includes('converting date')) {
        return res.status(500).json({
          error: 'One or more records contain invalid date values in the database. '
               + 'Please review the data for the selected PINs and correct any malformed dates.',
          pins: requestPins,
        });
      }
      return res.status(500).json({ error: 'Database query failed.' });
    }

    if (!records || records.length === 0) {
      return res.status(404).json({
        error: 'No records found for the provided PIN(s) for the benefit type selected.',
      });
    }

    const outputPath = await fillTemplate(config, benefitType, requestPins, records);

    const fileBuffer = fs.readFileSync(outputPath);
    res.set({
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${path.basename(outputPath)}"`,
    });
    res.send(fileBuffer);

  } catch (error) {
    console.error('Error generating schedule:', error);
    res.status(500).json({ error: error.message || 'Error generating schedule.' });
  }
});

module.exports = router;
