const express = require('express');
require('dotenv').config();
const router = express.Router();
const sql = require('mssql');   
const axios = require('axios');
const { connectToDatabase } = require('./dbconnection');
const verifyToken = require('../middleware/auth');

const FLUTTERWAVE_BASE_URL = "https://api.flutterwave.com/v3";
const FLUTTERWAVE_SECRET_KEY = process.env.FLUTTERWAVE_SECRET_KEY;

if (!FLUTTERWAVE_SECRET_KEY) {
  console.error("CRITICAL WARNING: FLUTTERWAVE_SECRET_KEY is not defined in the environment!");
}

router.use(verifyToken);

router.get('/verify-account-number',  async (req, res) => {
  try {
    const { account_number, bank_code, bank_name, performed_by } = req.query;
    console.log('Verifying account number:', account_number, 'with bank code:', bank_code);

    // Basic validation
    if (!account_number || !bank_code) {
      return res.status(400).json({
        success: false,
        message: "account_number and bank_code are required",
      });
    }

    if (typeof account_number !== "string" || account_number.length !== 10) {
      return res.status(400).json({
        success: false,
        message: "account_number must be a 10-digit string",
      });
    }

    if (typeof bank_code !== "string") {
      return res.status(400).json({
        success: false,
        message: "bank_code must be a string",
      });
    }

    // Call Flutterwave
    console.log("Sending payload to Flutterwave API:", {
      account_number,
      account_bank: bank_code,
    });

    const response = await axios.post(
      `${FLUTTERWAVE_BASE_URL}/accounts/resolve`,
      {
        account_number,
        account_bank: bank_code,
      },
      {
        headers: {
          Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        },
        timeout: 5000, // fail fast
      }
    );

    console.log("Received successful response from Flutterwave:", response.data);

    const { account_name, account_number: resolvedAccount } = response.data.data;
    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // Log to Database
    if (performed_by) {
      const pool = await connectToDatabase('BenefitTracker');
      await pool.request()
        .input('action', sql.VarChar(50), 'Single Verification')
        .input('account_number', sql.VarChar(20), resolvedAccount)
        .input('bank_name', sql.VarChar(100), bank_name || bank_code)
        .input('status', sql.VarChar(20), 'verified')
        .input('performed_by', sql.VarChar(50), performed_by)
        .input('ip_address', sql.VarChar(50), ip_address?.toString().substring(0, 50))
        .input('details', sql.VarChar(255), 'Account verification successful')
        .query(`INSERT INTO BenefitTracker_v2.dbo.AuditLogs (action, account_number, bank_name, status, performed_by, ip_address, details) 
                VALUES (@action, @account_number, @bank_name, @status, @performed_by, @ip_address, @details)`);
    }

    // Send only what frontend needs
    return res.status(200).json({
      success: true,
      data: {
        account_name,
        account_number: resolvedAccount,
        bank_id: bank_code, // Flutterwave doesn't return bank_id independently, using bank_code
      },
    });
  } catch (error) {
    console.error("Flutterwave API Error (verify-account-number):", error.response?.data || error.message);

    const { account_number, bank_code, bank_name, performed_by } = req.query;
    const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (performed_by) {
      const pool = await connectToDatabase('BenefitTracker').catch(() => null);
      if (pool) {
        await pool.request()
          .input('action', sql.VarChar(50), 'Single Verification')
          .input('account_number', sql.VarChar(20), account_number?.toString() || 'Unknown')
          .input('bank_name', sql.VarChar(100), bank_name || bank_code || 'Unknown')
          .input('status', sql.VarChar(20), 'failed')
          .input('performed_by', sql.VarChar(50), performed_by)
          .input('ip_address', sql.VarChar(50), ip_address?.toString().substring(0, 50))
          .input('details', sql.VarChar(255), 'Account verification failed')
          .query(`INSERT INTO BenefitTracker_v2.dbo.AuditLogs (action, account_number, bank_name, status, performed_by, ip_address, details) 
                  VALUES (@action, @account_number, @bank_name, @status, @performed_by, @ip_address, @details)`).catch(e => console.error(e));
      }
    }

    // Flutterwave-specific error handling
    if (axios.isAxiosError(error)) {
      const status = error.response?.status || 500;
      const message =
        error.response?.data?.message || "Account verification failed";

      return res.status(status).json({
        success: false,
        message,
      });
    }

    // Unexpected errors
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
});

let cachedBanks = null;
let lastFetchTime = null;

router.get('/banks', async (req, res) => {
  try {
    // Cache for 24 hours (24 * 60 * 60 * 1000 ms)
    const now = Date.now();
    if (cachedBanks && lastFetchTime && (now - lastFetchTime < 86400000)) {
      return res.status(200).json({
        success: true,
        data: cachedBanks
      });
    }

    const response = await axios.get(
      `${FLUTTERWAVE_BASE_URL}/banks/NG`,
      {
        headers: {
          Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
        }
      }
    );

    // Sort banks alphabetically
    let banks = response.data.data;
    if (Array.isArray(banks)) {
      banks = banks.sort((a, b) => a.name.localeCompare(b.name));
    }

    cachedBanks = banks;
    lastFetchTime = now;

    return res.status(200).json({
      success: true,
      data: cachedBanks
    });
  } catch (error) {
    console.error("Error fetching banks from Flutterwave:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch banks"
    });
  }
});

