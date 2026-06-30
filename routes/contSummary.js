const { connectToDatabase } = require('./dbconnection');

const contSummary = async (pin) => {
    try {
        const pool = await connectToDatabase();

        const result = await pool.request().input('pin', pin).query(`SELECT 
        E.PIN,
        
        'FUND_CODE' = CASE 
                     WHEN C.FUND_ID = 73 THEN 'FUND1'
                     WHEN C.FUND_ID = 1 THEN 'FUND2'
                     WHEN C.FUND_ID = 74 THEN 'FUND3'
                     WHEN C.FUND_ID = 12 THEN 'FUND4'
                     WHEN C.FUND_ID = 79 THEN 'FUND5'
                     WHEN C.FUND_ID = 84 THEN 'FUND6 ACTIVE'
        
                     ELSE 'UNKNOWN'
        
                     END
        FROM PFA.dbo.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
        WHERE C.FUND_ID IN (73,1,74,12, 79,84)
        
        AND E.PIN IN (@pin)
        
        GROUP BY C.FUND_ID,  E.PIN
       
        HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0
        
        `);

        if (result.recordset.length === 0) {

            res.json({ code: 400 })

        } else {
            const fundid = result.recordset[0]['FUND_CODE']

            if (fundid === "FUND1") {

                const fundCode = await pool.request()
                    .query(`
    
            SELECT  TOP 1 SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 73 THEN 'FUND1'
                                
                                 ELSE 'OTHERS'
            
                                 END,
            
            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
            
            WHERE  SCHEME_ID IN (73)
            
            ORDER BY VALUATION_DATE DESC
            `)

                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(`SELECT 
                E.PIN,
                
                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 73 THEN 'FUND1'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
        
        
                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price
                            
                            END,
        
                            (CASE
                                WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],
                
                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                           
                            (CASE
                                WHEN C.FUND_ID = 73 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
        
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE
                
                        WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
        
                            END,
                            (CASE
                                 WHEN C.FUND_ID = 73 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END) - (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]


                FROM PFA.dbo.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (73)
                AND E.PIN IN (@pin)
                
                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0
                
                ORDER BY E.PIN 
            
            
            `);


                return results.recordsets[0][0]




            }
            if (fundid == "FUND2") {


                const fundCode = await pool.request()
                    .query(`

        SELECT  TOP 1 SCHEME_ID AS FUND_ID,
        'FUND_CODE' = CASE 
                             WHEN SCHEME_ID = 1 THEN 'FUND2'
                            
                             ELSE 'OTHERS'
        
                             END,
        
        BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
        
        WHERE  SCHEME_ID IN (1)
        
        ORDER BY VALUATION_DATE DESC
        `)
                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(`SELECT 
                E.PIN,
                
                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 1 THEN 'FUND2'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
        
        
                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price
                            
                            END,
        
                            (CASE
                                WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],
                
                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 1 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
        
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE
                
                        WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
        
                            END,
                            (CASE
                                 WHEN C.FUND_ID = 1 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END) - (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                FROM PFA.dbo.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (1)
                AND E.PIN IN (@pin)
                
                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0
                
                ORDER BY E.PIN 

        
        `);
                return results.recordsets[0][0]
            }
            if (fundid == "FUND3") {
                const fundCode = await pool.request()
                    .query(`
        
                SELECT  TOP 1 SCHEME_ID AS FUND_ID,
                'FUND_CODE' = CASE 
                                     WHEN SCHEME_ID = 74 THEN 'FUND3'
                                    
                                     ELSE 'OTHERS'
                
                                     END,
                
                BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
                
                WHERE  SCHEME_ID IN (74)
                
                ORDER BY VALUATION_DATE DESC
                `)
                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(`SELECT 
                E.PIN,
                
                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 74 THEN 'FUND3'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
        
        
                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 74 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price
                            
                            END,
        
                            (CASE
                                WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],
                
                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 74 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
        
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE
                
                        WHEN C.FUND_ID = 74THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
        
                            END,
                            (CASE
                                 WHEN C.FUND_ID = 74 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                                 FROM PFA.dbo.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (74)


                AND E.PIN IN (@pin)
                
                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0
                
                ORDER BY E.PIN 
                
                `);

                return results.recordsets[0][0]
            }
            if (fundid == "FUND4") {
                const fundCode = await pool.request()
                    .query(`
    
            SELECT  TOP 1 SCHEME_ID AS FUND_ID,
            'FUND_CODE' = CASE 
                                 WHEN SCHEME_ID = 12 THEN 'FUND4'
                                
                                 ELSE 'OTHERS'
            
                                 END,
            
            BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
            
            WHERE  SCHEME_ID IN (12)
            
            ORDER BY VALUATION_DATE DESC
            `)
                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(`SELECT 
                E.PIN,
                
                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 12 THEN 'FUND2'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
        
        
                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price
                            
                            END,
        
                            (CASE
                                WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],
                
                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 12 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
        
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE
                
                        WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
        
                            END,
                            (CASE
                                 WHEN C.FUND_ID = 12 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                            END)- (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                FROM PFA.dbo.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (12)
                AND E.PIN IN (@pin)
                
                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0
                
                ORDER BY E.PIN 
            
            
            
            `);

                return results.recordsets[0][0]

            }
            if (fundid == "FUND5") {

                const fundCode = await pool.request()
                    .query(`
        
                SELECT  TOP 1 SCHEME_ID AS FUND_ID,
                'FUND_CODE' = CASE 
                                     WHEN SCHEME_ID = 79 THEN 'FUND5'
                                    
                                     ELSE 'OTHERS'
                
                                     END,
                
                BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
                
                WHERE  SCHEME_ID IN (79)
                
                ORDER BY VALUATION_DATE DESC
                `)
                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(

                        `SELECT 
                E.PIN,
                
                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 79 THEN 'FUND5'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
        
        
                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price
                            
                            END,
        
                            (CASE
                                WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],
                
                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 79 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
        
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE
                
                        WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
        
                            END,
                            (CASE
                                 WHEN C.FUND_ID = 79 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END) - (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                FROM PFA.dbo.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (79)
                AND E.PIN IN (@pin)
                
                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0
                
                ORDER BY E.PIN 
                
                `);

                return results.recordsets[0][0]

            }
            if (fundid == "FUND6 ACTIVE") {


                const fundCode = await pool.request()
                    .query(`
        
                SELECT  TOP 1 SCHEME_ID AS FUND_ID,
                'FUND_CODE' = CASE 
                                     WHEN SCHEME_ID = 84 THEN 'FUND6 ACTIVE'
                                    
                                     ELSE 'OTHERS'
                
                                     END,
                
                BID_PRICE, OFFER_PRICE, VALUATION_DATE FROM PFA.DBO.PRICE_HISTORY
                
                WHERE  SCHEME_ID IN (84)
                
                ORDER BY VALUATION_DATE DESC
                `)

                //res.json(fundCode.recordsets)

                const price = fundCode.recordset[0]['BID_PRICE']

                const results = await pool.request()
                    .input('pin', pin)
                    .input('price', price)
                    .query(

                        `SELECT 
                E.PIN,
                
                'FUND_CODE' = CASE                   
                             WHEN C.FUND_ID = 84 THEN 'FUND6 ACTIVE'
                             ELSE 'UNKNOWN'
                             END,
                 SUM(ISNULL(C.EMPLOYEE_CONTRIBUTION, 0)) AS "EMPLOYEE_CONTRIBUTION",
                        SUM(ISNULL(C.EMPLOYER_CONTRIBUTION, 0)) AS "EMPLOYER_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) AS "TOTAL_CONTRIBUTION",
                        SUM(ISNULL(C.OTHER_CONTRIBUTION, 0)) AS "VOLUNTARY_CONTRIBUTION",
                        SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0))- SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS "NET_CONTRIBUTION",
                         SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) AS UNITS,
                         SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) AS [CUMULATIVE_VOLUNTARY_UNIT],
        
        
                'BALANCE' = CASE    
                            WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) *  @price
                            
                            END,
        
                            (CASE
                                WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_R,0.0000)) * @price
                                END) - SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0)) - SUM(ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)) AS [RSA_GROWTH],
                
                'VOLUNTARY_BALANCE' = CASE
                            WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
                            END,
                            (CASE
                                WHEN C.FUND_ID = 84 THEN  SUM(ISNULL(C.TRANS_UNITS_V,0.0000)) *  @price
        
                                END)- (SUM(ISNULL(C.OTHER_CONTRIBUTION, 0))) AS [VOLUNTARY_GROWTH],
                                SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) AS TOTAL_UNITS,
                'TOTAL_BALANCE' = CASE
                
                        WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
        
                            END,
                            (CASE
                                 WHEN C.FUND_ID = 84 THEN SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) * @price
                                 END) - (SUM(ISNULL(C.TOTAL_CONTRIBUTION, 0) + ISNULL(C.OTHER_CONTRIBUTION, 0) - (ISNULL(C.TOTAL_FEE, 0) + ISNULL(C.VAT_FEE, 0) + ISNULL(C.OTHER_FEE, 0)))) AS [TOTAL_GROWTH]
                FROM PFA.dbo.EMPLOYEES E INNER JOIN PFA.DBO.CONTRIBUTION C ON E.PIN = C.PIN
                WHERE C.FUND_ID IN (84)
                AND E.PIN IN (@pin)
                
                GROUP BY E.PIN,FUND_ID
                HAVING SUM(ISNULL(C.TRANS_UNITS_R,0.0000) + ISNULL(C.TRANS_UNITS_V,0.0000)) > 0
                
                ORDER BY E.PIN 
                
                `);

                return results.recordsets[0][0]

            }

        }

    } catch (error) {
        return {
            FUND_CODE: "",
            TOTAL_CONTRIBUTION: ""
        }
        console.log("Error fetch customer balance.", error)
    }


}

module.exports = { contSummary }