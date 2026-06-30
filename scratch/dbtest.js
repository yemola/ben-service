const { connectToDatabase } = require('/Users/ieianchor/Downloads/projects/benefit-doc-api/routes/dbconnection');

async function test() {
    try {
        const poolB = await connectToDatabase('BenefitTracker_v2');
        console.log("Creating table ClientDetailsUpdates if it does not exist...");

        await poolB.request().query(`
            IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID(N'[dbo].[ClientDetailsUpdates]') AND type in (N'U'))
            BEGIN
                CREATE TABLE [dbo].[ClientDetailsUpdates] (
                    [id] INT IDENTITY(1,1) PRIMARY KEY,
                    [rsa_pin] VARCHAR(30) NOT NULL,
                    [old_phone] VARCHAR(30) NULL,
                    [new_phone] VARCHAR(30) NULL,
                    [old_email] VARCHAR(100) NULL,
                    [new_email] VARCHAR(100) NULL,
                    [old_state] VARCHAR(10) NULL,
                    [new_state] VARCHAR(10) NULL,
                    [old_bvn] VARCHAR(30) NULL,
                    [new_bvn] VARCHAR(30) NULL,
                    [old_nin] VARCHAR(30) NULL,
                    [new_nin] VARCHAR(30) NULL,
                    [old_employer] VARCHAR(255) NULL,
                    [new_employer] VARCHAR(255) NULL,
                    [old_employer_code] VARCHAR(50) NULL,
                    [new_employer_code] VARCHAR(50) NULL,
                    [attachment_name] VARCHAR(255) NULL,
                    [created_at] DATETIME DEFAULT GETDATE()
                )
            END
        `);
        console.log("Table check/creation completed successfully!");

        const tables = await poolB.request().query(`
            SELECT TABLE_NAME 
            FROM INFORMATION_SCHEMA.TABLES 
            WHERE TABLE_NAME = 'ClientDetailsUpdates'
        `);
        console.log("Check result:", tables.recordset);
        
    } catch (e) {
        console.error("Error:", e);
    } finally {
        process.exit(0);
    }
}

test();