router.post('/verify-accounts-bulk', async (req, res) => {
  const { accounts, performed_by } = req.body;
  const ip_address = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  // ✅ Basic validation
  if (!Array.isArray(accounts) || accounts.length === 0) {
    return res.status(400).json({
      success: false,
      message: "accounts must be a non-empty array",
    });
  }

  try {
    const verificationPromises = accounts.map((account) =>
      axios
        .post(
          `${FLUTTERWAVE_BASE_URL}/accounts/resolve`,
          {
            account_number: account.account_number,
            account_bank: account.bank_code,
          },
          {
            headers: {
              Authorization: `Bearer ${FLUTTERWAVE_SECRET_KEY}`,
            },
            timeout: 5000,
          }
        )
        .then(async (response) => {
          // Log success
          if (performed_by) {
            const pool = await connectToDatabase('BenefitTracker').catch(() => null);
            if (pool) {
              await pool.request()
                .input('action', sql.VarChar(50), 'Bulk Verification')
                .input('account_number', sql.VarChar(20), response.data.data.account_number)
                .input('bank_name', sql.VarChar(100), account.bank_name || account.bank_code)
                .input('status', sql.VarChar(20), 'verified')
                .input('performed_by', sql.VarChar(50), performed_by)
                .input('ip_address', sql.VarChar(50), ip_address?.toString().substring(0, 50))
                .input('details', sql.VarChar(255), 'Bulk verification successful')
                .query(`INSERT INTO BenefitTracker_v2.dbo.AuditLogs (action, account_number, bank_name, status, performed_by, ip_address, details) 
                        VALUES (@action, @account_number, @bank_name, @status, @performed_by, @ip_address, @details)`).catch(e => console.error(e));
            }
          }
          return {
            success: true,
            account_number: response.data.data.account_number,
            account_name: response.data.data.account_name,
            bank_id: account.bank_code,
            bank_code: account.bank_code,
          };
        })
        .catch(async (error) => {
          // Log failure
          if (performed_by) {
            const pool = await connectToDatabase('BenefitTracker').catch(() => null);
            if (pool) {
              await pool.request()
                .input('action', sql.VarChar(50), 'Bulk Verification')
                .input('account_number', sql.VarChar(20), account.account_number)
                .input('bank_name', sql.VarChar(100), account.bank_name || account.bank_code)
                .input('status', sql.VarChar(20), 'failed')
                .input('performed_by', sql.VarChar(50), performed_by)
                .input('ip_address', sql.VarChar(50), ip_address?.toString().substring(0, 50))
                .input('details', sql.VarChar(255), 'Bulk verification failed')
                .query(`INSERT INTO BenefitTracker_v2.dbo.AuditLogs (action, account_number, bank_name, status, performed_by, ip_address, details) 
                        VALUES (@action, @account_number, @bank_name, @status, @performed_by, @ip_address, @details)`).catch(e => console.error(e));
            }
          }
          return {
            success: false,
            account_number: account.account_number,
            bank_code: account.bank_code,
            message:
              error.response?.data?.message || "Verification failed",
          };
        })
    );

    // ✅ Important: allow partial success
    const results = await Promise.allSettled(verificationPromises);
    console.log('Bulk verification results:', results);

    const normalizedResults = results.map((result) =>
      result.status === "fulfilled" ? result.value : result.reason
    );

    return res.status(200).json({
      success: true,
      count: normalizedResults.length,
      data: normalizedResults,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Bulk verification failed",
    });
  }
});

router.get('/audit-logs', async (req, res) => {
  try {
    const pool = await connectToDatabase('BenefitTracker');
    const result = await pool.request().query(`
      SELECT 
        id, 
        action, 
        account_number as accountNumber, 
        bank_name as bankName, 
        status, 
        performed_by as performedBy, 
        performed_at as performedAt, 
        ip_address as ipAddress, 
        details 
      FROM BenefitTracker_v2.dbo.AuditLogs 
      ORDER BY performed_at DESC
    `);

    return res.status(200).json({
      success: true,
      data: result.recordset,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch audit logs',
    });
  }
});

module.exports = router;