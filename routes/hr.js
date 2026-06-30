const express = require('express');
const { connectToDatabase, sql } = require('./dbconnection');
const capitalizeWords = require('./capitalizeWords.js');

const router = express.Router();

async function getActiveStaffList(page, limit) {
    try {
        const pool = await connectToDatabase('PFA');

        const request = await pool.request();

        const result = await request
            .input('Page', sql.Int, page)
            .input('PageSize', sql.Int, limit)
            .execute('PFA.dbo.GetActiveStaffList');

        return result.recordset;

    } catch (error) {
        console.log('Error fetching data from DB.');
    }
}

router.get('/active-staff', async (req, res) => {
    const page = Number(req.query.page);
    const limit = Number(req.query.limit);
    console.log('Agentspayload: ', page, limit);

    try {
        const pool = await connectToDatabase('PFA');
        const request = await pool.request();

        const staffCountRes = await request.execute('PFA.dbo.GetTotalActiveStaffCount');
        console.log("StafFCount: ", staffCountRes);

        const totalCount = staffCountRes.recordset[0].totalStaff;

        const staffList = await getActiveStaffList(page, limit);

        const totalPages = Math.ceil(totalCount / limit);
        const hasMore = page < totalPages;

        const result = {
            data: staffList,
            currentPage: page,
            totalPages: totalPages,
            totalItems: totalCount,
            hasMore: hasMore
        }

        res.status(200).json(result);

    } catch (error) {
        console.log("StaffList: ", error);
    }
})


router.get('/departments', async (req, res) => {
    try {
        const pool = await connectToDatabase('PFA');
        const request = await pool.request();

        const deptRes = await request.query(`
            SELECT Description AS dept  
            FROM PFA.dbo.DEPARTMENT;
            `)

        const result = deptRes.recordset;
        const data = result.map((row) => row.dept);
        console.log('Data: ', data);

        res.status(200).json(data);
    } catch (error) {
        console.log('Error fetching depts: ', error);
    }
})

router.get('/dept-units', async (req, res) => {
    try {
        // SELECT DISTINCT DEPT_UNIT FROM AGENTS WHERE DEPT_UNIT IS NOT NULL
        const pool = await connectToDatabase('PFA');
        const request = await pool.request();

        const deptUnitRes = await request.query(`
            SELECT unit FROM PFA.dbo.DEPT_UNIT 
             ORDER BY dept
            `)

        const result = deptUnitRes.recordset;
        const data = result.map((row) => row.unit);
        console.log('Data: ', data);

        res.status(200).json(data);
    } catch (error) {
        console.log('Error fetching dept units: ', error);
    }
})

router.get('/branches', async (req, res) => {
    try {
        const pool = await connectToDatabase('PFA');
        const request = await pool.request();

        const branchesRes = await request.query(`
            SELECT DESCRIPTION AS branch FROM PFA.dbo.BRANCH
            `)

        const result = branchesRes.recordset;
        const data = result.map((row) => row.branch);

        res.status(200).json(data);
    } catch (error) {
        console.log('Error fetching branches: ', error);
    }
})

router.get('/grade-levels', async (req, res) => {
    try {
        const pool = await connectToDatabase('PFA');
        const request = await pool.request();

        const gradeLvlRes = await request.query(`
            SELECT DISTINCT GRADE_LEVEL AS grade FROM PFA.dbo.AGENTS
	        WHERE GRADE_LEVEL IS NOT NULL;
            `)
        const result = gradeLvlRes.recordset;
        const data = result.map((row) => row.grade);

        res.status(200).json(data);
    } catch (error) {
        console.log('Error fetching grade-levels: ', error);
    }
})

