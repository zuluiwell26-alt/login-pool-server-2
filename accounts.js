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
            ["571229027","Pamer03"],
            ["571233431","Pamer03"],
            ["573191021","Pamer03"],
            ["573218113","Pamer03"],
            ["573435628","Pamer03"],
            ["573822910","Pamer03"],
            ["573876935","Pamer03"],
            ["573912516","Pamer03"],
            ["574030959","Pamer03"],
            ["574030962","Pamer03"],
            ["574030964","Pamer03"],
            ["574030966","Pamer03"],
            ["574030975","Pamer03"],
            ["574129008","Pamer03"],
            ["574167639","Pamer03"],
            ["574167651","Pamer03"],
            ["574203310","Pamer03"],
            ["574203315","Pamer03"],
            ["574203325","Pamer03"],
            ["574203347","Pamer03"],
            ["574203374","Pamer03"],
            ["574203379","Pamer03"],
            ["574219997","Pamer03"],
            ["574238249","Pamer03"],
            ["574238252","Pamer03"],
            ["574252009","Pamer03"],
            ["574252018","Pamer03"],
            ["574252022","Pamer03"],
            ["574252023","Pamer03"],
            ["574283166","Pamer03"],
            ["574522519","Pamer03"],
            ["574555615","Pamer03"],
            ["574555616","Pamer03"],
            ["574555617","Pamer03"],
            ["574555618","Pamer03"],
            ["574555619","Pamer03"],
            ["574555620","Pamer03"],
            ["574555621","Pamer03"],
            ["574555647","Pamer03"],
            ["574555712","Pamer03"],
            ["574557521","Pamer03"],
            ["574557524","Pamer03"],
            ["574573250","Pamer03"],
            ["574573259","Pamer03"],
            ["574573335","Pamer03"],
            ["574601571","Pamer03"],
            ["574601572","Pamer03"],
            ["574601573","Pamer03"],
            ["574604364","Pamer03"],
            ["574604365","Pamer03"],
            ["574604366","Pamer03"],
            ["574604368","Pamer03"],
            ["574604369","Pamer03"],
            ["574604370","Pamer03"],
            ["574604382","Pamer03"],
            ["574604385","Pamer03"],
            ["574609954","Pamer03"],
            ["574623473","Pamer03"],
            ["574625371","Pamer03"],
            ["574638140","Pamer03"],
            ["574638161","Pamer03"],
            ["574638201","Pamer03"],
            ["574638227","Pamer03"],
            ["574641539","Pamer03"],
            ["574641540","Pamer03"],
            ["574939832","Pamer03"],
            ["574939833","Pamer03"],
            ["574939912","Pamer03"],
            ["574939916","Pamer03"],
            ["574939961","Pamer03"],
            ["574939963","Pamer03"],
            ["574960428","Pamer03"],
            ["574976586","Pamer03"],
            ["574976674","Pamer03"],
            ["574976675","Pamer03"],
            ["574976858","Pamer03"],
            ["574987425","Pamer03"],
            ["574987426","Pamer03"],
            ["574987504","Pamer03"],
            ["574987533","Pamer03"],
            ["574987761","Pamer03"],
            ["574987764","Pamer03"],
            ["574987768","Pamer03"],
            ["574987770","Pamer03"],
            ["760005186","Pamer03"],
            ["760005417","Pamer03"],
            ["760005574","Pamer03"],
            ["760006202","Pamer03"],
            ["760006384","Pamer03"],
            ["760006873","Pamer03"],
            ["760006979","Pamer03"],
            ["760006984","Pamer03"],
            ["760011793","Pamer03"],
            ["760018356","Pamer03"],
            ["760018443","Pamer03"],
            ["760018595","Pamer03"],
            ["760019189","Pamer03"],
            ["760019219","Pamer03"],
            ["760019591","Pamer03"],
            ["760019593","Pamer03"],
            ["760019654","Pamer03"],
            ["760019659","Pamer03"],
            ["760019672","Pamer03"],
            ["760019724","Pamer03"],
            ["760020756","Pamer03"],
            ["760020761","Pamer03"],
            ["760020788","Pamer03"],
            ["760020814","Pamer03"],
            ["760021086","Pamer03"],
            ["760021261","Pamer03"],
            ["760021383","Pamer03"],
            ["760027905","Pamer03"],
            ["760037246","Pamer03"],
            ["760037688","Pamer03"],
            ["760037719","Pamer03"],
            ["760037797","Pamer03"],
            ["760037866","Pamer03"],
            ["760037870","Pamer03"],
            ["760037894","Pamer03"],
            ["760090381","Pamer03"],
            ["760147665","Pamer03"],
            ["760227578","Pamer03"],
            ["760247262","Pamer03"],
            ["760583293","Pamer03"],
            ["760657413","Pamer03"],
            ["760657444","Pamer03"],
            ["760657485","Pamer03"],
            ["760659322","Pamer03"],
            ["760659465","Pamer03"],
            ["760659523","Pamer03"],
            ["760659538","Pamer03"],
            ["760659551","Pamer03"],
            ["760660688","Pamer03"],
            ["760661063","Pamer03"],
            ["760661194","Pamer03"],
            ["760661938","Pamer03"],
            ["760661967","Pamer03"],
            ["760661980","Pamer03"],
            ["760661985","Pamer03"],
            ["760662019","Pamer03"],
            ["760662341","Pamer03"],
            ["760663289","Pamer03"],
            ["760663789","Pamer03"],
            ["760663865","Pamer03"],
            ["760663943","Pamer03"],
            ["760664025","Pamer03"],
            ["760664195","Pamer03"],
            ["760664794","Pamer03"],
            ["760664826","Pamer03"],
            ["760664839","Pamer03"],
            ["760665432","Pamer03"],
            ["760665836","Pamer03"],
            ["760665870","Pamer03"],
            ["760665895","Pamer03"],
            ["760666109","Pamer03"],
            ["760667647","Pamer03"],
            ["760667659","Pamer03"],
            ["760755695","Pamer03"],
            ["760782061","Pamer03"],
            ["760891376","Pamer03"],
            ["760933213","Pamer03"],
            ["760956348","Pamer03"],
            ["761359385","Pamer03"],
            ["761388412","Pamer03"],
            ["761409130","Pamer03"],
            ["761518509","Pamer03"],
            ["761885193","Pamer03"],
            ["761910389","Pamer03"],
            ["762078529","Pamer03"],
            ["762088489","Pamer03"],
            ["762166792","Pamer03"],
            ["762574897","Pamer03"],
            ["762791005","Pamer03"],
            ["762916225","Pamer03"],
            ["762917321","Pamer03"],
            ["763023299","Pamer03"],
            ["763568073","Pamer03"],
            ["763587210","Pamer03"],
            ["763694621","Pamer03"],
            ["763779153","Pamer03"],
            ["763780710","Pamer03"],
            ["763891249","Pamer03"],
            ["763937843","Pamer03"],
            ["763953726","Pamer03"],
            ["764120868","Pamer03"],
            ["764164912","Pamer03"],
            ["764616688","Pamer03"],
            ["764647217","Pamer03"],
            ["764861091","Pamer03"],
            ["764889476","Pamer03"],
            ["764894316","Pamer03"],
            ["764939812","Pamer03"],
            ["764956251","Pamer03"],
            ["764964762","Pamer03"],
            ["764970746","Pamer03"],
            ["765423136","Pamer03"],
            ["765423849","Pamer03"],
            ["766254182","Pamer03"],
            ["766254841","Pamer03"],
            ["766330133","Pamer03"],
            ["766413159","Pamer03"],
            ["766447125","Pamer03"],
            ["766447339","Pamer03"],
            ["766663001","Pamer03"],
            ["767322451","Pamer03"],
            ["767396659","Pamer03"],
            ["767595312","Pamer03"],
            ["768136503","Pamer03"],
            ["768404417","Pamer03"],
            ["768454129","Pamer03"],
            ["768488312","Pamer03"],
            ["768529129","Pamer03"],
            ["768553584","Pamer03"],
            ["768665792","Pamer03"],
            ["768863243","Pamer03"],
            ["768871987","Pamer03"],
            ["769339547","Pamer03"],
            ["769341931","Pamer03"],
            ["769385258","Pamer03"],
            ["769662639","Pamer03"],
            ["769662803","Pamer03"],
            ["769686705","Pamer03"],
            ["771160063","Pamer03"],
            ["771955649","Pamer03"],
            ["773189278","Pamer03"],
            ["778004375","Pamer03"],
            ["778160786","Pamer03"],
            ["778301084","Pamer03"],
            ["779168053","Pamer03"],
            ["797748534","Pamer03"],
            ["960020828","Pamer03"],
            ["960193284","Pamer03"],
            ["960375622","Pamer03"],
            ["960591660","Pamer03"],
            ["960597218","Pamer03"],
            ["960660484","Pamer03"],
            ["960700340","Pamer03"],
            ["960716610","Pamer03"],
            ["960731698","Pamer03"],
            ["960972806","Pamer03"],
            ["960988569","Pamer03"],
            ["961034483","Pamer03"],
            ["961372854","Pamer03"],
            ["961383265","Pamer03"],
            ["961764617","Pamer03"],
            ["961991985","Pamer03"],
            ["962016579","Pamer03"],
            ["962055080","Pamer03"],
            ["962111939","Pamer03"],
            ["962161072","Pamer03"],
            ["962235914","Pamer03"],
            ["962244843","Pamer03"],
            ["962318925","Pamer03"],
            ["962364393","Pamer03"],
            ["962375823","Pamer03"],
            ["962631331","Pamer03"],
            ["962726590","Pamer03"],
            ["962745448","Pamer03"],
            ["962948516","Pamer03"],
            ["962950253","Pamer03"],
            ["962961844","Pamer03"],
            ["963060339","Pamer03"],
            ["963128044","Pamer03"],
            ["963251380","Pamer03"],
            ["963436308","Pamer03"],
            ["963533297","Pamer03"],
            ["963829652","Pamer03"],
            ["963834140","Pamer03"],
            ["963912256","Pamer03"],
            ["963935918","Pamer03"],
            ["963966578","Pamer03"],
            ["963987862","Pamer03"],
            ["964049301","Pamer03"],
            ["964053903","Pamer03"],
            ["964132474","Pamer03"],
            ["964236202","Pamer03"],
            ["964261215","Pamer03"],
            ["964284022","Pamer03"],
            ["964309212","Pamer03"],
            ["964445696","Pamer03"],
            ["964548589","Pamer03"],
            ["964618834","Pamer03"],
            ["964708601","Pamer03"],
            ["964807585","Pamer03"],
            ["965038856","Pamer03"],
            ["965047269","Pamer03"],
            ["965057534","Pamer03"],
            ["965147328","Pamer03"],
            ["965205922","Pamer03"],
            ["965207347","Pamer03"],
            ["965214710","Pamer03"],
            ["965283630","Pamer03"],
            ["965311647","Pamer03"],
            ["965471815","Pamer03"],
            ["965564865","Pamer03"],
            ["965579054","Pamer03"],
            ["965580916","Pamer03"],
            ["965604772","Pamer03"],
            ["965764761","Pamer03"],
            ["965778603","Pamer03"],
            ["965920178","Pamer03"],
            ["965951517","Pamer03"],
            ["966175242","Pamer03"],
            ["966198792","Pamer03"],
            ["966254536","Pamer03"],
            ["966259941","Pamer03"],
            ["966293099","Pamer03"],
            ["966390327","Pamer03"],
            ["966468427","Pamer03"],
            ["966877147","Pamer03"],
            ["966925797","Pamer03"],
            ["967048567","Pamer03"],
            ["967049603","Pamer03"],
            ["967062046","Pamer03"],
            ["967510378","Pamer03"],
            ["967558578","Pamer03"],
            ["967558582","Pamer03"],
            ["967558654","Pamer03"],
            ["967625186","Pamer03"],
            ["967784998","Pamer03"],
            ["967928877","Pamer03"],
            ["967941470","Pamer03"],
            ["967989484","Pamer03"],
            ["968154162","Pamer03"],
            ["968154435","Pamer03"],
            ["968154474","Pamer03"],
            ["968154974","Pamer03"],
            ["968155185","Pamer03"],
            ["968318486","Pamer03"],
            ["968346879","Pamer03"],
            ["968391108","Pamer03"],
            ["968542617","Pamer03"],
            ["968610588","Pamer03"],
            ["968617020","Pamer03"],
            ["968617422","Pamer03"],
            ["968625930","Pamer03"],
            ["968651969","Pamer03"],
            ["968724129","Pamer03"],
            ["968724386","Pamer03"],
            ["968760277","Pamer03"],
            ["968760381","Pamer03"],
            ["968760637","Pamer03"],
            ["968760741","Pamer03"],
            ["968761547","Pamer03"],
            ["968761667","Pamer03"],
            ["968761768","Pamer03"],
            ["968763119","Pamer03"],
            ["968763398","Pamer03"],
            ["968763426","Pamer03"],
            ["968823485","Pamer03"],
            ["968873596","Pamer03"],
            ["968940559","Pamer03"],
            ["969063860","Pamer03"],
            ["969139971","Pamer03"],
            ["969261812","Pamer03"],
            ["969265503","Pamer03"],
            ["969265508","Pamer03"],
            ["969272897","Pamer03"],
            ["969325029","Pamer03"],
            ["969374875","Pamer03"],
            ["969389371","Pamer03"],
            ["969403257","Pamer03"],
            ["969451826","Pamer03"],
            ["969462871","Pamer03"],
            ["969523598","Pamer03"],
            ["969530530","Pamer03"],
            ["969534706","Pamer03"],
            ["969594643","Pamer03"],
            ["969734371","Pamer03"],
            ["969781048","Pamer03"],
            ["969950228","Pamer03"],
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
