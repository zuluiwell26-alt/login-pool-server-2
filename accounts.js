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
const HEARTBEAT_TIMEOUT_MS = 2 * 60 * 1000;

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
    TWENTY_FOUR_HOURS_MS,
    FREE_ACCOUNT_LOCK_THRESHOLD,
    LOCK_HOUR,
    LOCK_MINUTE,
    UNLOCK_HOUR,
    UNLOCK_MINUTE,
    REMOVE_PASSWORD,
    HEARTBEAT_TIMEOUT_MS,
};