router.get('/line-managers', async (req, res) => {
    try {
        const pool = await connectToDatabase('PFA');
        const request = await pool.request();

        const lineManagersRes = await request.query(`
            SELECT DISTINCT a2.AGENT_NAME AS lineMng
            FROM AGENTS a1
            JOIN AGENTS a2 ON a1.LINE_MANAGER = a2.AGENT_CODE
                WHERE a1.LINE_MANAGER IS NOT NULL;
            `)

        const result = lineManagersRes.recordset;
        const data = result.map((row) => row.lineMng);

        res.status(200).json(data);
    } catch (error) {
        console.log('Line Manager Fetch: ', error);
    }
});

router.post('/staff-details', async (req, res) => {
    try {
        const { agentCode } = req.body.params;
        const pool = await connectToDatabase('PFA');

        const staffDetailRes = await pool.request()
            .input('agentCode', agentCode)
            .query(`
                SELECT A.STAFF_ID AS staffId, A.FIRSTNAME AS firstname,
                    A.SURNAME AS surname, A.OTHERNAMES AS othernames,
                    A.MOBILE_PHONE AS mobilePhone, A.EMAIL AS email,
                    A.DEPARTMENT AS department, A.DEPT_UNIT AS deptUnit,
                    A.DESIGNATION AS designation, A.LINE_MANAGER AS lineManager,
                    B.DESCRIPTION AS branch, A.DATE_RESUMED AS dateResumed,
                    A.GRADE_LEVEL AS gradeLevel, A.INTRODUCER_NAME AS introducerName,
                    A.AGENT_CODE AS agentCode, A.RTS_TARGET AS rtsTarget, A.MPP_TARGET AS mppTarget,
                    A.TOTAL_TARGET AS totalTarget, RTS_COUNT_TARGET AS rtsCountTarget,
                    A.RSA_COUNT_TARGET AS rsaCountTarget, A.MPP_COUNT_TARGET AS mppCountTarget
                FROM PFA.dbo.AGENTS A 
                JOIN PFA.dbo.BRANCH B ON A.BRANCH_CODE = B.CODE
                WHERE AGENT_CODE = @agentCode
                `)

        const data = staffDetailRes.recordset[0];
        console.log('DATA: ', data);

        res.status(200).json(data);

    } catch (error) {
        console.log('Error fetch staffData: ', error);
    }
})


