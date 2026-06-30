# Zero-Downtime SharePoint Migration Guide

## Overview

This migration strategy ensures **zero downtime** for your Benefit Tracker application. Users can continue uploading new benefit requests while the migration runs in the background.

## How It Works

### 1. **Dual-Tenant Support**
   - The application now supports accessing both tenants simultaneously
   - New uploads automatically go to the **NEW tenant** (norrenpensions)
   - Old folders are accessed from the **OLD tenant** (norrenberger) until migrated
   - The system automatically detects which tenant to use based on `folder_path` stored in the database

### 2. **Migration Process**
   - Migration script runs in the background
   - Only migrates folders from OLD tenant
   - Does NOT interfere with new uploads (which go to NEW tenant)
   - Updates database records after successful migration

### 3. **Application Behavior**

#### New Uploads (`/application-subm`)
   - Always use **NEW tenant** credentials
   - Create folders in `norrenpensions` SharePoint
   - Store new `folder_path` and `folder_id` in database

#### Reading Files (`/folder`, `/files-metadata`, etc.)
   - Check `folder_path` from database
   - If `folder_path` contains `norrenberger.sharepoint.com` → use OLD tenant
   - If `folder_path` contains `norrenpensions.sharepoint.com` → use NEW tenant
   - Automatically routes to correct tenant

#### File Operations (delete, replace, merge)
   - Same tenant detection logic
   - Operations work seamlessly on both tenants

## Environment Variables

### Current Production (OLD Tenant - norrenberger)
**Keep these as-is - DO NOT rename:**

```env
TENANT_ID=...
CLIENT_ID=...
CLIENT_SECRET=...
SITE_ID=...
DRIVE_ID=...
BASE_URL=https://graph.microsoft.com/v1.0/drives
TENANT_NAME=norrenberger
```

### New Tenant (norrenpensions)
**Add these with `NEW_` prefix:**

```env
NEW_TENANT_ID=...
NEW_CLIENT_ID=...
NEW_CLIENT_SECRET=...
NEW_SITE_ID=...
NEW_DRIVE_ID=...
NEW_BASE_URL=https://graph.microsoft.com/v1.0/drives
```

## Migration Steps

### Step 1: Add New Tenant Credentials
1. Add `NEW_*` environment variables to your `.env` file
2. Get `NEW_SITE_ID` and `NEW_DRIVE_ID` using Graph API (see MIGRATION_GUIDE.md)

### Step 2: Deploy Updated Code
1. Deploy the updated `routes/tasks.js` and `routes/files.js`
2. Deploy the new `utility/sharePointTenantHelper.js`
3. The application will now:
   - Create new folders in NEW tenant
   - Access old folders from OLD tenant
   - Access new folders from NEW tenant

### Step 3: Run Migration Script
```bash
node migrate-sharepoint.js
```

This will:
- Migrate all folders from OLD tenant to NEW tenant
- Update database records (`folder_id`, `folder_path`, `folderUrl`)
- **NOT interfere with new uploads** (they already go to NEW tenant)

### Step 4: Verify Migration
```bash
node verify-migration.js
```

### Step 5: Monitor Application
- Continue monitoring the application
- New uploads work normally (go to NEW tenant)
- Old folders are accessible during migration
- After migration completes, all folders are in NEW tenant

### Step 6: Post-Migration Cleanup (Optional)
Once migration is complete and verified:
- You can remove OLD tenant credentials from `.env` (if desired)
- Or keep them for reference/rollback

## Key Benefits

✅ **Zero Downtime**: Application continues working during migration  
✅ **No User Impact**: Users can upload new requests normally  
✅ **Automatic Routing**: System automatically uses correct tenant  
✅ **Safe Migration**: Original data remains untouched until migration completes  
✅ **Rollback Capability**: Can revert if needed (database records can be restored)

## Troubleshooting

### New Uploads Fail
- Check `NEW_*` environment variables are set correctly
- Verify NEW tenant credentials have proper permissions
- Check application logs for authentication errors

### Old Folders Not Accessible
- Verify OLD tenant credentials are still valid
- Check `folder_path` in database contains correct URL
- Ensure migration hasn't updated records prematurely

### Migration Script Errors
- Check both OLD and NEW tenant credentials
- Verify database connection
- Review migration log file for specific errors

## Important Notes

1. **Do NOT rename existing environment variables** - they're still needed for old folders
2. **Migration can run while application is live** - it only reads from OLD tenant
3. **New uploads always go to NEW tenant** - this is intentional
4. **Database updates happen after successful migration** - ensures data consistency
5. **Test in development first** - verify everything works before production

