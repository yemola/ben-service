require('dotenv').config();
const axios = require('axios').create({
    timeout: 300000 // 5 minutes timeout
});
const qs = require('qs');
const fs = require('fs');
const path = require('path');

// Credentials
const OLD_TENANT_ID = process.env.OLD_TENANT_ID || process.env.TENANT_ID;
const OLD_CLIENT_ID = process.env.OLD_CLIENT_ID || process.env.CLIENT_ID;
const OLD_CLIENT_SECRET = process.env.OLD_CLIENT_SECRET || process.env.CLIENT_SECRET;

const NEW_TENANT_ID = process.env.NEW_TENANT_ID;
const NEW_CLIENT_ID = process.env.NEW_CLIENT_ID;
const NEW_CLIENT_SECRET = process.env.NEW_CLIENT_SECRET;

const SITES_TO_VERIFY = [
    "Audit",
    "Benefits Sub-site",
    "Cash advice (Dividend and Coupon payment notification) from PFCs",
    "CSD",
    "Home",
    "Management Fee",
    "MD's Office",
    "Memo Sub-site",
    "NPL Admin and Facility",
    "NPL Asset Management",
    "NPL BDS",
    "NPL Client Services",
    "NPL Corporate Services",
    "NPL Credit",
    "NPL Digital Marketing and Brands",
    "NPL ERMD",
    "NPL Fund Accounting",
    "NPL Internal Control and Compliance",
    "NPL Investment",
    "NPL Legal",
    "NPL Migration",
    "NPL Operations",
    "NPL Reconciliation",
    "NPL RSA",
    "NPL Technology and Innovation",
    "NPL-Funds-Correspondence",
    "Reports"
];

