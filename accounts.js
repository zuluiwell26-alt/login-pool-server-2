const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const FREE_ACCOUNT_LOCK_THRESHOLD = 50;
// Time lock: pool is always locked 08:00 -> 18:00 (Zambia), regardless of free count
const LOCK_HOUR = 8;
const LOCK_MINUTE = 0;
const UNLOCK_HOUR = 18;
const UNLOCK_MINUTE = 0;
// Low-account lock: 18:00 -> 06:00 pool stays open no matter how low free count gets.
// At 06:00, if free accounts <= threshold, lock early (until the 08:00 time lock takes over anyway).
const LOW_ACCOUNT_LOCK_START_HOUR = 6;
const LOW_ACCOUNT_LOCK_START_MINUTE = 0;
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
            last_heartbeat BIGINT DEFAULT NULL,
            in_use_since BIGINT DEFAULT NULL,
            tab_id TEXT DEFAULT NULL,
            freed_at BIGINT DEFAULT NULL
        );
    `);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS in_use_since BIGINT DEFAULT NULL;`);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tab_id TEXT DEFAULT NULL;`);
    await pool.query(`ALTER TABLE accounts ADD COLUMN IF NOT EXISTS freed_at BIGINT DEFAULT NULL;`);
    await pool.query(`
        CREATE TABLE IF NOT EXISTS alerts (
            id SERIAL PRIMARY KEY,
            tab_id TEXT,
            amount NUMERIC DEFAULT 0,
            timestamp BIGINT,
            created_at TIMESTAMP DEFAULT NOW()
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
            ["571229027","pamer03"],
            ["571233431","pamer03"],
            ["573191021","pamer03"],
            ["573218113","pamer03"],
            ["573435628","pamer03"],
            ["573822910","pamer03"],
            ["573876935","pamer03"],
            ["573912516","pamer03"],
            ["574030959","pamer03"],
            ["574030962","pamer03"],
            ["574030964","pamer03"],
            ["574030966","pamer03"],
            ["574030975","pamer03"],
            ["574129008","pamer03"],
            ["574167639","pamer03"],
            ["574167651","pamer03"],
            ["574203310","pamer03"],
            ["574203315","pamer03"],
            ["574203325","pamer03"],
            ["574203347","pamer03"],
            ["574203374","pamer03"],
            ["574203379","pamer03"],
            ["574219997","pamer03"],
            ["574238249","pamer03"],
            ["574238252","pamer03"],
            ["574252009","pamer03"],
            ["574252018","pamer03"],
            ["574252022","pamer03"],
            ["574252023","pamer03"],
            ["574283166","pamer03"],
            ["574522519","pamer03"],
            ["574555615","pamer03"],
            ["574555616","pamer03"],
            ["574555617","pamer03"],
            ["574555618","pamer03"],
            ["574555619","pamer03"],
            ["574555620","pamer03"],
            ["574555621","pamer03"],
            ["574555647","pamer03"],
            ["574555712","pamer03"],
            ["574557521","pamer03"],
            ["574557524","pamer03"],
            ["574573250","pamer03"],
            ["574573259","pamer03"],
            ["574573335","pamer03"],
            ["574601571","pamer03"],
            ["574601572","pamer03"],
            ["574601573","pamer03"],
            ["574604364","pamer03"],
            ["574604365","pamer03"],
            ["574604366","pamer03"],
            ["574604368","pamer03"],
            ["574604369","pamer03"],
            ["574604370","pamer03"],
            ["574604382","pamer03"],
            ["574604385","pamer03"],
            ["574609954","pamer03"],
            ["574623473","pamer03"],
            ["574625371","pamer03"],
            ["574638140","pamer03"],
            ["574638161","pamer03"],
            ["574638201","pamer03"],
            ["574638227","pamer03"],
            ["574641539","pamer03"],
            ["574641540","pamer03"],
            ["574939832","pamer03"],
            ["574939833","pamer03"],
            ["574939912","pamer03"],
            ["574939916","pamer03"],
            ["574939961","pamer03"],
            ["574939963","pamer03"],
            ["574960428","pamer03"],
            ["574976586","pamer03"],
            ["574976674","pamer03"],
            ["574976675","pamer03"],
            ["574976858","pamer03"],
            ["574987425","pamer03"],
            ["574987426","pamer03"],
            ["574987504","pamer03"],
            ["574987533","pamer03"],
            ["574987761","pamer03"],
            ["574987764","pamer03"],
            ["574987768","pamer03"],
            ["574987770","pamer03"],
            ["760005186","pamer03"],
            ["760005417","pamer03"],
            ["760005574","pamer03"],
            ["760006202","pamer03"],
            ["760006384","pamer03"],
            ["760006873","pamer03"],
            ["760006979","pamer03"],
            ["760006984","pamer03"],
            ["760011793","pamer03"],
            ["760018356","pamer03"],
            ["760018443","pamer03"],
            ["760018595","pamer03"],
            ["760019189","pamer03"],
            ["760019219","pamer03"],
            ["760019591","pamer03"],
            ["760019593","pamer03"],
            ["760019654","pamer03"],
            ["760019659","pamer03"],
            ["760019672","pamer03"],
            ["760019724","pamer03"],
            ["760020756","pamer03"],
            ["760020761","pamer03"],
            ["760020788","pamer03"],
            ["760020814","pamer03"],
            ["760021086","pamer03"],
            ["760021261","pamer03"],
            ["760021383","pamer03"],
            ["760027905","pamer03"],
            ["760037246","pamer03"],
            ["760037688","pamer03"],
            ["760037719","pamer03"],
            ["760037797","pamer03"],
            ["760037866","pamer03"],
            ["760037870","pamer03"],
            ["760037894","pamer03"],
            ["760090381","pamer03"],
            ["760147665","pamer03"],
            ["760227578","pamer03"],
            ["760247262","pamer03"],
            ["760583293","pamer03"],
            ["760657413","pamer03"],
            ["760657444","pamer03"],
            ["760657485","pamer03"],
            ["760659322","pamer03"],
            ["760659465","pamer03"],
            ["760659523","pamer03"],
            ["760659538","pamer03"],
            ["760659551","pamer03"],
            ["760660688","pamer03"],
            ["760661063","pamer03"],
            ["760661194","pamer03"],
            ["760661938","pamer03"],
            ["760661967","pamer03"],
            ["760661980","pamer03"],
            ["760661985","pamer03"],
            ["760662019","pamer03"],
            ["760662341","pamer03"],
            ["760663289","pamer03"],
            ["760663789","pamer03"],
            ["760663865","pamer03"],
            ["760663943","pamer03"],
            ["760664025","pamer03"],
            ["760664195","pamer03"],
            ["760664794","pamer03"],
            ["760664826","pamer03"],
            ["760664839","pamer03"],
            ["760665432","pamer03"],
            ["760665836","pamer03"],
            ["760665870","pamer03"],
            ["760665895","pamer03"],
            ["760666109","pamer03"],
            ["760667647","pamer03"],
            ["760667659","pamer03"],
            ["760755695","pamer03"],
            ["760782061","pamer03"],
            ["760891376","pamer03"],
            ["760933213","pamer03"],
            ["760956348","pamer03"],
            ["761359385","pamer03"],
            ["761388412","pamer03"],
            ["761409130","pamer03"],
            ["761518509","pamer03"],
            ["761885193","pamer03"],
            ["761910389","pamer03"],
            ["762078529","pamer03"],
            ["762088489","pamer03"],
            ["762166792","pamer03"],
            ["762574897","pamer03"],
            ["762791005","pamer03"],
            ["762916225","pamer03"],
            ["762917321","pamer03"],
            ["763023299","pamer03"],
            ["763568073","pamer03"],
            ["763587210","pamer03"],
            ["763694621","pamer03"],
            ["763779153","pamer03"],
            ["763780710","pamer03"],
            ["763891249","pamer03"],
            ["763937843","pamer03"],
            ["763953726","pamer03"],
            ["764120868","pamer03"],
            ["764164912","pamer03"],
            ["764616688","pamer03"],
            ["764647217","pamer03"],
            ["764861091","pamer03"],
            ["764889476","pamer03"],
            ["764894316","pamer03"],
            ["764939812","pamer03"],
            ["764956251","pamer03"],
            ["764964762","pamer03"],
            ["764970746","pamer03"],
            ["765423136","pamer03"],
            ["765423849","pamer03"],
            ["766254182","pamer03"],
            ["766254841","pamer03"],
            ["766330133","pamer03"],
            ["766413159","pamer03"],
            ["766447125","pamer03"],
            ["766447339","pamer03"],
            ["766663001","pamer03"],
            ["767322451","pamer03"],
            ["767396659","pamer03"],
            ["767595312","pamer03"],
            ["768136503","pamer03"],
            ["768404417","pamer03"],
            ["768454129","pamer03"],
            ["768488312","pamer03"],
            ["768529129","pamer03"],
            ["768553584","pamer03"],
            ["768665792","pamer03"],
            ["768863243","pamer03"],
            ["768871987","pamer03"],
            ["769339547","pamer03"],
            ["769341931","pamer03"],
            ["769385258","pamer03"],
            ["769662639","pamer03"],
            ["769662803","pamer03"],
            ["769686705","pamer03"],
            ["771160063","pamer03"],
            ["771955649","pamer03"],
            ["773189278","pamer03"],
            ["778004375","pamer03"],
            ["778160786","pamer03"],
            ["778301084","pamer03"],
            ["779168053","pamer03"],
            ["797748534","pamer03"],
            ["960020828","pamer03"],
            ["960193284","pamer03"],
            ["960375622","pamer03"],
            ["960591660","pamer03"],
            ["960597218","pamer03"],
            ["960660484","pamer03"],
            ["960700340","pamer03"],
            ["960716610","pamer03"],
            ["960731698","pamer03"],
            ["960972806","pamer03"],
            ["960988569","pamer03"],
            ["961034483","pamer03"],
            ["961372854","pamer03"],
            ["961383265","pamer03"],
            ["961764617","pamer03"],
            ["961991985","pamer03"],
            ["962016579","pamer03"],
            ["962055080","pamer03"],
            ["962111939","pamer03"],
            ["962161072","pamer03"],
            ["962235914","pamer03"],
            ["962244843","pamer03"],
            ["962318925","pamer03"],
            ["962364393","pamer03"],
            ["962375823","pamer03"],
            ["962631331","pamer03"],
            ["962726590","pamer03"],
            ["962745448","pamer03"],
            ["962948516","pamer03"],
            ["962950253","pamer03"],
            ["962961844","pamer03"],
            ["963060339","pamer03"],
            ["963128044","pamer03"],
            ["963251380","pamer03"],
            ["963436308","pamer03"],
            ["963533297","pamer03"],
            ["963829652","pamer03"],
            ["963834140","pamer03"],
            ["963912256","pamer03"],
            ["963935918","pamer03"],
            ["963966578","pamer03"],
            ["963987862","pamer03"],
            ["964049301","pamer03"],
            ["964053903","pamer03"],
            ["964132474","pamer03"],
            ["964236202","pamer03"],
            ["964261215","pamer03"],
            ["964284022","pamer03"],
            ["964309212","pamer03"],
            ["964445696","pamer03"],
            ["964548589","pamer03"],
            ["964618834","pamer03"],
            ["964708601","pamer03"],
            ["964807585","pamer03"],
            ["965038856","pamer03"],
            ["965047269","pamer03"],
            ["965057534","pamer03"],
            ["965147328","pamer03"],
            ["965205922","pamer03"],
            ["965207347","pamer03"],
            ["965214710","pamer03"],
            ["965283630","pamer03"],
            ["965311647","pamer03"],
            ["965471815","pamer03"],
            ["965564865","pamer03"],
            ["965579054","pamer03"],
            ["965580916","pamer03"],
            ["965604772","pamer03"],
            ["965764761","pamer03"],
            ["965778603","pamer03"],
            ["965920178","pamer03"],
            ["965951517","pamer03"],
            ["966175242","pamer03"],
            ["966198792","pamer03"],
            ["966254536","pamer03"],
            ["966259941","pamer03"],
            ["966293099","pamer03"],
            ["966390327","pamer03"],
            ["966468427","pamer03"],
            ["966877147","pamer03"],
            ["966925797","pamer03"],
            ["967048567","pamer03"],
            ["967049603","pamer03"],
            ["967062046","pamer03"],
            ["967510378","pamer03"],
            ["967558578","pamer03"],
            ["967558582","pamer03"],
            ["967558654","pamer03"],
            ["967625186","pamer03"],
            ["967784998","pamer03"],
            ["967928877","pamer03"],
            ["967941470","pamer03"],
            ["967989484","pamer03"],
            ["968154162","pamer03"],
            ["968154435","pamer03"],
            ["968154474","pamer03"],
            ["968154974","pamer03"],
            ["968155185","pamer03"],
            ["968318486","pamer03"],
            ["968346879","pamer03"],
            ["968391108","pamer03"],
            ["968542617","pamer03"],
            ["968610588","pamer03"],
            ["968617020","pamer03"],
            ["968617422","pamer03"],
            ["968625930","pamer03"],
            ["968651969","pamer03"],
            ["968724129","pamer03"],
            ["968724386","pamer03"],
            ["968760277","pamer03"],
            ["968760381","pamer03"],
            ["968760637","pamer03"],
            ["968760741","pamer03"],
            ["968761547","pamer03"],
            ["968761667","pamer03"],
            ["968761768","pamer03"],
            ["968763119","pamer03"],
            ["968763398","pamer03"],
            ["968763426","pamer03"],
            ["968823485","pamer03"],
            ["968873596","pamer03"],
            ["968940559","pamer03"],
            ["969063860","pamer03"],
            ["969139971","pamer03"],
            ["969261812","pamer03"],
            ["969265503","pamer03"],
            ["969265508","pamer03"],
            ["969272897","pamer03"],
            ["969325029","pamer03"],
            ["969374875","pamer03"],
            ["969389371","pamer03"],
            ["969403257","pamer03"],
            ["969451826","pamer03"],
            ["969462871","pamer03"],
            ["969523598","pamer03"],
            ["969530530","pamer03"],
            ["969534706","pamer03"],
            ["969594643","pamer03"],
            ["969734371","pamer03"],
            ["969781048","pamer03"],
            ["969950228","pamer03"],
        ];
        // Batched single INSERT instead of 371 separate queries — this is
        // dramatically faster and avoids Railway's health check timing out
        // while initDB() is still running on startup.
        const values = [];
        const placeholders = [];
        phoneList.forEach(([phone, password], i) => {
            placeholders.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
            values.push(phone, password);
        });
        await pool.query(
            `INSERT INTO accounts (phone, password) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
            values
        );
        console.log('Accounts seeded into database.');
    }
}

async function getAccounts() {
    const { rows } = await pool.query('SELECT * FROM accounts ORDER BY phone ASC');
    return rows.map(r => ({
        phone: r.phone,
        password: r.password,
        status: r.status,
        logoutTime: r.logout_time ? Number(r.logout_time) : null,
        logoutTimeStr: r.logout_time_str,
        lastHeartbeat: r.last_heartbeat ? Number(r.last_heartbeat) : null,
        inUseSince: r.in_use_since ? Number(r.in_use_since) : null,
        tabId: r.tab_id || null,
        freedAt: r.freed_at ? Number(r.freed_at) : null,
    }));
}

// Find an IN-USE account currently held by a specific tab ID
async function getAccountByTabId(tabId) {
    const { rows } = await pool.query(
        `SELECT * FROM accounts WHERE tab_id = $1 AND status = 'IN-USE' AND logout_time IS NULL LIMIT 1`,
        [tabId]
    );
    if (rows.length === 0) return null;
    const r = rows[0];
    return {
        phone: r.phone, password: r.password, status: r.status,
        logoutTime: r.logout_time ? Number(r.logout_time) : null,
        logoutTimeStr: r.logout_time_str,
        lastHeartbeat: r.last_heartbeat ? Number(r.last_heartbeat) : null,
        inUseSince: r.in_use_since ? Number(r.in_use_since) : null,
        tabId: r.tab_id || null,
        freedAt: r.freed_at ? Number(r.freed_at) : null,
    };
}

// Single-transaction: move old account to Waiting and claim a new one atomically
async function reLoginForTab(tabId, heartbeatNow, logoutTimeStr) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        if (tabId) {
            const { rows: oldRows } = await client.query(
                `SELECT phone FROM accounts WHERE tab_id = $1 AND status = 'IN-USE' AND logout_time IS NULL LIMIT 1 FOR UPDATE SKIP LOCKED`,
                [tabId]
            );
            if (oldRows.length > 0) {
                await client.query(
                    `UPDATE accounts SET logout_time = $2, logout_time_str = $3, last_heartbeat = NULL, in_use_since = NULL, tab_id = NULL WHERE phone = $1`,
                    [oldRows[0].phone, heartbeatNow, logoutTimeStr + ' (re-login)']
                );
            }
        }
        const { rows: newRows } = await client.query(
            `SELECT phone, password FROM accounts WHERE status = 'FREE' ORDER BY freed_at ASC NULLS LAST LIMIT 1 FOR UPDATE SKIP LOCKED`
        );
        if (newRows.length === 0) { await client.query('ROLLBACK'); return null; }
        const { phone, password } = newRows[0];
        await client.query(
            `UPDATE accounts SET status = 'IN-USE', logout_time = NULL, logout_time_str = NULL, last_heartbeat = $2, in_use_since = $2, tab_id = $3, freed_at = NULL WHERE phone = $1`,
            [phone, heartbeatNow, tabId || null]
        );
        await client.query('COMMIT');
        return { phone, password };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

// ATOMIC CLAIM: picks ONE free account and marks it IN-USE in a single SQL
// statement. Orders by freed_at ASC NULLS LAST — accounts free longest go first.
async function claimFreeAccount(heartbeatNow, tabId) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`
            SELECT phone, password FROM accounts
            WHERE status = 'FREE'
            ORDER BY freed_at ASC NULLS LAST
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `);
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }
        const { phone, password } = rows[0];
        await client.query(
            `UPDATE accounts SET status = 'IN-USE', logout_time = NULL, logout_time_str = NULL, last_heartbeat = $2, in_use_since = $2, tab_id = $3, freed_at = NULL WHERE phone = $1`,
            [phone, heartbeatNow, tabId || null]
        );
        await client.query('COMMIT');
        return { phone, password };
    } catch (e) {
        await client.query('ROLLBACK');
        throw e;
    } finally {
        client.release();
    }
}

async function updateAccount(phone, fields) {
    const map = { logoutTime: 'logout_time', logoutTimeStr: 'logout_time_str', lastHeartbeat: 'last_heartbeat', status: 'status', inUseSince: 'in_use_since', tabId: 'tab_id', freedAt: 'freed_at' };
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
    getAccountByTabId,
    claimFreeAccount,
    reLoginForTab,
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
    LOW_ACCOUNT_LOCK_START_HOUR,
    LOW_ACCOUNT_LOCK_START_MINUTE,
    REMOVE_PASSWORD,
    HEARTBEAT_TIMEOUT_MS,
    TIMEZONE,
};
