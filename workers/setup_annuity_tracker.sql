-- =============================================================================
-- setup_annuity_tracker.sql
-- Run this ONCE on your SQL Server against the BenefitTracker_v2 database
-- to create the tracker table and seed the initial row.
--
-- This table is intentionally kept in BenefitTracker_v2 (not PFA) so that
-- it is fully isolated from the core pension data store.
-- =============================================================================

USE BenefitTracker_v2;
GO

-- ── 1. Create tracker table (idempotent) ─────────────────────────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   INFORMATION_SCHEMA.TABLES
    WHERE  TABLE_SCHEMA = 'dbo'
      AND  TABLE_NAME   = 'ContributionNotificationTracker'
)
BEGIN
    CREATE TABLE dbo.ContributionNotificationTracker (
        ID                   INT           IDENTITY(1,1) PRIMARY KEY,
        NotificationType     VARCHAR(50)   NOT NULL,
        LastProcessedDate    DATETIME      NULL,       -- NULL = scan all history on first run
        LastRunAt            DATETIME      DEFAULT GETDATE(),

        CONSTRAINT UQ_ContributionNotificationTracker_Type
            UNIQUE (NotificationType)
    );

    PRINT 'Table ContributionNotificationTracker created.';
END
ELSE
BEGIN
    PRINT 'Table ContributionNotificationTracker already exists — skipped creation.';
END
GO

-- ── 2. Seed initial row for ANNUITY_CONTRIBUTION (idempotent) ─────────────────
IF NOT EXISTS (
    SELECT 1
    FROM   dbo.ContributionNotificationTracker
    WHERE  NotificationType = 'ANNUITY_CONTRIBUTION'
)
BEGIN
    INSERT INTO dbo.ContributionNotificationTracker
        (NotificationType, LastProcessedDate)
    VALUES
        ('ANNUITY_CONTRIBUTION', NULL);  -- NULL = pick up all existing ANNUITY records on first run

    PRINT 'Seed row for ANNUITY_CONTRIBUTION inserted.';
END
ELSE
BEGIN
    PRINT 'Seed row for ANNUITY_CONTRIBUTION already exists — skipped.';
END
GO

-- ── 3. Verify ─────────────────────────────────────────────────────────────────
SELECT *
FROM   dbo.ContributionNotificationTracker;
GO