async function getAccessToken(tenantId, clientId, clientSecret) {
    const response = await axios.post(
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
        qs.stringify({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: 'https://graph.microsoft.com/.default',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );
    return response.data.access_token;
}

async function resolveSiteAndDrive(accessToken, siteName, tenantName) {
    const siteSearchUrl = `https://graph.microsoft.com/v1.0/sites?search=${encodeURIComponent(siteName)}`;
    const siteResponse = await axios.get(siteSearchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const site = siteResponse.data.value.find(s => s.name.toLowerCase() === siteName.toLowerCase() || s.displayName.toLowerCase() === siteName.toLowerCase());

    let siteId;
    if (!site) {
        const directUrl = `https://graph.microsoft.com/v1.0/sites/${tenantName}.sharepoint.com:/sites/${siteName}`;
        const directResponse = await axios.get(directUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        siteId = directResponse.data.id;
    } else {
        siteId = site.id;
    }

    const driveSearchUrl = `https://graph.microsoft.com/v1.0/sites/${siteId}/drives`;
    const driveResponse = await axios.get(driveSearchUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
    const drive = driveResponse.data.value.find(d => d.name === 'Documents') || driveResponse.data.value[0];
    return { siteId, driveId: drive.id };
}

async function listAllItemsRecursive(accessToken, driveId, folderId = 'root', path = '', stats = { folders: 0, files: 0 }) {
    let results = [];
    let nextUrl = `https://graph.microsoft.com/v1.0/drives/${driveId}/items/${folderId}/children`;

    while (nextUrl) {
        let retries = 3;
        let response;
        while (retries > 0) {
            try {
                response = await axios.get(nextUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
                break;
            } catch (error) {
                retries--;
                console.error(`  Error listing items at ${path || 'root'} (${retries} retries left):`, error.message);
                if (retries === 0) return results;
                await new Promise(resolve => setTimeout(resolve, 5000));
            }
        }

        const items = response.data.value || [];
        for (const item of items) {
            const itemPath = `${path}/${item.name}`;
            if (item.folder) {
                stats.folders++;
                results.push({ type: 'folder', path: itemPath, id: item.id });
                // We don't log every folder to keep output clean, but we show incremental progress
                if (stats.folders % 50 === 0) console.log(`    ... Scanning folder ${stats.folders}: ${itemPath}`);
                const subItems = await listAllItemsRecursive(accessToken, driveId, item.id, itemPath, stats);
                results = results.concat(subItems);
            } else {
                stats.files++;
                results.push({ type: 'file', path: itemPath, id: item.id, size: item.size });
            }
        }

        nextUrl = response.data['@odata.nextLink'];
    }
    return results;
}

function formatSize(bytes) {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function verifySite(siteName) {
    console.log(`\n========================================`);
    console.log(`VERIFYING SITE: ${siteName}`);
    console.log(`========================================`);
    try {
        const tokenOld = await getAccessToken(OLD_TENANT_ID, OLD_CLIENT_ID, OLD_CLIENT_SECRET);
        const tokenNew = await getAccessToken(NEW_TENANT_ID, NEW_CLIENT_ID, NEW_CLIENT_SECRET);

        const oldInfo = await resolveSiteAndDrive(tokenOld, siteName, process.env.OLD_TENANT_NAME || 'norrenberger');
        const newInfo = await resolveSiteAndDrive(tokenNew, siteName, process.env.NEW_TENANT_NAME || 'norrenpensions');

        console.log('  Scanning old site...');
        const oldItems = await listAllItemsRecursive(tokenOld, oldInfo.driveId);
        const oldFiles = oldItems.filter(i => i.type === 'file');
        const oldFolders = oldItems.filter(i => i.type === 'folder');
        const oldSize = oldFiles.reduce((acc, f) => acc + (f.size || 0), 0);
        console.log(`  Found ${oldFiles.length} files and ${oldFolders.length} folders in old site. Total size: ${formatSize(oldSize)}`);

        console.log('  Scanning new site...');
        const newItems = await listAllItemsRecursive(tokenNew, newInfo.driveId);
        const newFiles = newItems.filter(i => i.type === 'file');
        const newFolders = newItems.filter(i => i.type === 'folder');
        const newSize = newFiles.reduce((acc, f) => acc + (f.size || 0), 0);
        console.log(`  Found ${newFiles.length} files and ${newFolders.length} folders in new site. Total size: ${formatSize(newSize)}`);

        const mismatches = [];
        oldFiles.forEach(of => {
            const nf = newFiles.find(f => f.path === of.path);
            if (!nf) {
                mismatches.push(`Missing in new site: ${of.path}`);
            } else if (nf.size !== of.size) {
                mismatches.push(`Size mismatch: ${of.path} (Old: ${of.size}, New: ${nf.size})`);
            }
        });

        const stats = {
            siteName,
            status: (mismatches.length === 0 && oldFiles.length === newFiles.length) ? 'MATCH' : 'MISMATCH',
            old: {
                files: oldFiles.length,
                folders: oldFolders.length,
                size: formatSize(oldSize),
                sizeBytes: oldSize
            },
            new: {
                files: newFiles.length,
                folders: newFolders.length,
                size: formatSize(newSize),
                sizeBytes: newSize
            },
            mismatches: mismatches.length
        };

        if (stats.status === 'MATCH') {
            console.log(`✓ Site ${siteName} verified successfully!`);
        } else {
            console.log(`✗ Verification failed for ${siteName}. Found ${mismatches.length} mismatches.`);
        }

        return stats;
    } catch (error) {
        console.error(`  Error verifying site ${siteName}:`, error.message);
        return { siteName, status: 'ERROR', error: error.message };
    }
}

async function main() {
    if (SITES_TO_VERIFY.length === 0) {
        console.log('No sites specified in SITES_TO_VERIFY array.');
        return;
    }

    const report = [];
    for (const siteName of SITES_TO_VERIFY) {
        const result = await verifySite(siteName);
        report.push(result);
    }

    console.log('\n' + '='.repeat(80));
    console.log('VERIFICATION SUMMARY');
    console.log('='.repeat(80));
    console.log(`${String('SITE NAME').padEnd(30)} | ${String('STATUS').padEnd(10)} | ${String('OLD (Fld/Fil/Size)').padEnd(25)} | ${String('NEW (Fld/Fil/Size)').padEnd(25)}`);
    console.log('-'.repeat(80));

    report.forEach(r => {
        if (r.status === 'ERROR') {
            console.log(`${r.siteName.padEnd(30)} | ${r.status.padEnd(10)} | ERROR: ${r.error}`);
        } else {
            const oldStr = `${r.old.folders}/${r.old.files}/${r.old.size}`;
            const newStr = `${r.new.folders}/${r.new.files}/${r.new.size}`;
            console.log(`${r.siteName.padEnd(30)} | ${r.status.padEnd(10)} | ${oldStr.padEnd(25)} | ${newStr.padEnd(25)}`);
        }
    });
    console.log('='.repeat(80));

    const logPath = path.join(__dirname, `verification-summary-${Date.now()}.json`);
    fs.writeFileSync(logPath, JSON.stringify(report, null, 2));
    console.log(`\nDetailed verification report saved to: ${logPath}`);
}

if (require.main === module) {
    main().catch(console.error);
}
