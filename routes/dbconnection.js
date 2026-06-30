const sql = require('mssql');
require('dotenv').config();

const config = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000,
        acquireTimeoutMillis: 30000,
    },
    options: {
        instanceName: '',
        encrypt: false, // Use true for production with a trusted certificate
        trustServerCertificate: true, // Change to false for production
        connectionTimeout: 30000,
        requestTimeout: 30000,
        debug: {
            packet: false,
            payload: false,
            token: false,
            data: false
        },
    },
};

// Store pools by database name
const pools = {};

const connectToDatabase = async (databaseName) => {
    if (!pools[databaseName] || !pools[databaseName].connected) {
        try {
            const poolConfig = {
                ...config,
                database: databaseName,
                options: {
                    ...config.options,
                }
            };
            // The mssql library uses the 'database' property from the main config level.
            // It does not need to be nested under 'options' for the pool.
            delete poolConfig.options.database;

            pools[databaseName] = await new sql.ConnectionPool(poolConfig).connect();
            console.log(`Connected to SQL Server Database: ${databaseName}`);

            pools[databaseName].on('error', err => {
                console.error('SQL Pool Error', err);
                // Optionally try to close and reconnect
                pools[databaseName].close();
                delete pools[databaseName];
            });

        } catch (error) {
            console.error('Error connecting to SQL Server: ', error);
            delete pools[databaseName]; // Remove failed pool from cache
            throw error;
        }
    }
    return pools[databaseName];
};

module.exports = { connectToDatabase, sql };