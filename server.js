const express = require('express');
const {
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
    getWithdrawPool,
    removeWithdrawNumber,
    pickWithdrawNumber,
    requestAvailableNumber,
    recycleWithdrawnToAvailable,
    addAccountEverywhere,
    TWENTY_FOUR_HOURS_MS,
    FREE_ACCOUNT_LOCK_THRESHOLD,
    LOW_ACCOUNT_LOCK_HOUR,
    LOW_ACCOUNT_LOCK_MINUTE,
    REMOVE_PASSWORD,
    HEARTBEAT_TIMEOUT_MS,
    IN_USE_TIMEOUT_MS,
} = require('./accounts');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    if (req.method === "OPTIONS") return res.sendStatus(200);
    next();
});

// PWA support: manifest, service worker, and icons served directly from
// this file (no separate static files needed, avoids upload issues).
const ICON_192_B64 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlApw1AAAA/1BMVEXezFXX3dpUYlgiLh9nXCCmr6muyc7JpiFCOBNpk5uIdyK3mB+9wnxwg3tWfYA9ZF8+Rh2utXzAxr4DEwoHKBYBDAYLOCLhphAJMh39/f2EsMH81zQMQSdONCyXcg2CrsDQmg+34uiErrvbohB0YRGJaRJ6pLLzyCpwm6cuS0K4ig8lRjlkjZOPmJItNxSMsbYwVUtQdXZxVxbtvSGw2+NORxJJamd+rsaYw9CmtpWn0ttZQyOWo5ulew7ptRxag4cAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADdi/JbAAAAQHRSTlP/////////////////////////////////////////////////////////////////////////////////////73leyQAACVVJREFUeNrt3Qlz2jgUB3AfCSTNpt2t9BSgxLgm3EeBBDZJSfj+32rlA2yDLVuWfM32zexMmxL2//OTZNkhY6UdX2pjf6+tZl3S4i7MWyiyMNE1bXGtMkIqsen32sx971aWkgNAYBfStYXKCbA0jDJGz0hAjLIR2j49QF3MaPdapNUqUIASCkCPbEMEYE8Qe+CQFvGKjZQroAS8SAFQV4g58MllyREglIIw+Z4EuMeM/CS2JAgQSkXQmABVQzhL/liCdAECTY0HNAiKXzlJYhUCQIAbcYDr41tly1+YAF1HA/aM/CRlCQlQ2oJFFOAaxQJI+hIRoPSC60vAafwI5Y8Q4HwFR4AqKb+QgAOA1DPAKnYAESIoyAOAYBIGzOXlFxAgHsF9EBA/gAiprEANAGIHECEyBPkAJj5gj2I6QEixAsQlWJwAMyy3AQUB9CMgtgGFAzK0QMmlAReE/FqgBPcQEgFFjCHnfEwBmvQpnF3ACdBsgH8OkJm/kDGE6IZCyWENLQ5Ap7HSXtcZsKOAWcwQIsJVwCTQVSXrFOhWAYBQQ8k2BbpelQ2AvXKP+EdQ16+yAZqicQO64SobwD+Hu2kFRQB0hYjml9sCXgDhBnS7qQWt/AEIK7yrKAeggA4gpOD8OvAH8Afwfwe0ygS06g6oyYksBMCyAa0yATXZzEkAkPoBOK4HAu9b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";
const ICON_512_B64 = "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";

