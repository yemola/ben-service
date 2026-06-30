const express = require('express');
const { connectToDatabase, sql } = require('./dbconnection');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const capitalizeWords = require('./capitalizeWords.js');

const router = express.Router();

const upload = multer({ dest: 'assetUpload/' });

async function getCombinedAssets(page, limit) {
    try {
        const pool = await connectToDatabase('AssetManagement');

        const request = pool.request();

        const result = await request
            .input('Page', sql.Int, page)
            .input('PageSize', sql.Int, limit)
            .execute('AssetManagement.dbo.GetCombinedAssetsWeb');

        // console.log('result: ', result.recordset);
        return result.recordset;

    } catch (error) {
        console.log('error fetching data from DB.');
    }
}

async function getTotalAssetCatCount() {
    try {
        const pool = await connectToDatabase('AssetManagement');

        const request = pool.request();

        const totalCountResult = await request.execute('AssetManagement.dbo.GetAssetCategoryTotalCount');

        return totalCountResult.recordset[0].TotalCount;
        // GetAssetCategoryTotalCount
    } catch (error) {
        console.log('totalCount Error: ', error);
    }
}

// GET ALL ASSETS IN AN ASSET CATEGORY
router.get('/items', async (req, res) => {
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    console.log('Assetpayload: ', page, limit);

    try {
        const combinedAssets = await getCombinedAssets(page, limit);

        const totalCount = await getTotalAssetCatCount();

        const items = combinedAssets.map(asset => {
            return {
                id: asset.id,
                assetType: asset.assetType,
                assignee: capitalizeWords(asset.assignee),
                desc: asset.desc,
                serialNum: asset.serialNum,
                location: asset.location,
                condition: asset.condition,
                status: asset.status
            }
        });

        const totalPages = Math.ceil(totalCount / limit);
        const hasMore = page < totalPages;

        const result = {
            data: items,
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalCount,
            hasMore: hasMore
        }

        // console.log('rresult: ', result);

        res.status(200).json(result);

    } catch (error) {
        console.log('combinedAssets Error: ', error);
    }
})

router.put('/update-item', async (req, res) => {
    const { id, assetType, assignee, serialNum, location, condition, status } = req.body;

    try {
        const pool = await connectToDatabase('AssetManagement');

        const request = pool.request();
        const result = await request
            .input('id', id)
            .input('assetType', assetType)
            .input('assignee', assignee)
            .input('serialNum', serialNum)
            .input('location', location)
            .input('condition', condition)
            .input('status', status)
            .query(`
                UPDATE AssetManagement.dbo.Assets
                SET asset_type = @assetType,
                    serial_number = @serialNum,
                    current_location = @location,
                    present_condition = @condition,
                    status = @status
                WHERE id = @id
            `);

        console.log('Update result: ', result);

        res.status(200).json({ message: 'Asset item updated successfully' });
    } catch (error) {
        console.log('Error updating asset item: ', error);
        res.status(500).json({ error: 'Internal Server Error' });
    }
});

router.post('/bulk-upload', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No file uploaded' });
  }

  const pool = await connectToDatabase('AssetManagement');

  const filePath = path.resolve(req.file.path);

  try {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const worksheet = workbook.worksheets[0]; // first sheet

    const assets = [];

    // Extract records (assuming the first row is the header)
    worksheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
      if (rowNumber === 1) return; // Skip header row

      // Safely extract and trim values
      const [
        , // ExcelJS rows start at index 1 (row.values[0] is undefined)
        asset_tag, 
        asset_category_id, 
        asset_type, 
        brand, 
        model,
        purchase_date, 
        warranty_expiration, 
        status, 
        assigned_to, 
        department,
        current_location, 
        geo_latitude, 
        geo_longitude,
        created_at, 
        serial_number,
        present_condition
      ] = row.values.map((v) => (typeof v === 'string' ? v.trim() : v));

      // Skip rows missing essential fields
      if (!asset_type || !serial_number) return;

      assets.push({ 
        asset_tag, asset_category_id, asset_type, brand, model,
        purchase_date, warranty_expiration, status, assigned_to, department,
        current_location, geo_latitude, geo_longitude,
        created_at, serial_number, present_condition
       });
    });

    if (assets.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(400).json({ message: 'No valid data rows found in Excel file.' });
    }

    // Step 1: Fetch all existing serial numbers
    const existingSerialsResult = await pool.request().query(`
      SELECT serial_number FROM AssetManagement.dbo.Assets
    `);
    const existingSerials = new Set(
      existingSerialsResult.recordset.map((r) => r.serial_number?.trim().toLowerCase())
    );

    // Step 2: Filter out duplicates
    const skippedSerials = [];
    const newAssets = assets.filter((a) => {
      if (!a.serial_number) return false;
      const serialLower = a.serial_number.trim().toLowerCase();
      if (existingSerials.has(serialLower)) {
        skippedSerials.push(a.serial_number);
        return false;
      }
      return true;
    });

    if (newAssets.length === 0) {
      fs.unlinkSync(filePath);
      return res.status(200).json({
        message: 'No new assets inserted. All serial numbers already exist.',
        skippedSerials,
      });
    }
    // Step 3: Insert only new assets
    const insertPromises = newAssets.map((asset) => {
      const { asset_tag, asset_category_id, asset_type, brand, model,
              purchase_date, warranty_expiration, status, assigned_to, department,
              current_location, geo_latitude, geo_longitude,
              created_at, serial_number, present_condition } = asset;

      return pool
        .request()
        .input('assetTag', asset_tag)
        .input('assetCategoryId', asset_category_id)
        .input('assetType', asset_type)
        .input('brand', brand)
        .input('model', model)
        .input('purchaseDate', purchase_date)
        .input('warrantyExpiration', warranty_expiration)
        .input('status', status)
        .input('assignedTo', assigned_to)
        .input('department', department)
        .input('currentLocation', current_location)
        .input('geoLatitude', geo_latitude)
        .input('geoLongitude', geo_longitude)
        .input('createdAt', created_at)
        .input('serialNum', serial_number)
        .input('presentCondition', present_condition)
        .query(`
          INSERT INTO AssetManagement.dbo.Assets 
            (asset_tag, asset_category_id, asset_type, brand, model, purchase_date, warranty_expiration, 
            status, assigned_to, department, current_location, geo_latitude, geo_longitude,
            created_at, serial_number, present_condition)
          VALUES 
            (@assetTag, @assetCategoryId, @assetType, @brand, @model, @purchaseDate, @warrantyExpiration,
            @status, @assignedTo, @department, @currentLocation, @geoLatitude, @geoLongitude,
            @createdAt, @serialNum, @presentCondition); 
        `);
    });

    await Promise.all(insertPromises);

    // Cleanup the uploaded file
    fs.unlinkSync(filePath);

    res.status(200).json({
      message: 'Bulk insert completed',
      insertedCount: newAssets.length,
      skippedCount: skippedSerials.length,
      skippedSerials,
    });
  } catch (error) {
    console.error('Error during bulk insert:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

module.exports = router;