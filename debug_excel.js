const fs = require('fs');
const path = require('path');
const sql = require('mssql');
const ExcelJS = require('exceljs');
const { connectToDatabase } = require('./routes/dbconnection');
const mappers = require('./utility/scheduleMappers');

const BENEFIT_CONFIG = {
  template: 'Twenty-Five Percent.xlsx',
  procedure: 'sp_GetTwentyFivePercentByPins',
  mapRow: mappers.mapTwentyFivePercent,
  startRow: 5,
};

async function debugExcel() {
  try {
    const pool = await connectToDatabase('PFA');
    const dbRequest = pool.request();
    
    const pinsTable = new sql.Table('ListOfPins');
    pinsTable.columns.add('pin', sql.VarChar(50));
    pinsTable.rows.add('PEN100682139820'); // The PIN from the user's error log
    
    dbRequest.input('listOfPins', pinsTable);
    const result = await dbRequest.execute(BENEFIT_CONFIG.procedure);
    const records = result.recordset;
    
    console.log('Records retrieved:', records.length);
    if (records.length === 0) {
      console.log('No records found for this PIN');
      return;
    }
    
    console.log('Sample record keys:', Object.keys(records[0]));
    console.log('Sample record values:');
    for (const key in records[0]) {
      console.log(`  ${key} (${typeof records[0][key]}):`, JSON.stringify(records[0][key]));
    }
    
    const templatePath = path.join(__dirname, 'templates', BENEFIT_CONFIG.template);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(templatePath);
    
    const sheet = workbook.worksheets[0];
    const startRow = BENEFIT_CONFIG.startRow;
    
    for (let i = 0; i < records.length; i++) {
      const sanitizedRecord = {};
      for (const key in records[i]) {
        if (typeof records[i][key] === 'string') {
          sanitizedRecord[key] = records[i][key].replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F]/g, '');
        } else {
          sanitizedRecord[key] = records[i][key];
        }
      }
      BENEFIT_CONFIG.mapRow(sanitizedRecord, sheet, startRow + i, i + 1);
    }
    
    const outputPath = path.join(__dirname, 'debug_output.xlsx');
    await workbook.xlsx.writeFile(outputPath);
    console.log('Generated:', outputPath);
    
  } catch (err) {
    console.error('Error:', err);
  } finally {
    sql.close();
  }
}

debugExcel();
