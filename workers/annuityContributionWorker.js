'use strict';

/**
 * annuityContributionWorker.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Scheduled background worker that polls PFA.dbo.CONTRIBUTION for new records
 * whose matching CONTRIBUTION_BATCH.NARRATION contains 'ANNUITY', then sends a
 * notification email to the business unit.
 *
 * Safety guarantees:
 *  • Zero external dependencies: Uses native Node.js setInterval timers.
 *  • Runs only during business hours (Mon–Fri, 08:00–17:00).
 *  • Only scans rows newer than the last successful run (tracked in DB).
 *  • Updates the tracker ONLY after the email is delivered successfully.
 *  • No trigger on the CONTRIBUTION table — zero schema impact on PFA.
 *
 * Dependencies (already in package.json): mssql, nodemailer, dotenv
 * ─────────────────────────────────────────────────────────────────────────────
 */

require('dotenv').config();
const { connectToDatabase, sql } = require('../routes/dbconnection');
const transporter = require('../utility/EmailTransporter');

// ─── Configuration ────────────────────────────────────────────────────────────

const NOTIFICATION_TYPE = 'ANNUITY_CONTRIBUTION';
const TRACKER_DB        = 'BenefitTracker_v2';  // tracker lives here (same server)
const PFA_DB            = 'PFA';                 // contribution data lives here

/**
 * Recipient(s) for the notification email.
 * Populate ANNUITY_NOTIFY_EMAIL in your .env file.
 * e.g. ANNUITY_NOTIFY_EMAIL="ops@norrenpensions.com,team@norrenpensions.com"
 */
const NOTIFY_EMAIL = process.env.ANNUITY_NOTIFY_EMAIL || 'noreply-npl@norrenpensions.com';

/**
 * Check interval in milliseconds.
 * Default is 30 minutes (1,800,000 ms).
 */
const CHECK_INTERVAL_MS = parseInt(process.env.ANNUITY_CHECK_INTERVAL_MS, 10) || 30 * 60 * 1000;

// ─── Business-hour guard ──────────────────────────────────────────────────────

/**
 * Returns true if the current local time is within business hours
 * (Mon–Fri, 08:00–17:00).
 */
function isBusinessHour() {
    const now  = new Date();
    const day  = now.getDay();   // 0=Sun, 6=Sat
    const hour = now.getHours(); // 0–23

    const isWeekday      = day >= 1 && day <= 5;
    const isDuringHours  = hour >= 8 && hour < 17;

    return isWeekday && isDuringHours;
}

// ─── Core worker logic ────────────────────────────────────────────────────────

