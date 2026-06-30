# SharePoint Tenant Migration Guide

This guide explains how to migrate folders and files from the old SharePoint tenant (norrenberger) to the new tenant (norrenpensions).

## Overview

The migration script (`migrate-sharepoint.js`) will:
1. Connect to both old and new SharePoint tenants
2. List all folders from the old tenant
3. For each folder:
   - Download all files
   - Create the folder in the new tenant
   - Upload all files to the new tenant
   - Update database records in `DocumentMetaData` and `Applications` tables

## Prerequisites

1. Ensure you have credentials for both tenants configured in your `.env` file
2. Ensure both tenants' service principals have necessary permissions:
   - **Files.ReadWrite.All** - to read from old tenant and write to new tenant
   - **Sites.ReadWrite.All** - to access SharePoint sites

## Environment Variables Setup

Add the following environment variables to your `.env` file:

### Old Tenant (norrenberger) Credentials

**These are your CURRENT production credentials - DO NOT CHANGE:**

```env
# Current Production Tenant (norrenberger) - Keep as-is
TENANT_ID=your-current-tenant-id
CLIENT_ID=your-current-client-id
CLIENT_SECRET=your-current-client-secret
SITE_ID=your-current-site-id
DRIVE_ID=your-current-drive-id
BASE_URL=https://graph.microsoft.com/v1.0/drives
TENANT_NAME=norrenberger
```

### New Tenant (norrenpensions) Credentials

**Add these NEW variables with `NEW_` prefix:**

```env
# New Tenant (norrenpensions) - Add these
NEW_TENANT_ID=your-new-tenant-id
NEW_CLIENT_ID=your-new-client-id
NEW_CLIENT_SECRET=your-new-client-secret
NEW_SITE_ID=your-new-site-id
NEW_DRIVE_ID=your-new-drive-id
NEW_BASE_URL=https://graph.microsoft.com/v1.0/drives
```

**Note:** `BASE_URL` format is `"https://graph.microsoft.com/v1.0/drives"` (without variables). The application constructs full URLs by appending `/${DRIVE_ID}/root:`.

## How to Find Your SharePoint Credentials

### Site ID and Drive ID

1. Go to your SharePoint site (e.g., `https://norrenpensions.sharepoint.com/sites/YourSite`)
2. Navigate to your document library
3. The Site ID can be found in the URL or by querying the Graph API
4. The Drive ID can be obtained by listing drives for the site:
   ```bash
   GET https://graph.microsoft.com/v1.0/sites/{site-hostname},{site-id}/drives
   ```

### BASE_URL Format

The BASE_URL should follow this pattern:
- Old: `https://graph.microsoft.com/v1.0/sites/{OLD_SITE_ID}/drives/{OLD_DRIVE_ID}/root:`
- New: `https://graph.microsoft.com/v1.0/sites/{NEW_SITE_ID}/drives/{NEW_DRIVE_ID}/root:`

## Running the Migration

### 1. Dry Run (Recommended First)

Before running the full migration, you may want to test with a small subset. You can modify the script to limit folders, or run it and monitor the first few folders.

### 2. Run the Migration

```bash
node migrate-sharepoint.js
```

The script will:
- Validate all required environment variables
- Authenticate with both tenants
- List all folders from the old tenant
- Migrate each folder and its files
- Update database records
- Generate a migration log file

### 3. Monitor Progress

The script provides real-time console output showing:
- Folder migration progress
- File migration progress
- Any errors encountered
- Final summary statistics

### 4. Review Migration Log

After completion, a JSON log file will be created with timestamp:
```
migration-log-{timestamp}.json
```

This log contains:
- Total folders/files processed
- Success/failure counts
- Detailed error information for failed items
- Migration duration

## Post-Migration Steps

### 1. Verify Migration

1. Check that all folders exist in the new tenant
2. Verify file counts match between old and new tenants
3. Test accessing files through your application

### 2. Update Application Code

Once migration is complete and verified, you can:
- Update your `.env` file to remove old tenant credentials
- Remove or comment out old tenant variables
- Keep only the new tenant credentials (without OLD_ prefix)

### 3. Disconnect Old Tenant

After confirming everything works:
1. You can disconnect from the old tenant
2. Remove old tenant credentials from `.env`
3. Archive the migration logs for reference

## Safety Features

The migration script includes several safety features:

1. **No Data Loss**: Files are downloaded before uploading, ensuring original files remain intact
2. **Error Handling**: Individual folder/file failures don't stop the entire migration
3. **Database Transactions**: Database updates are done carefully to maintain consistency
4. **Detailed Logging**: All operations are logged for auditing
5. **Idempotency**: Re-running won't create duplicates (folders are renamed if they exist)

## Troubleshooting

### Authentication Errors

- Verify all credentials are correct
- Check that service principals have necessary permissions
- Ensure tenant IDs, client IDs, and secrets match

### Rate Limiting

If you encounter rate limiting errors:
- The script includes a 1-second delay between folders
- You can increase the delay in the migration loop
- Consider running during off-peak hours

### Missing Files

If some files fail to migrate:
- Check the migration log for specific errors
- Verify file permissions in the old tenant
- Re-run migration for specific failed folders if needed

### Database Update Errors

- Ensure database connection is stable
- Check that folderId and fileId columns can accommodate new values
- Verify table permissions for UPDATE operations

## Rollback Plan

If you need to rollback:

1. The old tenant data remains unchanged (read-only operations)
2. Database records can be reverted if needed (backup recommended before migration)
3. New tenant folders can be deleted if necessary
4. Keep migration logs for reference

## Support

For issues or questions:
1. Check the migration log file for specific errors
2. Review console output for detailed error messages
3. Verify environment variables are correctly set
4. Ensure both tenants have proper permissions configured

