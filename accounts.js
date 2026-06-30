const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const FREE_ACCOUNT_LOCK_THRESHOLD = 50;
const LOCK_HOUR = 8;
const LOCK_MINUTE = 0;
const UNLOCK_HOUR = 18;
const UNLOCK_MINUTE = 0;
const REMOVE_PASSWORD = '1234';
const HEARTBEAT_TIMEOUT_MS = 5 * 60 * 1000;
const TIMEZONE = 'Africa/Lusaka';

async function initDB() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS accounts (
            phone TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            status TEXT DEFAULT 'FREE',
            logout_time BIGINT DEFAULT NULL,
            logout_time_str TEXT DEFAULT NULL,
            last_heartbeat BIGINT DEFAULT NULL
        );
    `);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS bad_password_accounts (
            phone TEXT PRIMARY KEY,
            password TEXT,
            reported_at TEXT,
            status TEXT DEFAULT 'BAD_PASSWORD'
        );
    `);

    const { rowCount } = await pool.query('SELECT 1 FROM accounts LIMIT 1');
    if (rowCount === 0) {
        const phoneList = [
            ["769341931","12345QAZ"],
            ["764970746","12345QAZ"],
            ["969950228","12345QAZ"],
            ["963060339","12345QAZ"],
            ["760663789","12345QAZ"],
            ["969594643","12345QAZ"],
            ["760021383","12345QAZ"],
            ["760659551","12345QAZ"],
            ["964708601","12345QAZ"],
            ["968760277","12345QAZ"],
            ["760019591","12345QAZ"],
            ["968651969","12345QAZ"],
            ["764164912","12345QAZ"],
            ["760664025","12345QAZ"],
            ["766330133","12345QAZ"],
            ["760661980","12345QAZ"],
            ["760037797","12345QAZ"],
            ["968760637","12345QAZ"],
            ["760020788","12345QAZ"],
            ["760663289","12345QAZ"],
            ["963436308","12345QAZ"],
            ["771955649","12345QAZ"],
            ["760667659","12345QAZ"],
            ["761409130","12345QAZ"],
            ["760018595","12345QAZ"],
            ["968617422","12345QAZ"],
            ["967941470","12345QAZ"],
            ["968760381","12345QAZ"],
            ["966877147","12345QAZ"],
            ["760891376","12345QAZ"],
            ["967049603","12345QAZ"],
            ["960700340","12345QAZ"],
            ["760661194","12345QAZ"],
            ["968155185","12345QAZ"],
            ["963533297","12345QAZ"],
            ["967558578","12345QAZ"],
            ["963912256","12345QAZ"],
            ["968763426","12345QAZ"],
            ["760583293","12345QAZ"],
            ["962726590","12345QAZ"],
            ["763568073","12345QAZ"],
            ["760666109","12345QAZ"],
            ["760006202","12345QAZ"],
            ["763023299","12345QAZ"],
            ["965764761","12345QAZ"],
            ["968154435","12345QAZ"],
            ["760020756","12345QAZ"],
            ["764939812","12345QAZ"],
            ["761518509","12345QAZ"],
            ["965471815","12345QAZ"],
            ["966175242","12345QAZ"],
            ["760019654","12345QAZ"],
            ["964807585","12345QAZ"],
            ["965205922","12345QAZ"],
            ["965311647","12345QAZ"],
            ["760005574","12345QAZ"],
            ["962244843","12345QAZ"],
            ["760247262","12345QAZ"],
            ["760006984","12345QAZ"],
            ["962375823","12345QAZ"],
            ["760956348","12345QAZ"],
            ["760021086","12345QAZ"],
            ["760006873","12345QAZ"],
            ["765423136","12345QAZ"],
            ["764889476","12345QAZ"],
            ["763953726","12345QAZ"],
            ["762088489","12345QAZ"],
            ["969403257","12345QAZ"],
            ["763587210","12345QAZ"],
            ["966390327","12345QAZ"],
            ["760664826","12345QAZ"],
            ["960660484","12345QAZ"],
            ["760020814","12345QAZ"],
            ["760227578","12345QAZ"],
            ["769385258","12345QAZ"],
            ["962055080","12345QAZ"],
            ["966925797","12345QAZ"],
            ["960597218","12345QAZ"],
            ["968625930","12345QAZ"],
            ["760005186","12345QAZ"],
            ["760933213","12345QAZ"],
            ["760019189","12345QAZ"],
            ["966468427","12345QAZ"],
            ["960731698","12345QAZ"],
            ["968542617","12345QAZ"],
            ["964053903","12345QAZ"],
            ["969534706","12345QAZ"],
            ["968724386","12345QAZ"],
            ["768454129","12345QAZ"],
            ["768404417","12345QAZ"],
            ["965580916","12345QAZ"],
            ["764964762","12345QAZ"],
        ];
        for (const [phone, password] of phoneList) {
            await pool.query(
                `INSERT INTO accounts (phone, password) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [phone, password]
            );
        }
        console.log('Accounts seeded into database.');
    }
}

async function getAccounts() {
    const { rows } = await pool.query('SELECT * FROM accounts');
    return rows.map(r => ({
        phone: r.phone,
        password: r.password,
        status: r.status,
        logoutTime: r.logout_time ? Number(r.logout_time) : null,
        logoutTimeStr: r.logout_time_str,
        lastHeartbeat: r.last_heartbeat ? Number(r.last_heartbeat) : null,
    }));
}

async function updateAccount(phone, fields) {
    const map = { logoutTime: 'logout_time', logoutTimeStr: 'logout_time_str', lastHeartbeat: 'last_heartbeat', status: 'status' };
    const keys = Object.keys(fields);
    const setClauses = keys.map((k, i) => `${map[k]} = $${i + 1}`).join(', ');
    const values = [...keys.map(k => fields[k]), phone];
    await pool.query(`UPDATE accounts SET ${setClauses} WHERE phone = $${values.length}`, values);
}

async function addAccount(phone, password) {
    await pool.query(
        `INSERT INTO accounts (phone, password, status) VALUES ($1, $2, 'FREE')`,
        [phone, password]
    );
}

async function removeAccount(phone) {
    await pool.query('DELETE FROM accounts WHERE phone = $1', [phone]);
}

async function resetAllAccounts() {
    await pool.query(`UPDATE accounts SET status = 'FREE', logout_time = NULL, logout_time_str = NULL, last_heartbeat = NULL`);
}

async function getBadPasswordAccounts() {
    const { rows } = await pool.query('SELECT * FROM bad_password_accounts');
    return rows.map(r => ({ phone: r.phone, password: r.password, reportedAt: r.reported_at, status: r.status }));
}

async function addBadPasswordAccount(phone, password, reportedAt) {
    await pool.query(
        `INSERT INTO bad_password_accounts (phone, password, reported_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
        [phone, password, reportedAt]
    );
}

async function removeBadPasswordAccount(phone) {
    await pool.query('DELETE FROM bad_password_accounts WHERE phone = $1', [phone]);
}

function getZambiaTime() {
    const now = new Date();
    const zambiaStr = now.toLocaleString('en-GB', { timeZone: TIMEZONE });
    const [datePart, timePart] = zambiaStr.split(', ');
    const [hours, minutes, seconds] = timePart.split(':').map(Number);
    return { hour: hours, minute: minutes, second: seconds };
}

module.exports = {
    pool,
    initDB,
    getAccounts,
    updateAccount,
    addAccount,
    removeAccount,
    resetAllAccounts,
    getBadPasswordAccounts,
    addBadPasswordAccount,
    removeBadPasswordAccount,
    getZambiaTime,
    TWENTY_FOUR_HOURS_MS,
    FREE_ACCOUNT_LOCK_THRESHOLD,
    LOCK_HOUR,
    LOCK_MINUTE,
    UNLOCK_HOUR,
    UNLOCK_MINUTE,
    REMOVE_PASSWORD,
    HEARTBEAT_TIMEOUT_MS,
    TIMEZONE,
};