app.get('/manifest.json', (req, res) => {
    res.json({
        name: "Login Pool Manager",
        short_name: "Login Pool",
        description: "Account pool dashboard",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#04060a",
        theme_color: "#04060a",
        icons: [
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
            { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
            { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
        ]
    });
});

app.get('/sw.js', (req, res) => {
    res.type('application/javascript').send(`
self.addEventListener('install', () => { self.skipWaiting(); });
self.addEventListener('activate', (event) => { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', (event) => { event.respondWith(fetch(event.request)); });
`);
});

app.get('/icons/icon-192.png', (req, res) => {
    res.type('image/png').send(Buffer.from(ICON_192_B64, 'base64'));
});

app.get('/icons/icon-512.png', (req, res) => {
    res.type('image/png').send(Buffer.from(ICON_512_B64, 'base64'));
});

let poolLocked = false;
let poolLockedReason = '';
// Manual override toggled from the dashboard's Lock/Unlock button. When
// true, the pool is forced locked regardless of the automatic time/count
// checks below. Unlocking just clears the override - if the automatic
// conditions (time lock or low-account lock) still apply, the pool stays
// locked for that reason instead.
let manualLock = false;
// Tracks specifically whether the LOW-ACCOUNT lock is the active reason
// right now (as opposed to the time lock). This matters because tabs 50+
// are allowed to bypass the time lock, but NEVER the low-account lock -
// see getTabNumber() and its use in /request-login below.
let lowAccountLockActive = false;

// Extracts the numeric part of a tabId like "TAB-050" -> 50. Any tab
// that doesn't parse to a valid number is treated as below the bypass
// threshold (blocked), as the safe default.
function getTabNumber(tabId) {
    if (!tabId) return 0;
    const match = String(tabId).match(/(\d+)/);
    if (!match) return 0;
    return parseInt(match[1], 10);
}
const TIME_LOCK_BYPASS_TAB_THRESHOLD = 50; // tabs >= this number bypass the 18:00-07:30 time lock only

function pad(n) { return String(n).padStart(2, '0'); }

// Auto-free accounts after 24h
setInterval(async () => {
    const accounts = await getAccounts();
    const now = Date.now();
    for (const acc of accounts) {
        if (acc.status === 'IN-USE' && acc.logoutTime && (now - acc.logoutTime >= TWENTY_FOUR_HOURS_MS)) {
            await updateAccount(acc.phone, { status: 'FREE', logoutTime: null, logoutTimeStr: null, lastHeartbeat: null, inUseSince: null, tabId: null, freedAt: Date.now() });
        }
    }
}, 60 * 1000);

const HEARTBEAT_SILENCE_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours since LAST heartbeat -> move to Waiting

// Two timeout checks run together every 60 seconds:
// 1. 5-hour in-use timeout - account has been IN-USE for 5h straight
// 2. 10-hour heartbeat silence - no heartbeat received for 10h straight
// Either condition moves the account to Waiting 24h.
setInterval(async () => {
    const accounts = await getAccounts();
    const now = Date.now();
    for (const acc of accounts) {
        if (acc.status === 'IN-USE' && !acc.logoutTime) {
            const { hour, minute } = getZambiaTime();
            const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;

            // Check: 3-hour heartbeat silence timeout
            // Fires if the last known heartbeat (which starts out equal to
            // in_use_since at login, and only gets a later value once a
            // real /heartbeat ping comes in) is 3+ hours old. Using >=
            // here is what makes accounts that NEVER send a single
            // heartbeat after login still get caught - previously this
            // used a strict >, which meant lastHeartbeat === inUseSince
            // (the normal case for a tab that never pings) could never
            // satisfy the condition, leaving those accounts stuck in
            // IN-USE forever regardless of how many hours passed.
            if (acc.lastHeartbeat && acc.lastHeartbeat >= acc.inUseSince && now - acc.lastHeartbeat > HEARTBEAT_SILENCE_TIMEOUT_MS) {
                console.log(`Account ${acc.phone} last heartbeat was 3h+ ago. Moving to waiting.`);
                await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (3h no heartbeat)', inUseSince: null, tabId: null });
                continue;
            }
        }
    }
}, 60 * 1000);

// Two independent lock conditions - both can lock the pool:
// 1. TIME LOCK: 18:00 to 07:30 - pool always locked during these hours
// 2. LOW ACCOUNT LOCK: only from 16:00 onwards - if free < 50, lock
//    Before 14:30, free account count doesn't matter.
function getZambiaTime() {
    const zambiaStr = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' });
    const timePart = zambiaStr.split(', ')[1];
    const [h, m] = timePart.split(':').map(Number);
    return { hour: h, minute: m };
}

let cutoffApplied = false; // resets each time the pool unlocks

// Shared lock-evaluation logic. Runs on the 10s interval below, and is
// also called immediately by the manual /admin/lock-pool and
// /admin/unlock-pool endpoints so the dashboard reflects the change right
// away instead of waiting up to 10s for the next tick.
async function evaluateLock() {
    const { hour, minute } = getZambiaTime();
    const accounts = await getAccounts();
    const freeCount = accounts.filter(a => a.status === 'FREE').length;

    // Time lock: 18:00 to 07:30
    const isTimeLocked = hour >= 18 || hour < 7 || (hour === 7 && minute < 30);

    // Low account lock: only from 16:00 onwards
    const afterLowLockTime = hour > LOW_ACCOUNT_LOCK_HOUR || (hour === LOW_ACCOUNT_LOCK_HOUR && minute >= LOW_ACCOUNT_LOCK_MINUTE);
    const isLowAccounts = afterLowLockTime && freeCount < FREE_ACCOUNT_LOCK_THRESHOLD;
    lowAccountLockActive = isLowAccounts; // updated every tick, used by /request-login

    if (manualLock || isTimeLocked || isLowAccounts) {
        const wasLocked = poolLocked;
        poolLocked = true;
        // Manual lock takes priority in the displayed reason whenever it's
        // active, even if a time/count lock would also apply.
        poolLockedReason = manualLock
            ? 'Manually locked by admin.'
            : (isTimeLocked
                ? 'Locked at 18:00. Unlocks at 07:30.'
                : `Free accounts dropped to ${freeCount}. Locked from 16:00.`);
        if (!wasLocked) console.log(poolLockedReason);

        // Past-19:00 cutoff check runs every tick (not just on the lock
        // transition), so it self-heals even if the server restarted
        // mid-lock-window and missed the original transition entirely -
        // that's what was silently skipping this the last few nights.
        // "Past 19:00" = at least 1 hour into the time-locked window.
        // This cutoff sweep is specifically about the 18:00-07:30 time
        // lock, so it only runs when isTimeLocked is the actual cause -
        // not for a manual lock or a low-account lock.
        const minutesSinceLockStart = hour >= 18 ? (hour - 18) * 60 + minute : (hour + 6) * 60 + minute; // handles wrap past midnight
        const pastCutoff = isTimeLocked && minutesSinceLockStart >= 60;

        if (pastCutoff && !cutoffApplied) {
            cutoffApplied = true;
            try {
                // Tabs 50+ bypass the time lock entirely, so they're also
                // exempt from this cutoff sweep - otherwise they'd get
                // logged out an hour later anyway, defeating the bypass.
                const inUseAccounts = accounts.filter(a => a.status === 'IN-USE' && !a.logoutTime && getTabNumber(a.tabId) < TIME_LOCK_BYPASS_TAB_THRESHOLD);
                const timeStr = String(hour).padStart(2,'0') + ':' + String(minute).padStart(2,'0');
                for (const acc of inUseAccounts) {
                    await updateAccount(acc.phone, {
                        logoutTime: Date.now(),
                        logoutTimeStr: timeStr + ' (19:00 auto)',
                        inUseSince: null,
                        tabId: null
                    });
                    console.log(`[LOCK 19:00] Moved ${acc.phone} to Waiting.`);
                }
                if (inUseAccounts.length > 0) {
                    console.log(`[LOCK 19:00] Cutoff applied - moved ${inUseAccounts.length} account(s) to Waiting.`);
                }
            } catch (e) { console.error('19:00 auto-move error:', e); }
        }
    } else {
        if (poolLocked) {
            poolLocked = false;
            poolLockedReason = '';
            console.log('Pool unlocked.');
        }
        cutoffApplied = false; // ready for tonight's lock cycle
    }
}

setInterval(evaluateLock, 10 * 1000);

// Manually force the pool locked, regardless of time-of-day or free-account
// count. Stays locked until /admin/unlock-pool is called.
app.post('/admin/lock-pool', async (req, res) => {
    manualLock = true;
    await evaluateLock();
    res.json({ success: true, locked: poolLocked, manualLock, reason: poolLockedReason });
});

// Clear the manual override. If a real auto-lock condition (time lock or
// low-account lock) is still active, the pool will remain locked for that
// reason - this only removes the manual part.
app.post('/admin/unlock-pool', async (req, res) => {
    manualLock = false;
    await evaluateLock();
    res.json({ success: true, locked: poolLocked, manualLock, reason: poolLockedReason });
});

// NOTE: auto-recycle (Withdrawn -> Available whenever Available hit 0) and
// the stale-PICKED safety net have both been removed. Numbers now go
// AVAILABLE -> WITHDRAWN immediately when picked (no PICKED waiting step),
// and Withdrawn only moves back to Available when someone manually taps
// the Reset button - see /recycle-withdrawn below.

app.get('/stats', async (req, res) => {
    const accounts = await getAccounts();
    const badPasswordAccounts = await getBadPasswordAccounts();
    const withdrawPool = await getWithdrawPool();
    res.json({
        free: accounts.filter(a => a.status === 'FREE').length,
        inUse: accounts.filter(a => a.status === 'IN-USE' && !a.logoutTime).length,
        waiting: accounts.filter(a => a.status === 'IN-USE' && a.logoutTime).length,
        badPassword: badPasswordAccounts.length,
        available: withdrawPool.filter(w => w.status === 'AVAILABLE').length,
        picked: withdrawPool.filter(w => w.status === 'PICKED').length,
        withdrawn: withdrawPool.filter(w => w.status === 'WITHDRAWN').length,
        locked: poolLocked,
        reason: poolLockedReason,
        manualLock
    });
});

app.get('/inuse-stats', async (req, res) => {
    const accounts = await getAccounts();
    const list = accounts
        .filter(a => a.status === 'IN-USE' && !a.logoutTime)
        .sort((a, b) => {
            const aNum = a.tabId ? parseInt(a.tabId.replace('TAB-', '')) : 9999;
            const bNum = b.tabId ? parseInt(b.tabId.replace('TAB-', '')) : 9999;
            return aNum - bNum;
        })
        .map(a => ({ phone: a.phone, lastHeartbeat: a.lastHeartbeat, tabId: a.tabId }));
    res.json(list);
});

app.post('/heartbeat', async (req, res) => {
    const { phone } = req.body;
    const accounts = await getAccounts();
    const account = accounts.find(a => a.phone === phone);
    if (account && account.status === 'IN-USE') {
        await updateAccount(phone, { lastHeartbeat: Date.now() });
        return res.json({ success: true });
    }
    res.json({ success: false, error: 'Account not found or not in use.' });
});

function waitingPage(rows) {
    const rowsHtml = rows.length
        ? rows.map((r, i) => `
            <div class="row" data-phone="${r.phone}">
                <div class="row-num">${i + 1}.</div>
                <div class="row-info">
                    <div class="row-phone">${r.phone}</div>
                    <div class="row-countdown" id="cd-${i}">calculating...</div>
                    ${r.logoutTimeStr ? `<div class="row-note">${r.logoutTimeStr}</div>` : ''}
                </div>
            </div>`).join('')
        : `<div class="empty">No accounts</div>`;
    const freeAtData = JSON.stringify(rows.map((r, i) => ({ id: i, freeAt: r.freeAt })));
    return `<!DOCTYPE html>
<html>
<head>
    <title>Waiting 24h</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:sans-serif;background:#04060a;min-height:100vh;padding:20px}
        .page{background:#0d1117;border-radius:16px;width:100%;max-width:520px;margin:0 auto;overflow:hidden}
        .page-header{padding:16px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:12px}
        .back-btn{background:#161b22;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:8px;font-size:12px;text-decoration:none;white-space:nowrap}
        .page-title{font-size:15px;font-weight:500;color:#e6edf3}
        .page-subtitle{font-size:11px;color:#4b5563;margin-top:2px}
        .search-wrap{padding:14px 20px;border-bottom:1px solid #21262d}
        .search-input{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}
        .search-input::placeholder{color:#4b5563}
        .row{display:flex;align-items:center;padding:12px 20px;border-bottom:1px solid #161b22;gap:10px}
        .row:last-child{border-bottom:none}
        .row-num{font-size:12px;color:#4b5563;width:26px;flex-shrink:0}
        .row-info{flex:1;min-width:0}
        .row-phone{font-size:14px;color:#e6edf3;font-weight:500}
        .row-countdown{font-size:11px;color:#fbbf24;margin-top:3px}
        .row-note{font-size:10px;color:#4b5563;margin-top:2px}
        .empty{padding:40px;text-align:center;color:#4b5563;font-size:13px}
        .hidden{display:none}
    </style>
</head>
<body>
<div class="page">
    <div class="page-header">
        <a href="/" class="back-btn">&#8592; Back</a>
        <div>
            <div class="page-title">Waiting 24h</div>
            <div class="page-subtitle">${rows.length} full accounts</div>
        </div>
    </div>
    <div class="search-wrap">
        <input class="search-input" id="search" placeholder="&#128269; Search phone number..." oninput="filterRows(this.value)">
    </div>
    <div id="list">${rowsHtml}</div>
</div>
<script>
    function pad(n){return String(n).padStart(2,'0')}
    const data=${freeAtData};
    function updateCountdowns(){
        const now=Date.now();
        data.forEach(item=>{
            const el=document.getElementById('cd-'+item.id);
            if(!el) return;
            const diff=item.freeAt-now;
            if(diff<=0){el.textContent='Ready to free';el.style.color='#3fb950';}
            else{
                const h=Math.floor(diff/3600000);
                const m=Math.floor((diff%3600000)/60000);
                const s=Math.floor((diff%60000)/1000);
                el.textContent='Free in: '+h+'h '+pad(m)+'m '+pad(s)+'s';
            }
        });
    }
    function filterRows(q){
        document.querySelectorAll('.row').forEach(row=>{
            const phone=row.getAttribute('data-phone')||'';
            row.classList.toggle('hidden',q!==''&&!phone.includes(q));
        });
    }
    setInterval(updateCountdowns,1);updateCountdowns();
</script>
</body>
</html>`;
}

function listPage(title, subtitle, rows, type) {
    const showRemove = (type === 'free' || type === 'bad' || type === 'available' || type === 'withdrawn');
    const rowsHtml = rows.length
        ? rows.map((r, i) => `
            <div class="row" data-phone="${r.phone}">
                <div class="row-num">${i + 1}.</div>
                <div class="row-info">
                    <div class="row-phone">${r.display || r.phone}</div>
                    ${r.password ? `<div class="row-pass">${r.password}</div>` : ''}
                    ${r.reportedAt ? `<div class="row-time">&#9888; Reported at ${r.reportedAt}</div>` : ''}
                </div>
                ${type === 'available' ? `<button class="pick-btn" onclick="pickNumber('${r.phone}')">Pick</button>` : ''}
                ${showRemove ? `<button class="rm-btn" onclick="removeAccount('${r.phone}')">Remove</button>` : ''}
            </div>`).join('')
        : `<div class="empty">No accounts</div>`;
    return `<!DOCTYPE html>
<html>
<head>
    <title>${title}</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:sans-serif;background:#04060a;min-height:100vh;padding:20px}
        .page{background:#0d1117;border-radius:16px;width:100%;max-width:520px;margin:0 auto;overflow:hidden}
        .page-header{padding:16px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:12px}
        .back-btn{background:#161b22;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:8px;font-size:12px;text-decoration:none;white-space:nowrap}
        .page-title{font-size:15px;font-weight:500;color:#e6edf3}
        .page-subtitle{font-size:11px;color:#4b5563;margin-top:2px}
        .search-wrap{padding:14px 20px;border-bottom:1px solid #21262d}
        .search-input{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}
        .search-input::placeholder{color:#4b5563}
        .row{display:flex;align-items:center;padding:12px 20px;border-bottom:1px solid #161b22;gap:10px}
        .row:last-child{border-bottom:none}
        .row-num{font-size:12px;color:#4b5563;width:26px;flex-shrink:0}
        .row-info{flex:1;min-width:0}
        .row-phone{font-size:14px;color:#e6edf3;font-weight:500}
        .row-pass{font-size:11px;color:#4b5563;margin-top:2px}
        .row-time{font-size:11px;color:#f87171;margin-top:2px}
        .rm-btn{background:#2d0a0a;border:1px solid #7f1d1d;color:#f87171;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0}
        .pick-btn{background:#0a1a2d;border:1px solid #1d4e7f;color:#71b4f8;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer;flex-shrink:0;margin-right:6px}
        .empty{padding:40px;text-align:center;color:#4b5563;font-size:13px}
        .hidden{display:none}
        .pin-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;z-index:100;padding:20px}
        .pin-box{background:#0d1117;border:1.5px solid #21262d;border-radius:16px;padding:28px 24px;width:100%;max-width:320px;text-align:center}
        .pin-title{font-size:15px;font-weight:500;color:#e6edf3;margin-bottom:6px}
        .pin-sub{font-size:12px;color:#4b5563;margin-bottom:20px}
        .pin-input{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:12px;border-radius:8px;font-size:16px;outline:none;text-align:center;letter-spacing:4px;margin-bottom:14px}
        .pin-row{display:flex;gap:10px}
        .pin-cancel{flex:1;background:#161b22;border:1px solid #30363d;color:#8b949e;padding:10px;border-radius:8px;font-size:13px;cursor:pointer}
        .pin-confirm{flex:1;background:#7f1d1d;border:none;color:#f87171;padding:10px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer}
        .pin-err{color:#f87171;font-size:12px;margin-top:10px;display:none}
        .reset-wrap{padding:14px 20px;border-bottom:1px solid #21262d}
        .reset-btn{width:100%;background:#0a1a2d;border:1px solid #1d4e7f;color:#71b4f8;padding:10px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer}
    </style>
</head>
<body>
<div class="page">
    <div class="page-header">
        <a href="/" class="back-btn">&#8592; Back</a>
        <div><div class="page-title">${title}</div><div class="page-subtitle">${subtitle}</div></div>
    </div>
    <div class="search-wrap">
        <input class="search-input" id="search" placeholder="&#128269; Search phone number..." oninput="filterRows(this.value)">
    </div>
    ${type === 'withdrawn' ? `<div class="reset-wrap"><button class="reset-btn" onclick="resetWithdrawn()">&#8635; Reset all to Available</button></div>` : ''}
    <div id="list">${rowsHtml}</div>
</div>
<div class="pin-overlay" id="pin-modal" style="display:none;">
    <div class="pin-box">
        <div class="pin-title">&#128274; Confirm removal</div>
        <div class="pin-sub">Enter password to remove this account</div>
        <input class="pin-input" id="pin-input" type="password" maxlength="10" placeholder="....">
        <div class="pin-row">
            <button class="pin-cancel" onclick="closePin()">Cancel</button>
            <button class="pin-confirm" onclick="confirmRemove()">Remove</button>
        </div>
        <div class="pin-err" id="pin-err">Incorrect password</div>
    </div>
</div>
<script>
    let pendingPhone=null;
    const listType='${type}';
    function removeAccount(phone){pendingPhone=phone;document.getElementById('pin-input').value='';document.getElementById('pin-err').style.display='none';document.getElementById('pin-modal').style.display='flex';setTimeout(()=>document.getElementById('pin-input').focus(),100);}
    function closePin(){pendingPhone=null;document.getElementById('pin-modal').style.display='none';}
    function resetWithdrawn(){
        if(!confirm('Move ALL withdrawn numbers back to Available?')) return;
        fetch('/recycle-withdrawn',{method:'POST',headers:{'Content-Type':'application/json'}})
        .then(r=>r.json()).then(d=>{
            if(d.success){alert(d.recycled+' number(s) moved back to Available.');window.location.href='/view/available';}
            else{alert(d.error||'Could not reset.');}
        });
    }
    function pickNumber(phone){
        fetch('/pick-number',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone})})
        .then(r=>r.json()).then(d=>{
            if(d.success){const row=document.querySelector('[data-phone="'+phone+'"]');if(row)row.remove();}
            else{alert(d.error||'Could not pick number');}
        });
    }
    function confirmRemove(){
        const pin=document.getElementById('pin-input').value.trim();
        if(pin!=='1234'){document.getElementById('pin-err').style.display='block';document.getElementById('pin-input').value='';return;}
        const endpoint=listType==='bad'?'/remove-bad-password':(listType==='available'||listType==='withdrawn')?'/remove-withdraw-number':'/remove-account';
        fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:pendingPhone,pin})})
        .then(r=>r.json()).then(d=>{
            if(d.success){closePin();const row=document.querySelector('[data-phone="'+pendingPhone+'"]');if(row)row.remove();}
            else{document.getElementById('pin-err').textContent=d.error||'Error';document.getElementById('pin-err').style.display='block';}
        });
    }
    document.getElementById('pin-input').addEventListener('keydown',e=>{if(e.key==='Enter')confirmRemove();if(e.key==='Escape')closePin();});
    function filterRows(q){document.querySelectorAll('.row').forEach(row=>{const phone=row.getAttribute('data-phone')||'';row.classList.toggle('hidden',q!==''&&!phone.includes(q));});}
</script>
</body>
</html>`;
}

app.get('/', async (req, res) => {
    const accounts = await getAccounts();
    const freeAccounts = accounts.filter(a => a.status === 'FREE');
    const inUseAccounts = accounts.filter(a => a.status === 'IN-USE' && !a.logoutTime);
    const waitingAccounts = accounts.filter(a => a.status === 'IN-USE' && a.logoutTime);
    const badPasswordAccounts = await getBadPasswordAccounts();
    const withdrawPool = await getWithdrawPool();
    const availableAccounts = withdrawPool.filter(w => w.status === 'AVAILABLE');
    const withdrawnAccounts = withdrawPool.filter(w => w.status === 'WITHDRAWN');
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Login Pool Manager</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <link rel="manifest" href="/manifest.json">
    <meta name="theme-color" content="#04060a">
    <link rel="icon" href="/icons/icon-192.png">
    <link rel="apple-touch-icon" href="/icons/icon-192.png">
    <meta name="apple-mobile-web-app-capable" content="yes">
    <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
    <script>
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('/sw.js').catch(() => {});
            });
        }
    </script>
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:sans-serif;background:#04060a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
        .db{background:#080b10;border-radius:20px;padding:30px;width:100%;max-width:760px}
        .top-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}
        .db-title{font-size:20px;font-weight:500;color:#fff}
        .live-pill{background:#0d4429;color:#3fb950;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:500;display:flex;align-items:center;gap:6px}
        .locked-pill{background:#4b1111;color:#f87171;padding:6px 14px;border-radius:20px;font-size:11px;font-weight:500;display:flex;align-items:center;gap:6px}
        .live-dot{width:7px;height:7px;background:#3fb950;border-radius:50%;animation:blink 1.2s infinite}
        .lock-dot{width:7px;height:7px;background:#f87171;border-radius:50%;animation:blink 0.8s infinite}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.15}}
        .four-boxes{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
        .box{border-radius:16px;padding:20px 16px 16px;display:flex;flex-direction:column;min-width:0}
        .box-free{background:#0a1a0f;border:1.5px solid #1a4a27}
        .box-inuse{background:#080f1f;border:1.5px solid #1a2f55}
        .box-waiting{background:#120c22;border:1.5px solid #2e1f55}
        .box-bad{background:#1a0f0a;border:1.5px solid #4a1f0a}
        .box-available{background:#0a1a1a;border:1.5px solid #1a4a4a}
        .box-withdrawn{background:#14141a;border:1.5px solid #35354a}
        .box-label{font-size:10px;font-weight:500;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px}
        .free-col{color:#3fb950}.inuse-col{color:#58a6ff}.waiting-col{color:#c4b5fd}.bad-col{color:#fb923c}.available-col{color:#2dd4bf}.withdrawn-col{color:#a5b4fc}
        .box-num{font-size:56px;font-weight:500;line-height:1;letter-spacing:-3px;margin-bottom:8px}
        .num-free{color:#3fb950}.num-inuse{color:#58a6ff}.num-waiting{color:#c4b5fd}.num-bad{color:#fb923c}.num-available{color:#2dd4bf}.num-withdrawn{color:#a5b4fc}
        .box-desc{font-size:11px;margin-bottom:16px;flex:1;line-height:1.4}
        .desc-free{color:#2a6e3a}.desc-inuse{color:#1e4a7a}.desc-waiting{color:#4a3080}.desc-bad{color:#7a3a10}.desc-available{color:#206e6e}.desc-withdrawn{color:#3a3a55}
        .unlock-timer{font-size:15px;font-weight:500;color:#fff;margin-bottom:3px}
        .unlock-sub{font-size:10px;color:#4b1111;margin-bottom:12px}
        .view-btn{width:100%;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border:none;background:#92400e;color:#fed7aa;text-decoration:none}
        .view-count{background:#fed7aa;color:#92400e;border-radius:20px;padding:1px 8px;font-size:11px;font-weight:700}
        .divider{height:1px;background:#1a1f2a;margin-bottom:20px}
        .add-box{background:#0d1117;border:1.5px solid #21262d;border-radius:14px;padding:20px 24px;margin-bottom:20px}
        .add-title{font-size:13px;font-weight:500;color:#8b949e;margin-bottom:14px;letter-spacing:0.5px;text-transform:uppercase}
        .add-row{display:flex;gap:10px;flex-wrap:wrap}
        .add-input{flex:1;min-width:120px;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}
        .add-input::placeholder{color:#4b5563}
        .add-btn{background:#1a3a6e;border:none;color:#a8d0ff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}
        .reset-btn{width:100%;background:#130a0a;border:1.5px solid #3d1515;color:#f85149;padding:13px;border-radius:12px;font-size:13px;font-weight:500;cursor:pointer}
        .footer{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
        .tick{font-size:11px;color:#3fb950;font-family:monospace;opacity:0.7}
        .hint{font-size:10px;color:#252b35}
        .msg{font-size:12px;margin-top:10px;padding:8px 12px;border-radius:6px;display:none}
        .msg-ok{background:#0d4429;color:#3fb950}.msg-err{background:#4b1111;color:#f87171}
        @media(max-width:600px){.four-boxes{grid-template-columns:1fr 1fr}.box-num{font-size:44px}}
        .db{display:none}
        .lock-overlay{position:fixed;inset:0;background:#04060a;display:flex;align-items:center;justify-content:center;z-index:200;padding:20px}
        .lock-box{background:#0d1117;border:1.5px solid #21262d;border-radius:16px;padding:32px 26px;width:100%;max-width:320px;text-align:center}
        .lock-title{font-size:16px;font-weight:500;color:#e6edf3;margin-bottom:6px}
        .lock-sub{font-size:12px;color:#4b5563;margin-bottom:20px}
        .lock-input{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:12px;border-radius:8px;font-size:16px;outline:none;text-align:center;letter-spacing:3px;margin-bottom:14px}
        .lock-btn{width:100%;background:#1a3a6e;border:none;color:#a8d0ff;padding:12px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer}
        .lock-err{color:#f87171;font-size:12px;margin-top:12px;display:none}
    </style>
</head>
<body>
<div class="lock-overlay" id="lock-overlay">
    <div class="lock-box">
        <div class="lock-title">&#128274; Login Pool Manager</div>
        <div class="lock-sub">Enter password to continue</div>
        <input class="lock-input" id="lock-input" type="password" maxlength="30" placeholder="Password" autocomplete="off">
        <button class="lock-btn" onclick="tryUnlock()">Unlock</button>
        <div class="lock-err" id="lock-err">Incorrect password</div>
    </div>
</div>
<div class="db">
    <div class="top-bar">
        <div class="db-title">&#128274; Login pool manager</div>
        <div id="pill" class="${poolLocked?'locked-pill':'live-pill'}">
            <div class="${poolLocked?'lock-dot':'live-dot'}"></div>
            ${poolLocked?'Locked':'Live'}
        </div>
    </div>
    <div class="four-boxes">
        <div class="box box-free" id="free-box">
            <div class="box-label free-col" id="free-label">&#10003; Free</div>
            <div class="box-num num-free" id="num-free">${freeAccounts.length}</div>
            <div class="box-desc desc-free" id="free-desc">Accounts ready</div>
            <div id="unlock-block" style="display:none;">
                <div class="unlock-timer" id="unlock-countdown">--:--:--</div>
                <div class="unlock-sub">Unlocks at 07:30</div>
            </div>
            <a href="/view/free" class="view-btn">View <span class="view-count" id="cnt-free">${freeAccounts.length}</span></a>
            <button id="manual-lock-btn" class="view-btn" style="margin-top:8px;border:none;cursor:pointer;background:${manualLock?'#8a2222':'#a5651c'};" onclick="toggleManualLock()">${manualLock?'Unlock':'Lock'}</button>
        </div>
        <div class="box box-inuse">
            <div class="box-label inuse-col">&#9654; In use</div>
            <div class="box-num num-inuse" id="num-inuse">${inUseAccounts.length}</div>
            <div class="box-desc desc-inuse">Not yet logged out</div>
            <a href="/view/inuse" class="view-btn">View <span class="view-count" id="cnt-inuse">${inUseAccounts.length}</span></a>
        </div>
        <div class="box box-waiting">
            <div class="box-label waiting-col">&#9203; Waiting 24h</div>
            <div class="box-num num-waiting" id="num-waiting">${waitingAccounts.length}</div>
            <div class="box-desc desc-waiting">Full account</div>
            <a href="/view/waiting" class="view-btn">View <span class="view-count" id="cnt-waiting">${waitingAccounts.length}</span></a>
        </div>
        <div class="box box-bad">
            <div class="box-label bad-col">&#10060; Bad password</div>
            <div class="box-num num-bad" id="num-bad">${badPasswordAccounts.length}</div>
            <div class="box-desc desc-bad">Login failed</div>
            <a href="/view/bad" class="view-btn">View <span class="view-count" id="cnt-bad">${badPasswordAccounts.length}</span></a>
        </div>
        <div class="box box-available">
            <div class="box-label available-col">&#128230; Available</div>
            <div class="box-num num-available" id="num-available">${availableAccounts.length}</div>
            <div class="box-desc desc-available" id="available-desc">Ready to be withdrawn</div>
            <a href="/view/available" class="view-btn">View <span class="view-count" id="cnt-available">${availableAccounts.length}</span></a>
        </div>
        <div class="box box-withdrawn">
            <div class="box-label withdrawn-col">&#128229; Withdrawn</div>
            <div class="box-num num-withdrawn" id="num-withdrawn">${withdrawnAccounts.length}</div>
            <div class="box-desc desc-withdrawn">Already picked up</div>
            <a href="/view/withdrawn" class="view-btn">View <span class="view-count" id="cnt-withdrawn">${withdrawnAccounts.length}</span></a>
        </div>
    </div>
    <div class="add-box">
        <div class="add-title">&#43; Add account (adds to both Free and Available)</div>
        <div class="add-row">
            <input class="add-input" id="inp-phone" placeholder="Phone number" type="text">
            <input class="add-input" id="inp-pass" placeholder="Password" type="text">
            <button class="add-btn" onclick="addAccount()">Add</button>
        </div>
        <div class="msg" id="add-msg"></div>
    </div>
    <div class="footer">
        <span class="tick" id="tick">--:--:--</span>
        <span class="hint">Live data - Postgres</span>
    </div>
</div>
<script>
    var APP_LOCK_PASSWORD='Robzkay';
    function unlockApp(){
        document.getElementById('lock-overlay').style.display='none';
        document.querySelector('.db').style.display='block';
    }
    function tryUnlock(){
        var val=document.getElementById('lock-input').value;
        if(val===APP_LOCK_PASSWORD){
            try{localStorage.setItem('lpm_app_unlocked','yes');}catch(e){}
            unlockApp();
        } else {
            document.getElementById('lock-err').style.display='block';
            document.getElementById('lock-input').value='';
        }
    }
    (function(){
        var already=false;
        try{already=localStorage.getItem('lpm_app_unlocked')==='yes';}catch(e){}
        if(already){unlockApp();}
        else{
            var li=document.getElementById('lock-input');
            li.addEventListener('keydown',function(e){if(e.key==='Enter')tryUnlock();});
            setTimeout(function(){li.focus();},100);
        }
    })();
    function pad(n){return String(n).padStart(2,'0')}
    function update(){
        const now=new Date();
        document.getElementById('tick').textContent=pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
        const cd=document.getElementById('unlock-countdown');
        if(cd&&document.getElementById('unlock-block').style.display!=='none'){
            const unlock=new Date();unlock.setHours(7,30,0,0);
            if(unlock<=now)unlock.setDate(unlock.getDate()+1);
            const diff=unlock-now;
            cd.textContent=Math.floor(diff/3600000)+'h '+pad(Math.floor((diff%3600000)/60000))+'m '+pad(Math.floor((diff%60000)/1000))+'s';
        }
    }
    function refreshStats(){
        fetch('/stats').then(r=>r.json()).then(d=>{
            document.getElementById('num-free').textContent=d.free;
            document.getElementById('num-inuse').textContent=d.inUse;
            document.getElementById('num-waiting').textContent=d.waiting;
            document.getElementById('num-bad').textContent=d.badPassword;
            document.getElementById('num-available').textContent=d.available;
            document.getElementById('num-withdrawn').textContent=d.withdrawn;
            document.getElementById('cnt-free').textContent=d.free;
            document.getElementById('cnt-inuse').textContent=d.inUse;
            document.getElementById('cnt-waiting').textContent=d.waiting;
            document.getElementById('cnt-bad').textContent=d.badPassword;
            document.getElementById('cnt-available').textContent=d.available;
            document.getElementById('cnt-withdrawn').textContent=d.withdrawn;
            const pill=document.getElementById('pill');
            pill.className=d.locked?'locked-pill':'live-pill';
            pill.innerHTML=d.locked?'<div class="lock-dot"></div> Locked':'<div class="live-dot"></div> Live';
            const freeBox=document.getElementById('free-box');
            const freeLabel=document.getElementById('free-label');
            const freeNum=document.getElementById('num-free');
            const freeDesc=document.getElementById('free-desc');
            const unlockBlock=document.getElementById('unlock-block');
            if(d.locked){
                freeBox.style.cssText='background:#0a1a0f;border:1.5px solid #1a4a27;border-radius:16px;padding:20px 16px 16px;display:flex;flex-direction:column;min-width:0;';
                freeLabel.style.color='#3fb950';freeLabel.innerHTML='&#128274; Free - Locked';
                freeNum.style.color='#3fb950';freeDesc.style.color='#2a6e3a';freeDesc.textContent=d.reason;
                unlockBlock.style.display='block';
            } else {
                freeBox.style.cssText='background:#0a1a0f;border:1.5px solid #1a4a27;border-radius:16px;padding:20px 16px 16px;display:flex;flex-direction:column;min-width:0;';
                freeLabel.style.color='#3fb950';freeLabel.innerHTML='&#10003; Free';
                freeNum.style.color='#3fb950';freeDesc.style.color='#2a6e3a';freeDesc.textContent='Accounts ready';
                unlockBlock.style.display='none';
            }
            const lockBtn=document.getElementById('manual-lock-btn');
            if(lockBtn){
                lockBtn.textContent=d.manualLock?'Unlock':'Lock';
                lockBtn.style.background=d.manualLock?'#8a2222':'#a5651c';
            }
        }).catch(()=>{});
    }
    function toggleManualLock(){
        const btn=document.getElementById('manual-lock-btn');
        const isCurrentlyManualLocked=btn.textContent.trim()==='Unlock';
        const url=isCurrentlyManualLocked?'/admin/unlock-pool':'/admin/lock-pool';
        btn.disabled=true;
        fetch(url,{method:'POST'}).then(r=>r.json()).then(()=>{
            btn.disabled=false;
            refreshStats();
        }).catch(()=>{btn.disabled=false;});
    }
    function showMsg(id,text,ok){const el=document.getElementById(id);el.textContent=text;el.className='msg '+(ok?'msg-ok':'msg-err');el.style.display='block';setTimeout(()=>el.style.display='none',3000);}
    function addAccount(){
        const phone=document.getElementById('inp-phone').value.trim();
        const password=document.getElementById('inp-pass').value.trim();
        if(!phone||!password){showMsg('add-msg','Phone and password required',false);return;}
        fetch('/add-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})})
        .then(r=>r.json()).then(d=>{
            if(d.success){showMsg('add-msg','Account '+phone+' added!',true);document.getElementById('inp-phone').value='';document.getElementById('inp-pass').value='';refreshStats();}
            else{showMsg('add-msg',d.error,false);}
        });
    }
    setInterval(update,1);setInterval(refreshStats,1000);update();refreshStats();
</script>
</body>
</html>`);
});

app.get('/view/free', async (req, res) => {
    const accounts = await getAccounts();
    const list = accounts
        .filter(a => a.status === 'FREE')
        .sort((a, b) => {
            // Accounts with a logout_time were previously used - sort those
            // by most recently freed first. Never-used accounts (no logout_time)
            // go to the bottom.
            if (a.logoutTime && b.logoutTime) return b.logoutTime - a.logoutTime;
            if (a.logoutTime) return -1;
            if (b.logoutTime) return 1;
            return 0;
        });
    res.send(listPage('Free Accounts', list.length + ' accounts ready', list, 'free'));
});

app.get('/view/available', async (req, res) => {
    const withdrawPool = await getWithdrawPool();
    const list = withdrawPool.filter(w => w.status === 'AVAILABLE').sort((a, b) => a.phone.localeCompare(b.phone));
    res.send(listPage('Available Numbers', list.length + ' numbers ready to withdraw', list, 'available'));
});

app.get('/view/withdrawn', async (req, res) => {
    const withdrawPool = await getWithdrawPool();
    const list = withdrawPool.filter(w => w.status === 'WITHDRAWN').sort((a, b) => a.phone.localeCompare(b.phone));
    res.send(listPage('Withdrawn Numbers', list.length + ' numbers already withdrawn', list, 'withdrawn'));
});

app.get('/view/inuse', async (req, res) => {
    const accounts = await getAccounts();
    const list = accounts
        .filter(a => a.status === 'IN-USE' && !a.logoutTime)
        .sort((a, b) => {
            // Sort by tab ID number e.g. TAB-001 < TAB-002
            const aNum = a.tabId ? parseInt(a.tabId.replace('TAB-', '')) : 9999;
            const bNum = b.tabId ? parseInt(b.tabId.replace('TAB-', '')) : 9999;
            return aNum - bNum;
        });
    const rowsHtml = list.length
        ? list.map((r, i) => `
            <div class="row" data-phone="${r.phone}">
                <div class="row-num">${i + 1}.</div>
                <div class="row-info">
                    <div class="row-phone">${r.phone}</div>
                    <div class="row-hb" id="hb-${i}">&#9679; checking...</div>
                </div>
            </div>`).join('')
        : `<div class="empty">No accounts</div>`;
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>In Use</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:sans-serif;background:#04060a;min-height:100vh;padding:20px}
        .page{background:#0d1117;border-radius:16px;width:100%;max-width:520px;margin:0 auto;overflow:hidden}
        .page-header{padding:16px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:12px}
        .back-btn{background:#161b22;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:8px;font-size:12px;text-decoration:none;white-space:nowrap}
        .page-title{font-size:15px;font-weight:500;color:#e6edf3}
        .page-subtitle{font-size:11px;color:#4b5563;margin-top:2px}
        .search-wrap{padding:14px 20px;border-bottom:1px solid #21262d}
        .search-input{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}
        .search-input::placeholder{color:#4b5563}
        .row{display:flex;align-items:center;padding:12px 20px;border-bottom:1px solid #161b22;gap:10px}
        .row:last-child{border-bottom:none}
        .row-num{font-size:12px;color:#4b5563;width:26px;flex-shrink:0}
        .row-info{flex:1;min-width:0}
        .row-phone{font-size:14px;color:#e6edf3;font-weight:500}
        .row-hb{font-size:11px;margin-top:3px}
        .hb-alive{color:#3fb950}.hb-warning{color:#fbbf24}.hb-dead{color:#f87171}
        .empty{padding:40px;text-align:center;color:#4b5563;font-size:13px}
        .hidden{display:none}
    </style>
</head>
<body>
<div class="page">
    <div class="page-header">
        <a href="/" class="back-btn">&#8592; Back</a>
        <div><div class="page-title">In Use</div><div class="page-subtitle">${list.length} not yet logged out</div></div>
    </div>
    <div class="search-wrap">
        <input class="search-input" id="search" placeholder="&#128269; Search phone number..." oninput="filterRows(this.value)">
    </div>
    <div id="list">${rowsHtml}</div>
</div>
<script>
    function updateHeartbeats(){
        fetch('/inuse-stats').then(r=>r.json()).then(data=>{
            data.forEach((acc,i)=>{
                const el=document.getElementById('hb-'+i);
                if(!el) return;
                if(!acc.lastHeartbeat){el.className='row-hb hb-warning';el.textContent='[!] Waiting for first heartbeat...'+(acc.tabId?' - '+acc.tabId:'');return;}
                const elapsed=Date.now()-acc.lastHeartbeat;
                const s=Math.floor(elapsed/1000);
                var tab=acc.tabId?' - '+acc.tabId:'';
                if(elapsed<5000){el.className='row-hb hb-alive';el.textContent='[OK] Heartbeat OK'+tab;}
                else if(elapsed<60000){el.className='row-hb hb-warning';el.textContent='[..] '+s+' seconds no heartbeat'+tab;}
                else if(elapsed<3600000){var mins=Math.floor(elapsed/60000);el.className='row-hb hb-warning';el.textContent='[..] '+mins+(mins===1?' minute':' minutes')+' no heartbeat'+tab;}
                else{var hrs=Math.floor(elapsed/3600000);var remMins=Math.floor((elapsed%3600000)/60000);var hrStr=hrs+(hrs===1?' hour':' hours');var minStr=remMins>0?' '+remMins+(remMins===1?' minute':' minutes'):'';el.className='row-hb hb-dead';el.textContent='[X] '+hrStr+minStr+' no heartbeat'+tab;}
            });
        }).catch(()=>{});
    }
    function filterRows(q){document.querySelectorAll('.row').forEach(row=>{const phone=row.getAttribute('data-phone')||'';row.classList.toggle('hidden',q!==''&&!phone.includes(q));});}
    setInterval(updateHeartbeats,1000);updateHeartbeats();
</script>
</body>
</html>`);
});

app.get('/view/waiting', async (req, res) => {
    const accounts = await getAccounts();
    const list = accounts.filter(a => a.status === 'IN-USE' && a.logoutTime)
        .map(a => ({ phone: a.phone, freeAt: a.logoutTime + TWENTY_FOUR_HOURS_MS, logoutTimeStr: a.logoutTimeStr }))
        .sort((a, b) => a.freeAt - b.freeAt); // soonest free first
    res.send(waitingPage(list));
});

app.get('/view/bad', async (req, res) => {
    const badPasswordAccounts = await getBadPasswordAccounts();
    res.send(listPage('Bad Password', badPasswordAccounts.length + ' accounts with wrong password', badPasswordAccounts, 'bad'));
});

app.post('/wrong-password', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.json({ success: false, error: 'Phone required.' });
    const now = new Date();
    const timeStr = pad(now.getHours()) + ':' + pad(now.getMinutes());
    const accounts = await getAccounts();
    const acc = accounts.find(a => a.phone === phone) || { phone, password: 'unknown' };
    await removeAccount(phone);
    await addBadPasswordAccount(acc.phone, acc.password, timeStr);
    res.json({ success: true });
});

app.post('/add-account', async (req, res) => {
    const { phone, password } = req.body;
    if (!phone || !password) return res.json({ success: false, error: 'Phone and password required.' });
    const accounts = await getAccounts();
    if (accounts.find(a => a.phone === phone)) return res.json({ success: false, error: 'Account already exists.' });
    // Adds to both the login pool (Free) and the withdraw pool (Available)
    // in one transaction - this is the only way accounts get added now.
    await addAccountEverywhere(phone, password);
    res.json({ success: true });
});

app.post('/remove-withdraw-number', async (req, res) => {
    const { phone, pin } = req.body;
    if (pin !== REMOVE_PASSWORD) return res.json({ success: false, error: 'Incorrect password.' });
    await removeWithdrawNumber(phone);
    res.json({ success: true });
});

app.post('/pick-number', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.json({ success: false, error: 'Phone required.' });
    const picked = await pickWithdrawNumber(phone);
    if (picked) return res.json({ success: true });
    return res.json({ success: false, error: 'Number not available (already picked or withdrawn).' });
});

// Works like /request-login but for the withdraw pool: no phone needed,
// just hands back the oldest AVAILABLE number and marks it WITHDRAWN
// immediately. Only touches withdraw_pool - Free/In-Use/Waiting are untouched.
app.post('/request-available', async (req, res) => {
    try {
        const result = await requestAvailableNumber();
        if (result) {
            return res.json({ success: true, phone: result.phone, password: result.password });
        }
        return res.json({ success: false, error: 'No available numbers.' });
    } catch (e) {
        console.error('request-available error:', e);
        return res.json({ success: false, error: 'Server error, please retry.' });
    }
});

// Manual reset: moves every currently-WITHDRAWN number back to AVAILABLE.
// This replaces the old automatic "recycle when Available hits 0" behavior
// - now it only happens when someone taps the Reset button.
app.post('/recycle-withdrawn', async (req, res) => {
    try {
        const result = await recycleWithdrawnToAvailable();
        return res.json({ success: true, recycled: result.recycled });
    } catch (e) {
        console.error('recycle-withdrawn error:', e);
        return res.json({ success: false, error: 'Server error, please retry.' });
    }
});

app.post('/remove-account', async (req, res) => {
    const { phone, pin } = req.body;
    if (pin !== REMOVE_PASSWORD) return res.json({ success: false, error: 'Incorrect password.' });
    await removeAccount(phone);
    res.json({ success: true });
});

app.post('/remove-bad-password', async (req, res) => {
    const { phone, pin } = req.body;
    if (pin !== REMOVE_PASSWORD) return res.json({ success: false, error: 'Incorrect password.' });
    await removeBadPasswordAccount(phone);
    res.json({ success: true });
});

app.post('/request-login', async (req, res) => {
    const { tabId } = req.body;
    const tabNumber = getTabNumber(tabId);
    const bypassesTimeLock = tabNumber >= TIME_LOCK_BYPASS_TAB_THRESHOLD;

    // Low-account lock ALWAYS blocks, no exceptions, regardless of tab number.
    // Time lock blocks tabs 1-49, but tabs 50+ are allowed straight through.
    const shouldBlock = lowAccountLockActive || (poolLocked && !bypassesTimeLock);

    if (shouldBlock) {
        // If this tab currently holds an account, move it to Waiting 24h
        if (tabId) {
            try {
                const accounts = await getAccounts();
                const heldAccount = accounts.find(a => a.tabId === tabId && a.status === 'IN-USE' && !a.logoutTime);
                if (heldAccount) {
                    const { hour, minute } = getZambiaTime();
                    const timeStr = String(hour).padStart(2,'0') + ':' + String(minute).padStart(2,'0');
                    await updateAccount(heldAccount.phone, {
                        logoutTime: Date.now(),
                        logoutTimeStr: timeStr + ' (pool locked)',
                        inUseSince: null,
                        tabId: null
                    });
                    console.log(`[LOCK] ${tabId} tried to request during lock - moved ${heldAccount.phone} to Waiting.`);
                }
            } catch(e) { console.error('lock-move error:', e); }
        }
        return res.json({ success: false, error: `Pool locked. ${poolLockedReason}` });
    }
    // Reject any request that doesn't include a tab ID - every tab must
    // identify itself so the server can track account ownership correctly.
    if (!tabId) return res.json({ success: false, error: 'Tab ID required. No account will be assigned without one.' });
    try {
        const { hour, minute } = getZambiaTime();
        const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
        // Single transaction: moves old account to Waiting (if any) and
        // claims a new one in one round-trip - no delay between steps.
        const claimed = await reLoginForTab(tabId, Date.now(), timeStr);
        if (claimed) {
            return res.json({ success: true, phone: claimed.phone, password: claimed.password });
        }
        return res.json({ success: false, error: 'No free accounts available' });
    } catch (e) {
        console.error('request-login error:', e);
        return res.json({ success: false, error: 'Server error, please retry.' });
    }
});

app.post('/login', async (req, res) => {
    const { phone } = req.body;
    const accounts = await getAccounts();
    const account = accounts.find(a => a.phone === phone);
    if (account && account.status === 'FREE') {
        await updateAccount(phone, { status: 'IN-USE', logoutTime: null, logoutTimeStr: null, lastHeartbeat: Date.now() });
        return res.json({ success: true, message: `Account ${phone} marked as logged in.` });
    }
    return res.json({ success: false, error: 'Account not available or already in use.' });
});

app.post('/logout', async (req, res) => {
    const { phone, logoutTime } = req.body;
    const accounts = await getAccounts();
    const account = accounts.find(a => a.phone === phone);
    if (account) {
        await updateAccount(phone, { logoutTime: Date.now(), logoutTimeStr: logoutTime, lastHeartbeat: null, inUseSince: null, tabId: null });
        return res.json({ success: true, message: `Account ${phone} logged out. Will free after 24h.` });
    }
    return res.json({ success: false, error: 'Account not found.' });
});

app.post('/aviator-lock', async (req, res) => {
    const { phone } = req.body;
    const accounts = await getAccounts();
    const account = accounts.find(a => a.phone === phone);
    if (account) {
        await updateAccount(phone, { status: 'LOCKED' });
        return res.json({ success: true });
    }
    return res.json({ success: false, error: 'Account not found.' });
});

// TEMPORARY one-time route: inserts a specific batch of 114 new phone
// numbers directly into `accounts` as FREE. Uses ON CONFLICT DO NOTHING
// so it's safe to visit more than once - it will never create duplicates
// or overwrite existing accounts. Remove this route after running it once.
app.get('/one-time-add-new-numbers', async (req, res) => {
    try {
        const newNumbers = [
["574219787", "R54321Z"],
            ["760008520", "R54321Z"],
            ["760027536", "R54321Z"],
            ["760195399", "R54321Z"],
            ["760245012", "R54321Z"],
            ["760246915", "R54321Z"],
            ["760657534", "R54321Z"],
            ["760657665", "R54321Z"],
            ["760657864", "R54321Z"],
            ["760657882", "R54321Z"],
            ["760658096", "R54321Z"],
            ["760658232", "R54321Z"],
            ["760659264", "R54321Z"],
            ["760660103", "R54321Z"],
            ["760660319", "R54321Z"],
            ["760661909", "R54321Z"],
            ["760662113", "R54321Z"],
            ["760662878", "R54321Z"],
            ["760664504", "R54321Z"],
            ["760665318", "R54321Z"],
            ["760667567", "R54321Z"],
            ["760824285", "R54321Z"],
            ["761495266", "R54321Z"],
            ["761891537", "R54321Z"],
            ["761892875", "R54321Z"],
            ["762149235", "R54321Z"],
            ["762187147", "R54321Z"],
            ["762252702", "R54321Z"],
            ["762482887", "R54321Z"],
            ["762483087", "R54321Z"],
            ["762483403", "R54321Z"],
            ["762483434", "R54321Z"],
            ["762483790", "R54321Z"],
            ["762483922", "R54321Z"],
            ["762483933", "R54321Z"],
            ["762484123", "R54321Z"],
            ["762484147", "R54321Z"],
            ["762484538", "R54321Z"],
            ["762578180", "R54321Z"],
            ["762637230", "R54321Z"],
            ["762650539", "R54321Z"],
            ["763147163", "R54321Z"],
            ["763169826", "R54321Z"],
            ["763172233", "R54321Z"],
            ["763185490", "R54321Z"],
            ["763191154", "R54321Z"],
            ["763202144", "R54321Z"],
            ["763233600", "R54321Z"],
            ["764106436", "R54321Z"],
            ["764170261", "R54321Z"],
            ["764351842", "R54321Z"],
            ["764405668", "R54321Z"],
            ["764603400", "R54321Z"],
            ["764873246", "R54321Z"],
            ["764880311", "R54321Z"],
            ["764963394", "R54321Z"],
            ["764985130", "R54321Z"],
            ["765541540", "R54321Z"],
            ["765750770", "R54321Z"],
            ["766319933", "R54321Z"],
            ["766843832", "R54321Z"],
            ["766962275", "R54321Z"],
            ["768286318", "R54321Z"],
            ["768355864", "R54321Z"],
            ["768855872", "R54321Z"],
            ["768983308", "R54321Z"],
            ["769094311", "R54321Z"],
            ["769666711", "R54321Z"],
            ["769716107", "R54321Z"],
            ["769754565", "R54321Z"],
            ["960711859", "R54321Z"],
            ["960774585", "R54321Z"],
            ["962066690", "R54321Z"],
            ["962068151", "R54321Z"],
            ["962386121", "R54321Z"],
            ["962584596", "R54321Z"],
            ["962878301", "R54321Z"],
            ["963121772", "R54321Z"],
            ["963157570", "R54321Z"],
            ["964218931", "R54321Z"],
            ["964305408", "R54321Z"],
            ["964834027", "R54321Z"],
            ["965014985", "R54321Z"],
            ["965061302", "R54321Z"],
            ["965205279", "R54321Z"],
            ["965207230", "R54321Z"],
            ["965258783", "R54321Z"],
            ["965470597", "R54321Z"],
            ["965563794", "R54321Z"],
            ["965614985", "R54321Z"],
            ["965647326", "R54321Z"],
            ["965650610", "R54321Z"],
            ["965652119", "R54321Z"],
            ["965694417", "R54321Z"],
            ["965913990", "R54321Z"],
            ["966311946", "R54321Z"],
            ["966313238", "R54321Z"],
            ["966315549", "R54321Z"],
            ["967013455", "R54321Z"],
            ["967112315", "R54321Z"],
            ["967169155", "R54321Z"],
            ["967554507", "R54321Z"],
            ["967926956", "R54321Z"],
            ["968047294", "R54321Z"],
            ["968210232", "R54321Z"],
            ["968527450", "R54321Z"],
            ["968659928", "R54321Z"],
            ["968902910", "R54321Z"],
            ["969024404", "R54321Z"],
            ["969150808", "R54321Z"],
            ["969596631", "R54321Z"],
            ["969597132", "R54321Z"],
            ["969597196", "R54321Z"],
            ["969609705", "R54321Z"],
        ];
        const values = [];
        const placeholders = [];
        newNumbers.forEach(([phone, password], i) => {
            placeholders.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
            values.push(phone, password);
        });
        const result = await pool.query(
            `INSERT INTO accounts (phone, password) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
            values
        );
        res.send(`Done. Inserted ${result.rowCount} new numbers (out of ${newNumbers.length} in the batch - the rest were already present).`);
    } catch (e) {
        res.status(500).send('Error: ' + e.message);
    }
});

// TEMPORARY one-time route: syncs the login pool so it contains ONLY
// this exact list of 326 numbers.
// Rules:
//   - ANY account in `accounts` NOT in this list -> removed, no exceptions
//     (FREE, BAD_PASSWORD, AVAILABLE, WITHDRAWN, WAITING 24H, and even
//     accounts currently IN-USE / actively logged in are all included)
//   - ANY number in `withdraw_pool` NOT in this list -> removed, no
//     exceptions (AVAILABLE, PICKED, WITHDRAWN all included)
//   - Any number in this list NOT already in `accounts` -> added to
//     `accounts` as FREE (never added to withdraw_pool)
//   - Safe to visit more than once (idempotent)
//
// WARNING: this will delete accounts that are currently logged in
// (IN-USE) or waiting out their 24h cooldown, and withdraw_pool entries
// that are currently PICKED, if their number is not on the list below.
// Anyone actively using one of those will be logged out / lose access.
// Make sure that's really what you want before running this.
//
// Remove this route after running it once.
app.get('/one-time-sync-pool', async (req, res) => {
    try {
        const keepNumbers = [
            "573015909",
            "573088843",
            "573104642",
            "573135488",
            "573164297",
            "573197599",
            "573251483",
            "573271807",
            "573279568",
            "573384775",
            "573507265",
            "574036452",
            "574040623",
            "574048581",
            "574076004",
            "574084945",
            "574084951",
            "574084958",
            "574111341",
            "574111345",
            "574125189",
            "574125193",
            "574126252",
            "574128995",
            "574138365",
            "574138371",
            "574138373",
            "574138374",
            "574138376",
            "574138377",
            "574145023",
            "574153025",
            "574153026",
            "574153027",
            "574153031",
            "574153032",
            "574153033",
            "574153093",
            "574153094",
            "574153924",
            "574153991",
            "574195197",
            "574195202",
            "574195203",
            "574195996",
            "574203225",
            "574203227",
            "574219728",
            "574219767",
            "574219769",
            "574219771",
            "574219774",
            "574219777",
            "574219787",
            "574219788",
            "574219794",
            "574219908",
            "574219916",
            "574219917",
            "574219985",
            "574238034",
            "574238038",
            "574238040",
            "574238118",
            "574238215",
            "574238235",
            "574238236",
            "574252030",
            "574522613",
            "574543169",
            "574555649",
            "574555680",
            "574555706",
            "574555717",
            "574559302",
            "574576605",
            "574576734",
            "574601393",
            "574604172",
            "574604173",
            "574604175",
            "574604322",
            "574604324",
            "574604327",
            "574604329",
            "574607021",
            "574623403",
            "574623447",
            "574623467",
            "574623472",
            "574638143",
            "574638147",
            "574641470",
            "574641473",
            "574641535",
            "574641536",
            "574641543",
            "574641548",
            "574691471",
            "574694316",
            "574939790",
            "574939915",
            "574939931",
            "574939958",
            "574940262",
            "574940273",
            "574960430",
            "574960432",
            "574960438",
            "574976516",
            "574976553",
            "574976632",
            "574987388",
            "574987392",
            "574987395",
            "574987396",
            "574987407",
            "574987429",
            "574987438",
            "574987469",
            "574987540",
            "574987708",
            "750054275",
            "750105475",
            "760008520",
            "760017807",
            "760019171",
            "760019369",
            "760027462",
            "760027536",
            "760037274",
            "760074987",
            "760246915",
            "760457548",
            "760656809",
            "760657394",
            "760657486",
            "760657534",
            "760657665",
            "760657864",
            "760658096",
            "760659173",
            "760659264",
            "760659860",
            "760660103",
            "760660319",
            "760660487",
            "760661909",
            "760662113",
            "760662239",
            "760663884",
            "760664504",
            "760665318",
            "760665924",
            "760667148",
            "760667192",
            "760667567",
            "760786373",
            "760957176",
            "760961571",
            "761891537",
            "761893088",
            "762007347",
            "762074840",
            "762129809",
            "762150764",
            "762151365",
            "762161544",
            "762169222",
            "762171584",
            "762178046",
            "762184757",
            "762187147",
            "762192284",
            "762211968",
            "762326391",
            "762482882",
            "762482887",
            "762483087",
            "762483133",
            "762483160",
            "762483161",
            "762483226",
            "762483403",
            "762483440",
            "762483842",
            "762483878",
            "762483922",
            "762484123",
            "762484147",
            "762484350",
            "762484481",
            "762484506",
            "762484535",
            "762484538",
            "762484544",
            "762484670",
            "762650539",
            "762684006",
            "763131867",
            "763147163",
            "763150851",
            "763169829",
            "763176282",
            "763185490",
            "763207608",
            "763224109",
            "763525617",
            "763779085",
            "764112407",
            "764170261",
            "764315103",
            "764358907",
            "764374600",
            "764405668",
            "764603400",
            "764612871",
            "764616802",
            "764643223",
            "764748154",
            "764764653",
            "764798266",
            "764834244",
            "764873246",
            "764880311",
            "764884784",
            "764961915",
            "764985130",
            "765801758",
            "765884396",
            "766253523",
            "766253993",
            "766254071",
            "766254374",
            "766254407",
            "766254520",
            "766254552",
            "766254682",
            "766254865",
            "766254916",
            "766254928",
            "766319933",
            "766843595",
            "766843832",
            "766962275",
            "767713636",
            "768267124",
            "768983308",
            "769017761",
            "769094311",
            "769338905",
            "769649561",
            "769666711",
            "769754565",
            "770942244",
            "771954658",
            "771956953",
            "771994157",
            "777263261",
            "778228223",
            "778237631",
            "778301604",
            "778390158",
            "779171327",
            "779171390",
            "779171438",
            "953583621",
            "953583623",
            "953659386",
            "955216051",
            "960674231",
            "960774585",
            "960981870",
            "961153918",
            "961250238",
            "961698321",
            "962066690",
            "962068151",
            "962372176",
            "962386121",
            "962871032",
            "963160727",
            "963193039",
            "963717220",
            "963801205",
            "964305408",
            "964597345",
            "964689702",
            "964819491",
            "964918640",
            "965061302",
            "965185421",
            "965207230",
            "965563794",
            "965650610",
            "965652119",
            "965699297",
            "965913990",
            "966081954",
            "966259852",
            "966315549",
            "966318836",
            "966506432",
            "967013455",
            "967112315",
            "967169155",
            "967244897",
            "967450294",
            "967839947",
            "967913840",
            "967926956",
            "968154969",
            "968210232",
            "968436080",
            "968437139",
            "968527450",
            "968607946",
            "969024404",
            "969179357",
            "969193788",
            "969385082",
            "969481098",
            "969544410",
            "969597132",
            "969643782",
            "969757291"
        ];
        const keepSet = new Set(keepNumbers);

        // --- accounts table ---
        const { rows: allAccounts } = await pool.query(
            'SELECT phone FROM accounts'
        );
        const existingPhones = new Set(allAccounts.map(a => a.phone));

        const toRemove = allAccounts
            .map(a => a.phone)
            .filter(phone => !keepSet.has(phone));

        const toAdd = keepNumbers.filter(p => !existingPhones.has(p));

        let removedCount = 0;
        if (toRemove.length > 0) {
            const result = await pool.query(
                `DELETE FROM accounts WHERE phone = ANY($1)`,
                [toRemove]
            );
            removedCount = result.rowCount;
        }

        let addedCount = 0;
        if (toAdd.length > 0) {
            const values = [];
            const placeholders = [];
            toAdd.forEach((phone, i) => {
                placeholders.push(`($${i + 1}, 'R54321Z')`);
                values.push(phone);
            });
            const result = await pool.query(
                `INSERT INTO accounts (phone, password) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING`,
                values
            );
            addedCount = result.rowCount;
        }

        // --- withdraw_pool table (Available + Withdrawn + Picked) ---
        const { rows: allWithdraw } = await pool.query(
            'SELECT phone FROM withdraw_pool'
        );
        const withdrawToRemove = allWithdraw
            .map(a => a.phone)
            .filter(phone => !keepSet.has(phone));

        let withdrawRemovedCount = 0;
        if (withdrawToRemove.length > 0) {
            const result = await pool.query(
                `DELETE FROM withdraw_pool WHERE phone = ANY($1)`,
                [withdrawToRemove]
            );
            withdrawRemovedCount = result.rowCount;
        }

        res.send(
            `Done. accounts: removed ${removedCount} not in list (all statuses, no exceptions), ` +
            `added ${addedCount} new numbers as FREE. ` +
            `withdraw_pool: removed ${withdrawRemovedCount} not in list (Available/Picked/Withdrawn). ` +
            `Kept list size: ${keepNumbers.length}.`
        );
    } catch (e) {
        res.status(500).send('Error: ' + e.message);
    }
});

app.post('/reset', async (req, res) => {
    await resetAllAccounts();
    poolLocked = false; poolLockedReason = '';
    res.json({ success: true });
});

// TEMPORARY one-time route: copies every phone number currently in
// `accounts` (Free/In-Use/Waiting) into `withdraw_pool` as AVAILABLE.
// Safe to run multiple times (ON CONFLICT DO NOTHING) but should be
// removed from the code after use since it has no password protection.
app.get('/one-time-populate-available', async (req, res) => {
    try {
        const accounts = await getAccounts();
        let inserted = 0;
        for (const acc of accounts) {
            const { rowCount } = await pool.query(
                `INSERT INTO withdraw_pool (phone, password, status, added_at) VALUES ($1, $2, 'AVAILABLE', $3) ON CONFLICT (phone) DO NOTHING`,
                [acc.phone, acc.password, Date.now()]
            );
            inserted += rowCount;
        }
        res.send(`Done. Inserted ${inserted} numbers into Available.`);
    } catch (e) {
        res.status(500).send('Error: ' + e.message);
    }
});

// Start server after DB is ready
initDB().then(async () => {
    // Check lock state immediately on startup
    const { hour, minute } = getZambiaTime();
    const accounts = await getAccounts();
    const freeCount = accounts.filter(a => a.status === 'FREE').length;
    const isTimeLocked = hour >= 18 || hour < 7 || (hour === 7 && minute < 30);
    const afterLowLockTime = hour > LOW_ACCOUNT_LOCK_HOUR || (hour === LOW_ACCOUNT_LOCK_HOUR && minute >= LOW_ACCOUNT_LOCK_MINUTE);
    const isLowAccounts = afterLowLockTime && freeCount < FREE_ACCOUNT_LOCK_THRESHOLD;
    lowAccountLockActive = isLowAccounts;
    if (isTimeLocked || isLowAccounts) {
        poolLocked = true;
        poolLockedReason = isTimeLocked
            ? 'Locked at 18:00. Unlocks at 07:30.'
            : `Free accounts dropped to ${freeCount}. Locked from 16:00.`;
        console.log('Startup lock:', poolLockedReason);
    }
    app.listen(PORT, () => console.log(`Pool Manager active on port ${PORT} - connected to Postgres`));
}).catch(err => {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
});