router.post('/add-new-staff', async (req, res) => {
    console.log('BoDY: ', req.body);

    try {
        const { firstname, surname, mobilePhone,
            email, department,
            branch,
            agentCode, rtsTarget, rsaTarget, mppTarget,
            totalTarget, rtsCountTarget, rsaCountTarget, mppCountTarget } = req.body;
        const staffId = req.staffId ? req.staffId : '';
        const lineManager = req.lineManager ? req.lineManager : '';
        const introducerName = req.introducerName ? req.introducerName : '';
        const designation = req.designation ? req.designation : '';
        const othernames = req.othernames ? req.othernames : '';
        const deptUnit = req.deptUnit ? req.deptUnit : '';
        const dateResumed = req.dateResumed ? req.dateResumed : '';
        const gradeLevel = req.gradeLevel ? req.gradeLevel : '';

        console.log('Log: ', typeof rtsTarget, typeof rsaTarget, typeof mppCountTarget);
        const rtsTargetC = rtsTarget.trim() ? parseFloat(rtsTarget) : 0.00;
        const rsaTargetC = rsaTarget.trim() ? parseFloat(rsaTarget) : 0.00;
        const mppTargetC = mppTarget.trim() ? parseFloat(mppTarget) : 0.00;
        const totalTargetC = totalTarget.trim() ? parseFloat(totalTarget) : 0.00;
        const rtsCountTargetC = rtsCountTarget.trim() ? parseFloat(rtsCountTarget) : 0.00;
        const rsaCountTargetC = rsaCountTarget.trim() ? parseFloat(rsaCountTarget) : 0.00;
        const mppCountTargetC = mppCountTarget.trim() ? parseFloat(mppCountTarget) : 0.00;
        console.log("rtsTarget: ", rtsTargetC);
        console.log("rsaTarget: ", rsaTargetC);

        const now = new Date();
        const dateCreated = now.toISOString().slice(0, 10);
        console.log('DateCr: ', dateCreated);
        const fullName = `${firstname} ${surname} ${othernames}`;


        const pool = await connectToDatabase('PFA');
        console.log('LineMan: ', lineManager)

        const hodRes = await pool.request()
            .input('hodName', lineManager)
            .query(`
                SELECT AGENT_CODE 
                    FROM PFA.dbo.AGENTS 
                    WHERE AGENT_NAME LIKE '%' + @hodName + '%';
                `)

        const hod = await hodRes.recordset[0].AGENT_CODE;

        const branchDetailsRes = await pool.request()
            .input('branch', branch)
            .query(`
                SELECT CODE AS branchCode, TRANS_ID AS transId, TEAM_CODE AS teamCode, STATE_CODE AS stateCode, CITY AS city
                        FROM PFA.dbo.BRANCH WHERE DESCRIPTION = @branch;
                `);

        const branchInfo = branchDetailsRes.recordset[0];

        const { branchCode, transId, teamCode, stateCode, city } = branchInfo;
        const transID = Math.floor(transId);
        console.log('TRANSID: ', transID);

        console.log("RESULT: ", typeof branchCode, typeof transId, typeof stateCode);

        const addNewStaffRes = await pool.request()
            .input('agentCode', agentCode)
            .input('agentName', fullName)
            .input('mobileNum', mobilePhone)
            .input('email', email)
            .input('teamCode', teamCode)
            .input('stateCode', stateCode)
            .input('exited', 0)
            .input('transId', transID)
            .input('branchCode', branchCode)
            .input('city', city)
            .input('rtsTarget', rtsTargetC)
            .input('rsaTarget', rsaTargetC)
            .input('mppTarget', mppTargetC)
            .input('totalTarget', totalTargetC)
            .input('rtsCountTarget', rtsCountTargetC)
            .input('rsaCountTarget', rsaCountTargetC)
            .input('mppCountTarget', mppCountTargetC)
            .input('introducerName', introducerName)
            .input('dateResumed', dateResumed)
            .input('gradeLevel', gradeLevel)
            .input('department', department)
            .input('staffId', staffId)
            .input('lineManager', hod)
            .input('dateCreated', dateCreated)
            .input('designation', designation)
            .input('deptUnit', deptUnit)
            .input('firstName', firstname)
            .input('surname', surname)
            .input('othernames', othernames)
            .query(`
            SET IDENTITY_INSERT PFA.dbo.AGENTS ON;
            INSERT INTO PFA.dbo.AGENTS (AGENT_CODE, AGENT_NAME, MOBILE_PHONE, EMAIL, TEAM_CODE, STATE_CODE, 
                EXITED, TRANSID, BRANCH_CODE, CITY, RTS_TARGET, RSA_TARGET, MPP_TARGET, TOTAL_TARGET,
                RTS_COUNT_TARGET, RSA_COUNT_TARGET, MPP_COUNT_TARGET, INTRODUCER_NAME, DATE_RESUMED, 
                GRADE_LEVEL, DEPARTMENT, STAFF_ID, LINE_MANAGER, DATE_CREATED, DESIGNATION, 
                DEPT_UNIT, FIRSTNAME, SURNAME, OTHERNAMES)
            VALUES (@agentCode, @agentName, @mobileNum, @email, @teamCode, @stateCode,
                    @exited, @transId, @branchCode, @city, @rtsTarget, @rsaTarget, @mppTarget, @totalTarget,
                    @rtsCountTarget, @rsaCountTarget, @mppCountTarget, @introducerName, @dateResumed,
                    @gradeLevel, @department, @staffId, @lineManager, @dateCreated, @designation,
                    @deptUnit, @firstName, @surname, @othernames)
            `)

        console.log('Result: ', addNewStaffRes);

        res.status(200).json({ message: 'Submitted successfully.' });
    } catch (error) {
        console.log('Failed to save new staff record: ', error);
    }
})


module.exports = router;