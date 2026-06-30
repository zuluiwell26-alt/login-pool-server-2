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
            ["571229027","12345QAZ"],
            ["571233431","12345QAZ"],
            ["573191021","12345QAZ"],
            ["573218113","12345QAZ"],
            ["573435628","12345QAZ"],
            ["573822910","12345QAZ"],
            ["573876935","12345QAZ"],
            ["573912516","12345QAZ"],
            ["574030959","12345QAZ"],
            ["574030962","12345QAZ"],
            ["574030964","12345QAZ"],
            ["574030966","12345QAZ"],
            ["574030975","12345QAZ"],
            ["574129008","12345QAZ"],
            ["574167639","12345QAZ"],
            ["574167651","12345QAZ"],
            ["574203310","12345QAZ"],
            ["574203315","12345QAZ"],
            ["574203325","12345QAZ"],
            ["574203347","12345QAZ"],
            ["574203374","12345QAZ"],
            ["574203379","12345QAZ"],
            ["574219997","12345QAZ"],
            ["574238249","12345QAZ"],
            ["574238252","12345QAZ"],
            ["574252009","12345QAZ"],
            ["574252018","12345QAZ"],
            ["574252022","12345QAZ"],
            ["574252023","12345QAZ"],
            ["574283166","12345QAZ"],
            ["574522519","12345QAZ"],
            ["574555615","12345QAZ"],
            ["574555616","12345QAZ"],
            ["574555617","12345QAZ"],
            ["574555618","12345QAZ"],
            ["574555619","12345QAZ"],
            ["574555620","12345QAZ"],
            ["574555621","12345QAZ"],
            ["574555647","12345QAZ"],
            ["574555712","12345QAZ"],
            ["574557521","12345QAZ"],
            ["574557524","12345QAZ"],
            ["574573250","12345QAZ"],
            ["574573259","12345QAZ"],
            ["574573335","12345QAZ"],
            ["574601571","12345QAZ"],
            ["574601572","12345QAZ"],
            ["574601573","12345QAZ"],
            ["574604364","12345QAZ"],
            ["574604365","12345QAZ"],
            ["574604366","12345QAZ"],
            ["574604368","12345QAZ"],
            ["574604369","12345QAZ"],
            ["574604370","12345QAZ"],
            ["574604382","12345QAZ"],
            ["574604385","12345QAZ"],
            ["574609954","12345QAZ"],
            ["574623473","12345QAZ"],
            ["574625371","12345QAZ"],
            ["574638140","12345QAZ"],
            ["574638161","12345QAZ"],
            ["574638201","12345QAZ"],
            ["574638227","12345QAZ"],
            ["574641539","12345QAZ"],
            ["574641540","12345QAZ"],
            ["574939832","12345QAZ"],
            ["574939833","12345QAZ"],
            ["574939912","12345QAZ"],
            ["574939916","12345QAZ"],
            ["574939961","12345QAZ"],
            ["574939963","12345QAZ"],
            ["574960428","12345QAZ"],
            ["574976586","12345QAZ"],
            ["574976674","12345QAZ"],
            ["574976675","12345QAZ"],
            ["574976858","12345QAZ"],
            ["574987425","12345QAZ"],
            ["574987426","12345QAZ"],
            ["574987504","12345QAZ"],
            ["574987533","12345QAZ"],
            ["574987761","12345QAZ"],
            ["574987764","12345QAZ"],
            ["574987768","12345QAZ"],
            ["574987770","12345QAZ"],
            ["760005186","12345QAZ"],
            ["760005417","12345QAZ"],
            ["760005574","12345QAZ"],
            ["760006202","12345QAZ"],
            ["760006384","12345QAZ"],
            ["760006873","12345QAZ"],
            ["760006979","12345QAZ"],
            ["760006984","12345QAZ"],
            ["760011793","12345QAZ"],
            ["760018356","12345QAZ"],
            ["760018443","12345QAZ"],
            ["760018595","12345QAZ"],
            ["760019189","12345QAZ"],
            ["760019219","12345QAZ"],
            ["760019591","12345QAZ"],
            ["760019593","12345QAZ"],
            ["760019654","12345QAZ"],
            ["760019659","12345QAZ"],
            ["760019672","12345QAZ"],
            ["760019724","12345QAZ"],
            ["760020756","12345QAZ"],
            ["760020761","12345QAZ"],
            ["760020788","12345QAZ"],
            ["760020814","12345QAZ"],
            ["760021086","12345QAZ"],
            ["760021261","12345QAZ"],
            ["760021383","12345QAZ"],
            ["760027905","12345QAZ"],
            ["760037246","12345QAZ"],
            ["760037688","12345QAZ"],
            ["760037719","12345QAZ"],
            ["760037797","12345QAZ"],
            ["760037866","12345QAZ"],
            ["760037870","12345QAZ"],
            ["760037894","12345QAZ"],
            ["760090381","12345QAZ"],
            ["760147665","12345QAZ"],
            ["760227578","12345QAZ"],
            ["760247262","12345QAZ"],
            ["760583293","12345QAZ"],
            ["760657413","12345QAZ"],
            ["760657444","12345QAZ"],
            ["760657485","12345QAZ"],
            ["760659322","12345QAZ"],
            ["760659465","12345QAZ"],
            ["760659523","12345QAZ"],
            ["760659538","12345QAZ"],
            ["760659551","12345QAZ"],
            ["760660688","12345QAZ"],
            ["760661063","12345QAZ"],
            ["760661194","12345QAZ"],
            ["760661938","12345QAZ"],
            ["760661967","12345QAZ"],
            ["760661980","12345QAZ"],
            ["760661985","12345QAZ"],
            ["760662019","12345QAZ"],
            ["760662341","12345QAZ"],
            ["760663289","12345QAZ"],
            ["760663789","12345QAZ"],
            ["760663865","12345QAZ"],
            ["760663943","12345QAZ"],
            ["760664025","12345QAZ"],
            ["760664195","12345QAZ"],
            ["760664794","12345QAZ"],
            ["760664826","12345QAZ"],
            ["760664839","12345QAZ"],
            ["760665432","12345QAZ"],
            ["760665836","12345QAZ"],
            ["760665870","12345QAZ"],
            ["760665895","12345QAZ"],
            ["760666109","12345QAZ"],
            ["760667647","12345QAZ"],
            ["760667659","12345QAZ"],
            ["760755695","12345QAZ"],
            ["760782061","12345QAZ"],
            ["760891376","12345QAZ"],
            ["760933213","12345QAZ"],
            ["760956348","12345QAZ"],
            ["761359385","12345QAZ"],
            ["761388412","12345QAZ"],
            ["761409130","12345QAZ"],
            ["761518509","12345QAZ"],
            ["761885193","12345QAZ"],
            ["761910389","12345QAZ"],
            ["762078529","12345QAZ"],
            ["762088489","12345QAZ"],
            ["762166792","12345QAZ"],
            ["762574897","12345QAZ"],
            ["762791005","12345QAZ"],
            ["762916225","12345QAZ"],
            ["762917321","12345QAZ"],
            ["763023299","12345QAZ"],
            ["763568073","12345QAZ"],
            ["763587210","12345QAZ"],
            ["763694621","12345QAZ"],
            ["763779153","12345QAZ"],
            ["763780710","12345QAZ"],
            ["763891249","12345QAZ"],
            ["763937843","12345QAZ"],
            ["763953726","12345QAZ"],
            ["764120868","12345QAZ"],
            ["764164912","12345QAZ"],
            ["764616688","12345QAZ"],
            ["764647217","12345QAZ"],
            ["764861091","12345QAZ"],
            ["764889476","12345QAZ"],
            ["764894316","12345QAZ"],
            ["764939812","12345QAZ"],
            ["764956251","12345QAZ"],
            ["764964762","12345QAZ"],
            ["764970746","12345QAZ"],
            ["765423136","12345QAZ"],
            ["765423849","12345QAZ"],
            ["766254182","12345QAZ"],
            ["766254841","12345QAZ"],
            ["766330133","12345QAZ"],
            ["766413159","12345QAZ"],
            ["766447125","12345QAZ"],
            ["766447339","12345QAZ"],
            ["766663001","12345QAZ"],
            ["767322451","12345QAZ"],
            ["767396659","12345QAZ"],
            ["767595312","12345QAZ"],
            ["768136503","12345QAZ"],
            ["768404417","12345QAZ"],
            ["768454129","12345QAZ"],
            ["768488312","12345QAZ"],
            ["768529129","12345QAZ"],
            ["768553584","12345QAZ"],
            ["768665792","12345QAZ"],
            ["768863243","12345QAZ"],
            ["768871987","12345QAZ"],
            ["769339547","12345QAZ"],
            ["769341931","12345QAZ"],
            ["769385258","12345QAZ"],
            ["769662639","12345QAZ"],
            ["769662803","12345QAZ"],
            ["769686705","12345QAZ"],
            ["771160063","12345QAZ"],
            ["771955649","12345QAZ"],
            ["773189278","12345QAZ"],
            ["778004375","12345QAZ"],
            ["778160786","12345QAZ"],
            ["778301084","12345QAZ"],
            ["779168053","12345QAZ"],
            ["797748534","12345QAZ"],
            ["960020828","12345QAZ"],
            ["960193284","12345QAZ"],
            ["960375622","12345QAZ"],
            ["960591660","12345QAZ"],
            ["960597218","12345QAZ"],
            ["960660484","12345QAZ"],
            ["960700340","12345QAZ"],
            ["960716610","12345QAZ"],
            ["960731698","12345QAZ"],
            ["960972806","12345QAZ"],
            ["960988569","12345QAZ"],
            ["961034483","12345QAZ"],
            ["961372854","12345QAZ"],
            ["961383265","12345QAZ"],
            ["961764617","12345QAZ"],
            ["961991985","12345QAZ"],
            ["962016579","12345QAZ"],
            ["962055080","12345QAZ"],
            ["962111939","12345QAZ"],
            ["962161072","12345QAZ"],
            ["962235914","12345QAZ"],
            ["962244843","12345QAZ"],
            ["962318925","12345QAZ"],
            ["962364393","12345QAZ"],
            ["962375823","12345QAZ"],
            ["962631331","12345QAZ"],
            ["962726590","12345QAZ"],
            ["962745448","12345QAZ"],
            ["962948516","12345QAZ"],
            ["962950253","12345QAZ"],
            ["962961844","12345QAZ"],
            ["963060339","12345QAZ"],
            ["963128044","12345QAZ"],
            ["963251380","12345QAZ"],
            ["963436308","12345QAZ"],
            ["963533297","12345QAZ"],
            ["963829652","12345QAZ"],
            ["963834140","12345QAZ"],
            ["963912256","12345QAZ"],
            ["963935918","12345QAZ"],
            ["963966578","12345QAZ"],
            ["963987862","12345QAZ"],
            ["964049301","12345QAZ"],
            ["964053903","12345QAZ"],
            ["964132474","12345QAZ"],
            ["964236202","12345QAZ"],
            ["964261215","12345QAZ"],
            ["964284022","12345QAZ"],
            ["964309212","12345QAZ"],
            ["964445696","12345QAZ"],
            ["964548589","12345QAZ"],
            ["964618834","12345QAZ"],
            ["964708601","12345QAZ"],
            ["964807585","12345QAZ"],
            ["965038856","12345QAZ"],
            ["965047269","12345QAZ"],
            ["965057534","12345QAZ"],
            ["965147328","12345QAZ"],
            ["965205922","12345QAZ"],
            ["965207347","12345QAZ"],
            ["965214710","12345QAZ"],
            ["965283630","12345QAZ"],
            ["965311647","12345QAZ"],
            ["965471815","12345QAZ"],
            ["965564865","12345QAZ"],
            ["965579054","12345QAZ"],
            ["965580916","12345QAZ"],
            ["965604772","12345QAZ"],
            ["965764761","12345QAZ"],
            ["965778603","12345QAZ"],
            ["965920178","12345QAZ"],
            ["965951517","12345QAZ"],
            ["966175242","12345QAZ"],
            ["966198792","12345QAZ"],
            ["966254536","12345QAZ"],
            ["966259941","12345QAZ"],
            ["966293099","12345QAZ"],
            ["966390327","12345QAZ"],
            ["966468427","12345QAZ"],
            ["966877147","12345QAZ"],
            ["966925797","12345QAZ"],
            ["967048567","12345QAZ"],
            ["967049603","12345QAZ"],
            ["967062046","12345QAZ"],
            ["967510378","12345QAZ"],
            ["967558578","12345QAZ"],
            ["967558582","12345QAZ"],
            ["967558654","12345QAZ"],
            ["967625186","12345QAZ"],
            ["967784998","12345QAZ"],
            ["967928877","12345QAZ"],
            ["967941470","12345QAZ"],
            ["967989484","12345QAZ"],
            ["968154162","12345QAZ"],
            ["968154435","12345QAZ"],
            ["968154474","12345QAZ"],
            ["968154974","12345QAZ"],
            ["968155185","12345QAZ"],
            ["968318486","12345QAZ"],
            ["968346879","12345QAZ"],
            ["968391108","12345QAZ"],
            ["968542617","12345QAZ"],
            ["968610588","12345QAZ"],
            ["968617020","12345QAZ"],
            ["968617422","12345QAZ"],
            ["968625930","12345QAZ"],
            ["968651969","12345QAZ"],
            ["968724129","12345QAZ"],
            ["968724386","12345QAZ"],
            ["968760277","12345QAZ"],
            ["968760381","12345QAZ"],
            ["968760637","12345QAZ"],
            ["968760741","12345QAZ"],
            ["968761547","12345QAZ"],
            ["968761667","12345QAZ"],
            ["968761768","12345QAZ"],
            ["968763119","12345QAZ"],
            ["968763398","12345QAZ"],
            ["968763426","12345QAZ"],
            ["968823485","12345QAZ"],
            ["968873596","12345QAZ"],
            ["968940559","12345QAZ"],
            ["969063860","12345QAZ"],
            ["969139971","12345QAZ"],
            ["969261812","12345QAZ"],
            ["969265503","12345QAZ"],
            ["969265508","12345QAZ"],
            ["969272897","12345QAZ"],
            ["969325029","12345QAZ"],
            ["969374875","12345QAZ"],
            ["969389371","12345QAZ"],
            ["969403257","12345QAZ"],
            ["969451826","12345QAZ"],
            ["969462871","12345QAZ"],
            ["969523598","12345QAZ"],
            ["969530530","12345QAZ"],
            ["969534706","12345QAZ"],
            ["969594643","12345QAZ"],
            ["969734371","12345QAZ"],
            ["969781048","12345QAZ"],
            ["969950228","12345QAZ"],
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
    // ORDER BY phone keeps the row order stable across every call, so any
    // status displayed alongside it (e.g. heartbeat) always lines up with
    // the correct phone number instead of jumping between rows on refresh.
    const { rows } = await pool.query('SELECT * FROM accounts ORDER BY phone ASC');
    return rows.map(r => ({
        phone: r.phone,
        password: r.password,
        status: r.status,
        logoutTime: r.logout_time ? Number(r.logout_time) : null,
        logoutTimeStr: r.logout_time_str,
        lastHeartbeat: r.last_heartbeat ? Number(r.last_heartbeat) : null,
    }));
}

// ATOMIC CLAIM: picks ONE free account and marks it IN-USE in a single SQL
// statement, so concurrent requests (many tabs hitting /request-login at
// once) can never grab the same account or silently overwrite each other's
// update. FOR UPDATE SKIP LOCKED ensures each concurrent transaction gets a
// DIFFERENT row.
async function claimFreeAccount(heartbeatNow) {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const { rows } = await client.query(`
            SELECT phone, password FROM accounts
            WHERE status = 'FREE'
            ORDER BY phone
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `);
        if (rows.length === 0) {
            await client.query('ROLLBACK');
            return null;
        }
        const { phone, password } = rows[0];
        await client.query(
            `UPDATE accounts SET status = 'IN-USE', logout_time = NULL, logout_time_str = NULL, last_heartbeat = $2 WHERE phone = $1`,
            [phone, heartbeatNow]
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
    claimFreeAccount,
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