async function runAnnuityContributionCheck() {
    if (!isBusinessHour()) {
        console.log(`[AnnuityWorker] Outside business hours — skipping (${new Date().toISOString()})`);
        return;
    }

    console.log(`[AnnuityWorker] Running check at ${new Date().toISOString()}`);

    let trackerPool, pfaPool;
    try {
        [trackerPool, pfaPool] = await Promise.all([
            connectToDatabase(TRACKER_DB),
            connectToDatabase(PFA_DB),
        ]);
    } catch (connErr) {
        console.error('[AnnuityWorker] DB connection error:', connErr.message);
        return; // do not update tracker — will retry next interval
    }

    // ── 1. Read last processed timestamp ──────────────────────────────────────
    let lastProcessedDate = null;
    try {
        const trackerRes = await trackerPool.request()
            .input('notificationType', sql.VarChar(50), NOTIFICATION_TYPE)
            .query(`
                SELECT TOP 1 LastProcessedDate
                FROM   BenefitTracker_v2.dbo.ContributionNotificationTracker
                WHERE  NotificationType = @notificationType
            `);

        if (trackerRes.recordset.length === 0) {
            console.error('[AnnuityWorker] Tracker row not found. Run the setup SQL first.');
            return;
        }

        lastProcessedDate = trackerRes.recordset[0].LastProcessedDate; // may be NULL on first run
    } catch (err) {
        console.error('[AnnuityWorker] Failed to read tracker:', err.message);
        return;
    }

    // ── 2. Query new ANNUITY contribution records ──────────────────────────────
    let newRecords = [];
    let maxDateInBatch = null;

    try {
        /*
         * Use PAYMENT_DATE as the watermark column. If your table has a
         * DATE_CREATED or CREATED_AT column that is more reliably populated
         * at insert time, replace PAYMENT_DATE with that column name in both
         * the WHERE clause and the MAX() below.
         *
         * The cross-database join works because both PFA and BenefitTracker_v2
         * live on the same SQL Server instance.
         */
        const query = `
            SELECT
                B.NARRATION,
                C.PIN,
                C.WITHDRAWAL,
                C.PRICE,
                C.VALUE_DATE,
                C.PAYMENT_DATE,
                C.FUND_ID,
                C.PAYMENT_DATE AS _WATERMARK_DATE
            FROM PFA.dbo.CONTRIBUTION         C
            INNER JOIN PFA.dbo.CONTRIBUTION_BATCH B
                ON C.BATCH_ID = B.BATCH_ID
            WHERE B.NARRATION LIKE '%ANNUITY%'
              AND (
                  @LastProcessedDate IS NULL
                  OR C.PAYMENT_DATE > @LastProcessedDate
              )
            ORDER BY C.PAYMENT_DATE ASC
        `;

        const pfaRequest = pfaPool.request();
        pfaRequest.input(
            'LastProcessedDate',
            sql.DateTime,
            lastProcessedDate  // mssql accepts null here for the IS NULL branch
        );

        const pfaResult = await pfaRequest.query(query);
        newRecords = pfaResult.recordset;

        if (newRecords.length === 0) {
            console.log('[AnnuityWorker] No new ANNUITY contributions found. Tracker unchanged.');
            return;
        }

        // Determine the highest watermark in this batch (to persist after email)
        maxDateInBatch = newRecords.reduce((max, r) => {
            const d = r._WATERMARK_DATE;
            return (!max || (d && d > max)) ? d : max;
        }, null);

        console.log(`[AnnuityWorker] Found ${newRecords.length} new record(s). Max date: ${maxDateInBatch}`);
    } catch (queryErr) {
        console.error('[AnnuityWorker] Query error:', queryErr.message);
        return;
    }

    // ── 3. Build and send notification email ──────────────────────────────────
    const tableRows = newRecords.map(r => `
        <tr>
            <td style="padding:6px 10px;border:1px solid #ddd;">${r.NARRATION || ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${r.PIN || ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${r.WITHDRAWAL != null ? Number(r.WITHDRAWAL).toLocaleString('en-NG', { minimumFractionDigits: 2 }) : ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${r.PRICE != null ? Number(r.PRICE).toLocaleString('en-NG', { minimumFractionDigits: 4 }) : ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${r.VALUE_DATE ? new Date(r.VALUE_DATE).toLocaleDateString('en-NG') : ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${r.PAYMENT_DATE ? new Date(r.PAYMENT_DATE).toLocaleDateString('en-NG') : ''}</td>
            <td style="padding:6px 10px;border:1px solid #ddd;">${r.FUND_ID != null ? r.FUND_ID : ''}</td>
        </tr>
    `).join('');

    const emailHtml = `
        <p>Dear Team,</p>
        <p>
            The automated contribution monitor has detected
            <strong>${newRecords.length} new ANNUITY contribution record(s)</strong>
            posted since the last check
            (${lastProcessedDate ? new Date(lastProcessedDate).toLocaleString('en-NG') : 'beginning of records'}).
        </p>
        <table style="border-collapse:collapse;width:100%;font-family:Arial,sans-serif;font-size:13px;">
            <thead>
                <tr style="background:#003366;color:#fff;">
                    <th style="padding:8px 10px;text-align:left;">Narration</th>
                    <th style="padding:8px 10px;text-align:left;">PIN</th>
                    <th style="padding:8px 10px;text-align:left;">Withdrawal (₦)</th>
                    <th style="padding:8px 10px;text-align:left;">Price</th>
                    <th style="padding:8px 10px;text-align:left;">Value Date</th>
                    <th style="padding:8px 10px;text-align:left;">Payment Date</th>
                    <th style="padding:8px 10px;text-align:left;">Fund ID</th>
                </tr>
            </thead>
            <tbody>
                ${tableRows}
            </tbody>
        </table>
        <br>
        <p>Please review the above records and take any necessary actions.</p>
        <p>Thank you.</p>
        <p><strong>Norrenberger Pensions Ltd</strong><br>Automated Notification System</p>
    `;

    const mailOptions = {
        from: '"Norrenberger Pensions" <noreply-npl@norrenpensions.com>',
        to: NOTIFY_EMAIL,
        subject: `[Alert] ${newRecords.length} New ANNUITY Contribution(s) Detected — ${new Date().toLocaleDateString('en-NG')}`,
        html: emailHtml,
    };

    try {
        await new Promise((resolve, reject) => {
            transporter.sendMail(mailOptions, (err, info) => {
                if (err) return reject(err);
                resolve(info);
            });
        });
        console.log(`[AnnuityWorker] Notification email sent to: ${NOTIFY_EMAIL}`);
    } catch (emailErr) {
        // Do NOT update the tracker — email failed, retry next interval
        console.error('[AnnuityWorker] Email send failed:', emailErr.message);
        return;
    }

    // ── 4. Update tracker only after successful email ─────────────────────────
    try {
        await trackerPool.request()
            .input('notificationType', sql.VarChar(50), NOTIFICATION_TYPE)
            .input('maxDate',          sql.DateTime,    maxDateInBatch)
            .query(`
                UPDATE BenefitTracker_v2.dbo.ContributionNotificationTracker
                SET
                    LastProcessedDate = @maxDate,
                    LastRunAt         = GETDATE()
                WHERE NotificationType = @notificationType
            `);

        console.log(`[AnnuityWorker] Tracker updated. LastProcessedDate = ${maxDateInBatch}`);
    } catch (updateErr) {
        // Email was already sent; log but don't throw — duplicate notification risk
        // is acceptable vs. missing records
        console.error('[AnnuityWorker] Tracker update failed (email was sent):', updateErr.message);
    }
}

// ─── Scheduler bootstrap ──────────────────────────────────────────────────────

function startAnnuityContributionWorker() {
    const intervalMinutes = CHECK_INTERVAL_MS / (60 * 1000);
    console.log(`[AnnuityWorker] Scheduling native background loop (every ${intervalMinutes} minutes)`);

    // Run initial check on server start
    runAnnuityContributionCheck().catch(err => {
        console.error('[AnnuityWorker] Unexpected error in initial runAnnuityContributionCheck:', err);
    });

    // Run periodically
    setInterval(() => {
        runAnnuityContributionCheck().catch(err => {
            console.error('[AnnuityWorker] Unexpected error in scheduled runAnnuityContributionCheck:', err);
        });
    }, CHECK_INTERVAL_MS);

    console.log('[AnnuityWorker] Worker started successfully.');
}

module.exports = { startAnnuityContributionWorker, runAnnuityContributionCheck };
