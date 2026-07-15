const express = require('express');
const {
    pool, initDB, getAccounts, getAccountByTabId,
    claimFreeAccount, reLoginForTab, updateAccount,
    addAccount, removeAccount, resetAllAccounts,
    getBadPasswordAccounts, addBadPasswordAccount, removeBadPasswordAccount,
    getZambiaTime, TWENTY_FOUR_HOURS_MS, FREE_ACCOUNT_LOCK_THRESHOLD,
    LOCK_HOUR, LOCK_MINUTE, UNLOCK_HOUR, UNLOCK_MINUTE,
    LOW_ACCOUNT_LOCK_START_HOUR, LOW_ACCOUNT_LOCK_START_MINUTE,
    REMOVE_PASSWORD, HEARTBEAT_TIMEOUT_MS, TIMEZONE,
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

const ICON_192_B64 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlApw1AAAA/1BMVEVSXWmhqaNrVSUgHhzXy12plTVec4Ta2923wYXOrzBkiJwfMEuFZSE5UmyryNJHLi+5vMD/4DU/QzoHCxYOFywVJkfipg8TITz+/v6EsMH82DQMER5ONC2DrsCZchC44+ncohApOVHPmBB0WRpxmKvzyCqOaBR8preNsrVWdotniJyGqrkyRVqmeRHqtRqUlZl1XCMyNjW4hxDp0UskJy8zSWPAjQ7tvSBFOBh+rsem0tvo6epYQiqw2+OZxdHExckAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADay6DAAAAAQHRSTlP/////////////////////////////////////////////////////////////////////////////////////73leyQAACXFJREFUeNrt3QtX2kgUAOBJsFh8tN3NxAFGUhIgyEsEwXZF5f//q528yCTkOQ9kzvG25+xWEe+Xe+9kgrQB7YLYa02wtW0TmZUDmSgZkCfQxgZg+WNXkCPI+8SlBuzwWWrk7xtSAg6DEcQGLC/rAXYaML3UTZYQWQI/MDFAMNtVBuw020/e+/ZCCIgvfYz9Wmy0XTWAl36UhGkKEAgoACkBMaBlBcAekPSjb22yRnKW+QBGIDAwIcz3ZYCpN7Tc+YssAo4AnsEwmoWAS0Clz5V/SsDVQjHAE4DLfMCPa3H5p88IvDMQE+CvPIAGBeafrAFEUJzA0LIBovMXNgZJgCdYZgE0On0R+acIYoYgDO0Y8Ev08T8CIFElSAgiwCWSUACJAHyZAgAZ+cvrIWzYScAUykg/tRLxn4xpQZMG7BPHX5YA8W6rk7GnAJIaSBgAZwHsGDCTVwBBFcga42Al8gE2RFBS/jJ7aBMBNJn5C9lQ4Kwewv4JGQQFkJc/LRA7A0EJgJw9hGABzimB5gNAooOklgCJnGISXvbtHTpdBZDgHsI7Apg1EIRnD8gUeGMM5HeQCEFOBUgPgeQaJCV/IUOQsw7twB6qAMB5JdiDGaRHwFQNsARN+QUQcCbIBQAApO4j5E8xmEOEoLqAFUjsRE35ACQWsAEmlD8ClEDwqdiAAEEITwkQXAEM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";
const ICON_512_B64 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAMAAADDpiTIAAAA/1BMVEWeqJ5nVyjWqyNRXWmmz9nZ2typlTSGaSMeMEs7VG1TbYJHOhotJxjczFiOscC1wIdhg5eenV09QDa+w31tgnnAvmzfwDQHCxYOFywWJkfiphATITz+/v6EsMH81zQLEB5ONS3OlxC44+myhBKdcwyKZhbzyCp7pbcmOFHcog8rJhrptBpwmKtuVBhWd4yleQ80S2WOs7RnThiBrL1lh5pJY3knKSuv2+Ls0kfMx2wxQ1kzNzaYxNBLQyxmRyRojaEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACnKtztAAAAQHRSTlP/////////////////////////////////////////////////////////////////////////////////////73leyQAAIdRJREFUeNrtnQt34jjShg0OwyWdTHr227UZ060wQHASAiRcppvc/v+/+iQZEwy2JduyrUsVp8/unOk0PdRTr94qScYaiI9Wy7LWvd7GXvp+36Ov6sILXxzhfr3kDW/r2/bG7llWq1VCsiyhf9rFar1Zdo4+4n49wZf/PQOu1Pk/CoRcH4Nw3ZITgOv1MvLRHmqxhuzrpQFh/l0H0Zfr96yWXACcJj8koL7IpAHKKABCzj6QKAgEAGDZXmz2ayegn4EABShAoQaE4dpW/QBc9GI/5pqzn8MHqKAAWAOO8h8wcF0nAK2178lY/REvoI0CuK4TuoDj2PZa9QDQsnZJH6kE2c+mAiq6gKPwC9iB3ABYvidx9WfTAFVU4NAHnFGwtaoFoJWQ/jp7/0QKdNKAmNzvw8upAlaupb+frP3y1H8WFVBGAVwnkQE3lxnIAYCV+nH25QvuVUDFPiCCgFUBANfJ4i9h/fNqgCqdQGwfcOwFLkoGoLVJ/yD7coZGGoBSNcBxNq0yAUhTf0nrXy8NQAwFyL4OZPndrV169cta/zppQMIkIDoWuCgFgJbNyL70BGigAel9QJ51gBuAls8qn77coYcGMPqAgwi0RAPA6P1kr39dfABi9gFZnQDn79uwql/2+ufVAAV8IIcLIGELBIAh/wrUvy4+4OxMQEpsW6IAsNiF01cjuHyA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";

let poolLocked = false;
let poolLockedReason = '';

function pad(n) { return String(n).padStart(2, '0'); }

function checkLockStatus(hour, minute, freeCount) {
    const t = hour * 60 + minute;

    const lockStart = LOCK_HOUR * 60 + LOCK_MINUTE;
    const lockEnd = UNLOCK_HOUR * 60 + UNLOCK_MINUTE;
    const isTimeLocked = t >= lockStart && t < lockEnd;

    const lowAccountStart = LOW_ACCOUNT_LOCK_START_HOUR * 60 + LOW_ACCOUNT_LOCK_START_MINUTE;
    const lowAccountEnd = lockStart;
    const isLowAccountWindow = t >= lowAccountStart && t < lowAccountEnd;
    const isLowAccounts = isLowAccountWindow && freeCount <= FREE_ACCOUNT_LOCK_THRESHOLD;

    return { shouldLock: isTimeLocked || isLowAccounts, isWorkingHours: !isTimeLocked, isLowAccounts };
}

const HEARTBEAT_SILENCE_TIMEOUT_MS = 3 * 60 * 60 * 1000;

setInterval(async () => {
    try {
        const accounts = await getAccounts();
        const now = Date.now();
        for (const acc of accounts) {
            if (acc.status === 'IN-USE' && acc.logoutTime && (now - acc.logoutTime >= TWENTY_FOUR_HOURS_MS)) {
                await updateAccount(acc.phone, { status: 'FREE', logoutTime: null, logoutTimeStr: null, lastHeartbeat: null, inUseSince: null, tabId: null, freedAt: now });
            }
        }
    } catch(e) { console.error('auto-free error:', e); }
}, 60 * 1000);

setInterval(async () => {
    try {
        const accounts = await getAccounts();
        const now = Date.now();
        for (const acc of accounts) {
            if (acc.status === 'IN-USE' && !acc.logoutTime && acc.lastHeartbeat && acc.inUseSince) {
                if (acc.lastHeartbeat > acc.inUseSince && now - acc.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
                    const { hour, minute } = getZambiaTime();
                    await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: pad(hour) + ':' + pad(minute) + ' (tab closed)', inUseSince: null, tabId: null });
                }
            }
        }
    } catch(e) { console.error('heartbeat-check error:', e); }
}, 10 * 1000);

setInterval(async () => {
    try {
        const accounts = await getAccounts();
        const now = Date.now();
        for (const acc of accounts) {
            if (acc.status === 'IN-USE' && !acc.logoutTime) {
                if (acc.lastHeartbeat && now - acc.lastHeartbeat > HEARTBEAT_SILENCE_TIMEOUT_MS) {
                    const { hour, minute } = getZambiaTime();
                    const timeStr = pad(hour) + ':' + pad(minute);
                    await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (3h no heartbeat)', inUseSince: null, tabId: null });
                }
            }
        }
    } catch(e) { console.error('timeout-check error:', e); }
}, 60 * 1000);

setInterval(async () => {
    try {
        const { hour, minute } = getZambiaTime();
        const accounts = await getAccounts();
        const freeCount = accounts.filter(a => a.status === 'FREE').length;
        const { shouldLock, isWorkingHours, isLowAccounts } = checkLockStatus(hour, minute, freeCount);
        if (shouldLock) {
            if (!poolLocked) {
                poolLocked = true;
                poolLockedReason = isLowAccounts ? `Low accounts (${freeCount}). Locked until 18:00.` : 'Locked at 08:00. Unlocks at 18:00.';
                console.log('Pool locked:', poolLockedReason);
            }
        } else {
            if (poolLocked) { poolLocked = false; poolLockedReason = ''; console.log('Pool unlocked.'); }
        }
    } catch(e) { console.error('lock-check error:', e); }
}, 10 * 1000);

let lastNineAmSweepDate = null;
setInterval(async () => {
    try {
        const { hour } = getZambiaTime();
        if (hour !== 9) return;
        const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
        if (lastNineAmSweepDate === todayStr) return;
        const accounts = await getAccounts();
        const { hour: h2, minute: m2 } = getZambiaTime();
        const timeStr = pad(h2) + ':' + pad(m2);
        let moved = 0;
        for (const acc of accounts) {
            if (acc.status === 'IN-USE' && !acc.logoutTime) {
                await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (09:00 sweep)', lastHeartbeat: null, inUseSince: null, tabId: null });
                moved++;
            }
        }
        lastNineAmSweepDate = todayStr;
        console.log('09:00 sweep: moved ' + moved + ' account(s) to Waiting.');
    } catch(e) { console.error('nine-am-sweep error:', e); }
}, 30 * 1000);

app.get('/stats', async (req, res) => {
    try {
        const accounts = await getAccounts();
        const badPasswordAccounts = await getBadPasswordAccounts();
        res.json({
            free: accounts.filter(a => a.status === 'FREE').length,
            inUse: accounts.filter(a => a.status === 'IN-USE' && !a.logoutTime).length,
            waiting: accounts.filter(a => a.status === 'IN-USE' && a.logoutTime).length,
            badPassword: badPasswordAccounts.length,
            locked: poolLocked,
            reason: poolLockedReason
        });
    } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/inuse-stats', async (req, res) => {
    try {
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
    } catch(e) { res.status(500).json([]); }
});

app.post('/heartbeat', async (req, res) => {
    try {
        const { phone } = req.body;
        const accounts = await getAccounts();
        const account = accounts.find(a => a.phone === phone);
        if (account && account.status === 'IN-USE') {
            await updateAccount(phone, { lastHeartbeat: Date.now() });
            return res.json({ success: true });
        }
        res.json({ success: false, error: 'Account not found or not in use.' });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/tab-closed', express.text({ type: '*/*' }), async (req, res) => {
    try {
        let phone;
        if (typeof req.body === 'string') { phone = JSON.parse(req.body).phone; }
        else if (req.body && req.body.phone) { phone = req.body.phone; }
        if (!phone) return res.json({ success: false });
        const accounts = await getAccounts();
        const account = accounts.find(a => a.phone === phone);
        if (account && account.status === 'IN-USE' && !account.logoutTime) {
            const { hour, minute } = getZambiaTime();
            await updateAccount(phone, { logoutTime: Date.now(), logoutTimeStr: pad(hour) + ':' + pad(minute) + ' (tab closed)' });
        }
        res.json({ success: true });
    } catch(e) { res.json({ success: false }); }
});

app.post('/request-login', async (req, res) => {
    try {
        const { tabId } = req.body;
        if (poolLocked) {
            if (tabId) {
                const held = await getAccountByTabId(tabId);
                if (held) {
                    const { hour, minute } = getZambiaTime();
                    await updateAccount(held.phone, { logoutTime: Date.now(), logoutTimeStr: pad(hour) + ':' + pad(minute) + ' (pool locked)', lastHeartbeat: null, inUseSince: null, tabId: null });
                }
            }
            return res.json({ success: false, error: `Pool locked. ${poolLockedReason}` });
        }
        if (!tabId) return res.json({ success: false, error: 'Tab ID required.' });
        const { hour, minute } = getZambiaTime();
        const claimed = await reLoginForTab(tabId, Date.now(), pad(hour) + ':' + pad(minute));
        if (claimed) return res.json({ success: true, phone: claimed.phone, password: claimed.password });
        return res.json({ success: false, error: 'No free accounts available' });
    } catch(e) { console.error('request-login error:', e); res.json({ success: false, error: 'Server error' }); }
});

app.post('/logout', async (req, res) => {
    try {
        const { phone, logoutTime } = req.body;
        const accounts = await getAccounts();
        const account = accounts.find(a => a.phone === phone);
        if (account) {
            await updateAccount(phone, { logoutTime: Date.now(), logoutTimeStr: logoutTime, lastHeartbeat: null, inUseSince: null, tabId: null });
            return res.json({ success: true });
        }
        res.json({ success: false, error: 'Account not found.' });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/wrong-password', async (req, res) => {
    try {
        const { phone } = req.body;
        if (!phone) return res.json({ success: false });
        const { hour, minute } = getZambiaTime();
        const accounts = await getAccounts();
        const acc = accounts.find(a => a.phone === phone) || { phone, password: 'unknown' };
        await removeAccount(phone);
        await addBadPasswordAccount(acc.phone, acc.password, pad(hour) + ':' + pad(minute));
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/add-account', async (req, res) => {
    try {
        const { phone, password } = req.body;
        if (!phone || !password) return res.json({ success: false, error: 'Phone and password required.' });
        const accounts = await getAccounts();
        if (accounts.find(a => a.phone === phone)) return res.json({ success: false, error: 'Account already exists.' });
        await addAccount(phone, password);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.post('/remove-account', async (req, res) => {
    try {
        const { phone, pin } = req.body;
        if (pin !== REMOVE_PASSWORD) return res.json({ success: false, error: 'Incorrect password.' });
        await removeAccount(phone);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/remove-bad-password', async (req, res) => {
    try {
        const { phone, pin } = req.body;
        if (pin !== REMOVE_PASSWORD) return res.json({ success: false, error: 'Incorrect password.' });
        await removeBadPasswordAccount(phone);
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/cashout', async (req, res) => {
    try {
        const { tabId, amount, timestamp } = req.body;
        if (!tabId || !tabId.startsWith('ID:')) return res.json({ ok: false, error: 'Invalid tabId' });
        await pool.query('INSERT INTO alerts (tab_id, amount, timestamp) VALUES ($1, $2, $3)', [tabId, amount || 0, timestamp || Date.now()]);
        console.log('[ALERT] Recorded:', tabId);
        res.json({ ok: true });
    } catch(e) { console.error('cashout error:', e); res.status(500).json({ ok: false }); }
});

app.post('/clear-alerts', async (req, res) => {
    try {
        await pool.query('DELETE FROM alerts');
        res.json({ ok: true });
    } catch(e) { res.status(500).json({ ok: false }); }
});

app.get('/alerts', async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM alerts ORDER BY id ASC');
        res.json(rows.map(r => ({ tabId: r.tab_id, amount: parseFloat(r.amount), timestamp: parseInt(r.timestamp) })));
    } catch(e) { res.status(500).json([]); }
});

app.post('/reset', async (req, res) => {
    try {
        await resetAllAccounts();
        poolLocked = false; poolLockedReason = '';
        res.json({ success: true });
    } catch(e) { res.status(500).json({ success: false }); }
});

app.post('/migrate-password', async (req, res) => {
    try {
        const { pin } = req.body || {};
        if (pin !== REMOVE_PASSWORD) return res.json({ success: false, error: 'Incorrect password.' });
        const result = await pool.query(
            `UPDATE accounts SET password = $1 WHERE password = $2`,
            ['pamer03', '12345QAZ']
        );
        res.json({ success: true, updated: result.rowCount });
    } catch(e) { res.status(500).json({ success: false, error: e.message }); }
});

app.get('/migrate-password-now', async (req, res) => {
    try {
        const { pin } = req.query;
        if (pin !== REMOVE_PASSWORD) return res.status(403).send('Incorrect password.');
        const result = await pool.query(
            `UPDATE accounts SET password = $1 WHERE password = $2`,
            ['pamer03', '12345QAZ']
        );
        res.send(`Updated ${result.rowCount} account(s) to the new password.`);
    } catch(e) { res.status(500).send('Error: ' + e.message); }
});

app.get('/view/free', async (req, res) => {
    try {
        const accounts = await getAccounts();
        const list = accounts.filter(a => a.status === 'FREE')
            .sort((a, b) => { if (a.freedAt && b.freedAt) return a.freedAt - b.freedAt; if (a.freedAt) return -1; if (b.freedAt) return 1; return 0; });
        const rows = list.map((r, i) => `<div class="row" data-phone="${r.phone}"><div class="rn">${i+1}.</div><div class="ri"><div class="rp">${r.phone}</div><div class="rs">${r.password}</div></div><button class="rb" onclick="removeAccount('${r.phone}')">Remove</button></div>`).join('') || '<div class="empty">No accounts</div>';
        res.send(listPage('Free Accounts', list.length + ' ready', rows, true));
    } catch(e) { res.status(500).send('Error'); }
});

app.get('/view/inuse', async (req, res) => {
    try {
        const accounts = await getAccounts();
        const list = accounts.filter(a => a.status === 'IN-USE' && !a.logoutTime)
            .sort((a, b) => { const an = a.tabId ? parseInt(a.tabId.replace('TAB-','')) : 9999; const bn = b.tabId ? parseInt(b.tabId.replace('TAB-','')) : 9999; return an - bn; });
        const rows = list.map((r, i) => `<div class="row" data-phone="${r.phone}"><div class="rn">${i+1}.</div><div class="ri"><div class="rp">${r.phone}</div><div class="rs" id="hb-${i}">checking...</div></div></div>`).join('') || '<div class="empty">No accounts</div>';
        res.send(`<!DOCTYPE html><html><head><title>In Use</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#04060a;padding:20px;min-height:100vh}.page{background:#0d1117;border-radius:16px;max-width:520px;margin:0 auto;overflow:hidden}.ph{padding:16px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:12px}.back{background:#161b22;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:8px;font-size:12px;text-decoration:none}.pt{font-size:15px;font-weight:500;color:#e6edf3}.ps{font-size:11px;color:#4b5563}.sw{padding:14px 20px;border-bottom:1px solid #21262d}.si{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}.row{display:flex;align-items:center;padding:12px 20px;border-bottom:1px solid #161b22;gap:10px}.row:last-child{border-bottom:none}.rn{font-size:12px;color:#4b5563;width:26px}.ri{flex:1}.rp{font-size:14px;color:#e6edf3;font-weight:500}.rs{font-size:11px;margin-top:3px}.alive{color:#3fb950}.warn{color:#fbbf24}.dead{color:#f87171}.empty{padding:40px;text-align:center;color:#4b5563;font-size:13px}.hidden{display:none}</style></head><body><div class="page"><div class="ph"><a href="/" class="back">&#8592; Back</a><div><div class="pt">In Use</div><div class="ps">${list.length} accounts</div></div></div><div class="sw"><input class="si" placeholder="Search..." oninput="filterRows(this.value)"></div><div id="list">${rows}</div></div><script>function filterRows(q){document.querySelectorAll('.row').forEach(r=>{r.classList.toggle('hidden',q!==''&&!r.dataset.phone.includes(q));})}function updateHB(){fetch('/inuse-stats').then(r=>r.json()).then(data=>{data.forEach((a,i)=>{const el=document.getElementById('hb-'+i);if(!el)return;if(!a.lastHeartbeat){el.className='rs warn';el.textContent='Waiting for heartbeat'+(a.tabId?' \u2014 '+a.tabId:'');return;}const s=Math.floor((Date.now()-a.lastHeartbeat)/1000);if(s<5){el.className='rs alive';el.textContent='OK \u2014 '+s+'s ago'+(a.tabId?' \u2014 '+a.tabId:'');}else if(s<30){el.className='rs warn';el.textContent='Slow \u2014 '+s+'s ago'+(a.tabId?' \u2014 '+a.tabId:'');}else{el.className='rs dead';el.textContent='No heartbeat \u2014 '+s+'s ago'+(a.tabId?' \u2014 '+a.tabId:'');}});}).catch(()=>{})}setInterval(updateHB,1000);updateHB();</script></body></html>`);
    } catch(e) { res.status(500).send('Error'); }
});

app.get('/view/waiting', async (req, res) => {
    try {
        const accounts = await getAccounts();
        const list = accounts.filter(a => a.status === 'IN-USE' && a.logoutTime)
            .map(a => ({ phone: a.phone, freeAt: a.logoutTime + TWENTY_FOUR_HOURS_MS, logoutTimeStr: a.logoutTimeStr }))
            .sort((a, b) => a.freeAt - b.freeAt);
        const freeAtData = JSON.stringify(list.map((r, i) => ({ id: i, freeAt: r.freeAt })));
        const rows = list.map((r, i) => `<div class="row" data-phone="${r.phone}"><div class="rn">${i+1}.</div><div class="ri"><div class="rp">${r.phone}</div><div class="rs" id="cd-${i}">calculating...</div>${r.logoutTimeStr ? `<div class="rn2">${r.logoutTimeStr}</div>` : ''}</div></div>`).join('') || '<div class="empty">No accounts</div>';
        res.send(`<!DOCTYPE html><html><head><title>Waiting 24h</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#04060a;padding:20px;min-height:100vh}.page{background:#0d1117;border-radius:16px;max-width:520px;margin:0 auto;overflow:hidden}.ph{padding:16px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:12px}.back{background:#161b22;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:8px;font-size:12px;text-decoration:none}.pt{font-size:15px;font-weight:500;color:#e6edf3}.ps{font-size:11px;color:#4b5563}.sw{padding:14px 20px;border-bottom:1px solid #21262d}.si{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}.row{display:flex;align-items:center;padding:12px 20px;border-bottom:1px solid #161b22;gap:10px}.row:last-child{border-bottom:none}.rn{font-size:12px;color:#4b5563;width:26px}.rn2{font-size:10px;color:#4b5563;margin-top:2px}.ri{flex:1}.rp{font-size:14px;color:#e6edf3;font-weight:500}.rs{font-size:11px;color:#fbbf24;margin-top:3px}.empty{padding:40px;text-align:center;color:#4b5563;font-size:13px}.hidden{display:none}</style></head><body><div class="page"><div class="ph"><a href="/" class="back">&#8592; Back</a><div><div class="pt">Waiting 24h</div><div class="ps">${list.length} accounts</div></div></div><div class="sw"><input class="si" placeholder="Search..." oninput="filterRows(this.value)"></div><div id="list">${rows}</div></div><script>function pad(n){return String(n).padStart(2,'0')}const data=${freeAtData};function updateCD(){const now=Date.now();data.forEach(item=>{const el=document.getElementById('cd-'+item.id);if(!el)return;const diff=item.freeAt-now;if(diff<=0){el.textContent='Ready';el.style.color='#3fb950';}else{const h=Math.floor(diff/3600000);const m=Math.floor((diff%3600000)/60000);const s=Math.floor((diff%60000)/1000);el.textContent='Free in: '+h+'h '+pad(m)+'m '+pad(s)+'s';}});}function filterRows(q){document.querySelectorAll('.row').forEach(r=>{r.classList.toggle('hidden',q!==''&&!r.dataset.phone.includes(q));})}setInterval(updateCD,1000);updateCD();</script></body></html>`);
    } catch(e) { res.status(500).send('Error'); }
});

app.get('/view/bad', async (req, res) => {
    try {
        const list = await getBadPasswordAccounts();
        const rows = list.map((r, i) => `<div class="row" data-phone="${r.phone}"><div class="rn">${i+1}.</div><div class="ri"><div class="rp">${r.phone}</div><div class="rs">${r.password}</div>${r.reportedAt ? `<div class="rt">Reported: ${r.reportedAt}</div>` : ''}</div><button class="rb" onclick="removeAccount('${r.phone}')">Remove</button></div>`).join('') || '<div class="empty">No accounts</div>';
        res.send(listPage('Bad Password', list.length + ' accounts', rows, true));
    } catch(e) { res.status(500).send('Error'); }
});

function listPage(title, subtitle, rows, showRemove) {
    return `<!DOCTYPE html><html><head><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#04060a;padding:20px;min-height:100vh}.page{background:#0d1117;border-radius:16px;max-width:520px;margin:0 auto;overflow:hidden}.ph{padding:16px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:12px}.back{background:#161b22;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:8px;font-size:12px;text-decoration:none}.pt{font-size:15px;font-weight:500;color:#e6edf3}.ps{font-size:11px;color:#4b5563}.sw{padding:14px 20px;border-bottom:1px solid #21262d}.si{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}.row{display:flex;align-items:center;padding:12px 20px;border-bottom:1px solid #161b22;gap:10px}.row:last-child{border-bottom:none}.rn{font-size:12px;color:#4b5563;width:26px}.ri{flex:1}.rp{font-size:14px;color:#e6edf3;font-weight:500}.rs{font-size:11px;color:#4b5563;margin-top:2px}.rt{font-size:10px;color:#f87171;margin-top:2px}.rb{background:#2d0a0a;border:1px solid #7f1d1d;color:#f87171;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer}.empty{padding:40px;text-align:center;color:#4b5563;font-size:13px}.hidden{display:none}.pm{position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;z-index:100}.pb{background:#0d1117;border:1.5px solid #21262d;border-radius:16px;padding:28px 24px;width:100%;max-width:320px;text-align:center}.ptt{font-size:15px;font-weight:500;color:#e6edf3;margin-bottom:6px}.ps2{font-size:12px;color:#4b5563;margin-bottom:20px}.pi{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:12px;border-radius:8px;font-size:16px;outline:none;text-align:center;letter-spacing:4px;margin-bottom:14px}.pr{display:flex;gap:10px}.pc{flex:1;background:#161b22;border:1px solid #30363d;color:#8b949e;padding:10px;border-radius:8px;font-size:13px;cursor:pointer}.pco{flex:1;background:#7f1d1d;border:none;color:#f87171;padding:10px;border-radius:8px;font-size:13px;cursor:pointer}.pe{color:#f87171;font-size:12px;margin-top:10px;display:none}</style></head><body><div class="page"><div class="ph"><a href="/" class="back">&#8592; Back</a><div><div class="pt">${title}</div><div class="ps">${subtitle}</div></div></div><div class="sw"><input class="si" placeholder="Search..." oninput="filterRows(this.value)"></div><div id="list">${rows}</div></div>${showRemove ? `<div class="pm" id="modal" style="display:none"><div class="pb"><div class="ptt">&#128274; Confirm</div><div class="ps2">Enter password to remove</div><input class="pi" id="pin" type="password" maxlength="10" placeholder="\u2022\u2022\u2022\u2022"><div class="pr"><button class="pc" onclick="closeModal()">Cancel</button><button class="pco" onclick="confirmRemove()">Remove</button></div><div class="pe" id="perr">Wrong password</div></div></div>` : ''}<script>let pending=null;function removeAccount(p){pending=p;document.getElementById('pin').value='';document.getElementById('perr').style.display='none';document.getElementById('modal').style.display='flex';}function closeModal(){pending=null;document.getElementById('modal').style.display='none';}function confirmRemove(){const pin=document.getElementById('pin').value.trim();fetch('/remove-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:pending,pin})}).then(r=>r.json()).then(d=>{if(d.success){closeModal();document.querySelector('[data-phone="'+pending+'"]').remove();}else{document.getElementById('perr').style.display='block';}});}document.addEventListener('DOMContentLoaded',()=>{const pi=document.getElementById('pin');if(pi){pi.addEventListener('keydown',e=>{if(e.key==='Enter')confirmRemove();if(e.key==='Escape')closeModal();});}});function filterRows(q){document.querySelectorAll('.row').forEach(r=>{r.classList.toggle('hidden',q!==''&&!r.dataset.phone.includes(q));});}</script></body></html>`;
}

app.get('/', async (req, res) => {
    try {
        const accounts = await getAccounts();
        const freeAccounts = accounts.filter(a => a.status === 'FREE');
        const inUseAccounts = accounts.filter(a => a.status === 'IN-USE' && !a.logoutTime);
        const waitingAccounts = accounts.filter(a => a.status === 'IN-USE' && a.logoutTime);
        const badPasswordAccounts = await getBadPasswordAccounts();
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
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:sans-serif;background:#04060a;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px}
.db{background:#080b10;border-radius:20px;padding:24px;width:100%;max-width:760px}
.top-bar{display:flex;justify-content:space-between;align-items:center;margin-bottom:20px}
.db-title{font-size:18px;font-weight:600;color:#fff}
.pill{padding:6px 14px;border-radius:20px;font-size:11px;font-weight:600;display:flex;align-items:center;gap:6px}
.pill-live{background:#0d4429;color:#3fb950}
.pill-locked{background:#4b1111;color:#f87171}
.dot{width:7px;height:7px;border-radius:50%;animation:blink 1.2s infinite}
.dot-live{background:#3fb950}
.dot-locked{background:#f87171}
@keyframes blink{0%,100%{opacity:1}50%{opacity:0.15}}
.boxes{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-bottom:16px}
.box{border-radius:14px;padding:16px 14px;display:flex;flex-direction:column}
.box-free{background:#0a1a0f;border:1.5px solid #1a4a27}
.box-inuse{background:#080f1f;border:1.5px solid #1a2f55}
.box-waiting{background:#120c22;border:1.5px solid #2e1f55}
.box-bad{background:#1a0f0a;border:1.5px solid #4a1f0a}
.box-free.locked-box{background:#1a0a0a;border-color:#7f1d1d}
.bl{font-size:9px;font-weight:600;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px}
.c-free{color:#3fb950}.c-inuse{color:#58a6ff}.c-waiting{color:#c4b5fd}.c-bad{color:#fb923c}.c-locked{color:#f87171}
.bn{font-size:48px;font-weight:500;line-height:1;letter-spacing:-2px;margin-bottom:6px}
.bd{font-size:11px;margin-bottom:12px;flex:1}
.d-free{color:#2a6e3a}.d-inuse{color:#1e4a7a}.d-waiting{color:#4a3080}.d-bad{color:#7a3a10}.d-locked{color:#7f2020}
.unlock-t{font-size:14px;font-weight:500;color:#fff;margin-bottom:2px}
.unlock-s{font-size:9px;color:#7f2020;margin-bottom:10px}
.vbtn{width:100%;border-radius:8px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;padding:9px;border:none;background:#92400e;color:#fed7aa;text-decoration:none}
.vcnt{background:#fed7aa;color:#92400e;border-radius:20px;padding:1px 7px;font-size:10px;font-weight:700}
.add-box{background:#0d1117;border:1.5px solid #21262d;border-radius:12px;padding:18px 20px;margin-bottom:16px}
.add-title{font-size:12px;font-weight:600;color:#8b949e;margin-bottom:12px;letter-spacing:0.5px;text-transform:uppercase}
.add-row{display:flex;gap:8px;flex-wrap:wrap}
.add-input{flex:1;min-width:110px;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 12px;border-radius:8px;font-size:13px;outline:none}
.add-input::placeholder{color:#4b5563}
.add-btn{background:#1a3a6e;border:none;color:#a8d0ff;padding:10px 16px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer}
.msg{font-size:12px;margin-top:8px;padding:7px 10px;border-radius:6px;display:none}
.msg-ok{background:#0d4429;color:#3fb950}.msg-err{background:#4b1111;color:#f87171}
.alerts-area{margin-bottom:16px}
.abtn-row{display:flex;gap:10px;margin-bottom:10px}
.abtn{flex:1;background:#1e293b;color:#fff;border:none;padding:14px 16px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer}
.abtn-clear{background:#ef4444;color:#fff;border:none;padding:14px 18px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer}
.apanel{display:none}
.ahide{width:100%;background:#0f172a;color:#fff;border:none;padding:12px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;margin-bottom:12px}
.abox{margin-bottom:14px}
.abox-header{background:#0d1117;border-radius:12px 12px 0 0;padding:10px 14px;display:flex;justify-content:space-between;align-items:center}
.abox-title{font-size:11px;font-weight:800;color:#f1f5f9;letter-spacing:2px}
.abox-count{font-size:10px;font-weight:700;background:#1e293b;color:#94a3b8;padding:3px 8px;border-radius:20px}
.abox-count.full{background:#ef4444;color:#fff}
.abox-body{background:#161b22;border-radius:0 0 12px 12px;overflow:hidden}
.arow{display:flex;align-items:center;padding:9px 12px;border-bottom:1px solid #1a1a2e;gap:8px}
.arow:last-child{border-bottom:none}
.achips{display:flex;gap:8px;flex:1}
.achip{background:#0d1117;border-radius:7px;padding:7px 12px}
.achip-id{font-size:13px;font-weight:800;color:#e6edf3}
.achip-ph{font-size:11px;font-weight:600;color:#e6edf3;font-family:monospace}
.anum{font-size:11px;font-weight:800;color:#4b5563;min-width:20px;text-align:right}
.aempty{padding:20px;text-align:center;color:#4b5563;font-size:13px}
.footer{display:flex;justify-content:space-between;align-items:center;margin-top:14px}
.tick{font-size:11px;color:#3fb950;font-family:monospace;opacity:0.7}
.hint{font-size:10px;color:#252b35}
@media(max-width:600px){.boxes{grid-template-columns:1fr 1fr}.bn{font-size:38px}}
</style>
</head>
<body>
<div class="db">
  <div class="top-bar">
    <div class="db-title">&#128274; Login pool manager</div>
    <div id="pill" class="pill ${poolLocked ? 'pill-locked' : 'pill-live'}">
      <div class="dot ${poolLocked ? 'dot-locked' : 'dot-live'}"></div>
      <span id="pill-text">${poolLocked ? 'Locked' : 'Live'}</span>
    </div>
  </div>

  <div class="boxes">
    <div class="box ${poolLocked ? 'box-free locked-box' : 'box-free'}" id="free-box">
      <div class="bl ${poolLocked ? 'c-locked' : 'c-free'}" id="free-label">${poolLocked ? '&#128274; Locked' : '&#10003; Free'}</div>
      <div class="bn ${poolLocked ? 'c-locked' : 'c-free'}" id="num-free">${freeAccounts.length}</div>
      <div class="bd ${poolLocked ? 'd-locked' : 'd-free'}" id="free-desc">${poolLocked ? poolLockedReason : 'Accounts ready'}</div>
      <div id="unlock-block" style="display:${poolLocked ? 'block' : 'none'}">
        <div class="unlock-t" id="unlock-countdown">--:--:--</div>
        <div class="unlock-s">Unlocks at 18:00 (Zambia)</div>
      </div>
      <a href="/view/free" class="vbtn">View <span class="vcnt" id="cnt-free">${freeAccounts.length}</span></a>
    </div>
    <div class="box box-inuse">
      <div class="bl c-inuse">&#9654; In use</div>
      <div class="bn c-inuse" id="num-inuse">${inUseAccounts.length}</div>
      <div class="bd d-inuse">Not yet logged out</div>
      <a href="/view/inuse" class="vbtn">View <span class="vcnt" id="cnt-inuse">${inUseAccounts.length}</span></a>
    </div>
    <div class="box box-waiting">
      <div class="bl c-waiting">&#9203; Waiting 24h</div>
      <div class="bn c-waiting" id="num-waiting">${waitingAccounts.length}</div>
      <div class="bd d-waiting">Full account</div>
      <a href="/view/waiting" class="vbtn">View <span class="vcnt" id="cnt-waiting">${waitingAccounts.length}</span></a>
    </div>
    <div class="box box-bad">
      <div class="bl c-bad">&#10060; Bad password</div>
      <div class="bn c-bad" id="num-bad">${badPasswordAccounts.length}</div>
      <div class="bd d-bad">Login failed</div>
      <a href="/view/bad" class="vbtn">View <span class="vcnt" id="cnt-bad">${badPasswordAccounts.length}</span></a>
    </div>
  </div>

  <div class="add-box">
    <div class="add-title">&#43; Add account</div>
    <div class="add-row">
      <input class="add-input" id="inp-phone" placeholder="Phone number" type="text">
      <input class="add-input" id="inp-pass" placeholder="Password" type="text">
      <button class="add-btn" id="add-btn">Add</button>
    </div>
    <div class="msg" id="add-msg"></div>
  </div>

  <div class="alerts-area">
    <div class="abtn-row">
      <button class="abtn" id="view-btn">&#128065;&#65039; View IDs &amp; Numbers</button>
      <button class="abtn-clear" id="clear-btn">&#128260; Deposit / Clear</button>
    </div>
    <div class="apanel" id="apanel">
      <button class="ahide" id="hide-btn">&#128274; Hide IDs &amp; Numbers</button>
      <div id="acontainer"><div class="aempty">No low balance accounts yet...</div></div>
    </div>
  </div>

  <div class="footer">
    <span class="tick" id="tick">--:--:-- CAT</span>
    <span class="hint">Live data &middot; Postgres &middot; Zambia Time</span>
  </div>
</div>

<div id="note-printable" style="position:fixed;left:-9999px;top:0;width:400px;background:#fff;padding:32px 28px;font-family:sans-serif;">
  <div id="note-title" style="font-size:16px;font-weight:900;color:#0f172a;margin-bottom:4px;"></div>
  <div id="note-date" style="font-size:11px;color:#94a3b8;margin-bottom:20px;"></div>
  <hr style="border:none;border-top:2px solid #e2e8f0;margin-bottom:16px;">
  <div id="note-rows"></div>
  <div style="margin-top:20px;font-size:10px;color:#cbd5e1;text-align:center;">Login Pool Server 2</div>
</div>

<style>
.note-row{display:flex;align-items:baseline;gap:10px;padding:7px 0;border-bottom:1px solid #f1f5f9;font-size:13px;color:#0f172a;}
.note-row:last-child{border-bottom:none;}
.note-num{font-size:11px;font-weight:700;color:#94a3b8;min-width:22px;text-align:right;}
.note-id{font-weight:800;}
.note-sep{color:#cbd5e1;}
.note-phone{font-family:monospace;font-size:12px;color:#334155;}
</style>

<script>
(function() {
    function pad(n) { return String(n).padStart(2, '0'); }
    function zambiaTime() {
        try {
            return new Date().toLocaleTimeString('en-GB', { timeZone: 'Africa/Lusaka', hour: '2-digit', minute: '2-digit', second: '2-digit' });
        } catch(e) {
            var d = new Date(Date.now() + 2 * 3600000);
            return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
        }
    }
    setInterval(function() {
        document.getElementById('tick').textContent = zambiaTime() + ' CAT';
    }, 1000);
    document.getElementById('tick').textContent = zambiaTime() + ' CAT';

    function refreshStats() {
        fetch('/stats').then(function(r) { return r.json(); }).then(function(d) {
            document.getElementById('num-free').textContent = d.free;
            document.getElementById('num-inuse').textContent = d.inUse;
            document.getElementById('num-waiting').textContent = d.waiting;
            document.getElementById('num-bad').textContent = d.badPassword;
            document.getElementById('cnt-free').textContent = d.free;
            document.getElementById('cnt-inuse').textContent = d.inUse;
            document.getElementById('cnt-waiting').textContent = d.waiting;
            document.getElementById('cnt-bad').textContent = d.badPassword;
            var pill = document.getElementById('pill');
            var pillText = document.getElementById('pill-text');
            var freeBox = document.getElementById('free-box');
            var freeLabel = document.getElementById('free-label');
            var freeNum = document.getElementById('num-free');
            var freeDesc = document.getElementById('free-desc');
            var unlockBlock = document.getElementById('unlock-block');
            if (d.locked) {
                pill.className = 'pill pill-locked';
                pill.querySelector('.dot').className = 'dot dot-locked';
                pillText.textContent = 'Locked';
                freeBox.className = 'box box-free locked-box';
                freeLabel.className = 'bl c-locked';
                freeLabel.innerHTML = '&#128274; Locked';
                freeNum.className = 'bn c-locked';
                freeDesc.className = 'bd d-locked';
                freeDesc.textContent = d.reason;
                unlockBlock.style.display = 'block';
                var now = new Date();
                var h = now.getUTCHours() + 2;
                if (h >= 24) h -= 24;
                var unlockMs = new Date(Date.now() + ((18 - h) * 3600000) - (now.getUTCMinutes() * 60000) - (now.getUTCSeconds() * 1000));
                if (unlockMs < Date.now()) unlockMs = new Date(unlockMs.getTime() + 86400000);
                var diff = unlockMs - Date.now();
                if (diff > 0) {
                    var uh = Math.floor(diff / 3600000);
                    var um = Math.floor((diff % 3600000) / 60000);
                    var us = Math.floor((diff % 60000) / 1000);
                    document.getElementById('unlock-countdown').textContent = uh + 'h ' + pad(um) + 'm ' + pad(us) + 's';
                }
            } else {
                pill.className = 'pill pill-live';
                pill.querySelector('.dot').className = 'dot dot-live';
                pillText.textContent = 'Live';
                freeBox.className = 'box box-free';
                freeLabel.className = 'bl c-free';
                freeLabel.innerHTML = '&#10003; Free';
                freeNum.className = 'bn c-free';
                freeDesc.className = 'bd d-free';
                freeDesc.textContent = 'Accounts ready';
                unlockBlock.style.display = 'none';
            }
        }).catch(function() {});
    }
    setInterval(refreshStats, 2000);
    refreshStats();

    function showMsg(text, ok) {
        var el = document.getElementById('add-msg');
        el.textContent = text;
        el.className = 'msg ' + (ok ? 'msg-ok' : 'msg-err');
        el.style.display = 'block';
        setTimeout(function() { el.style.display = 'none'; }, 3000);
    }
    document.getElementById('add-btn').addEventListener('click', function() {
        var phone = document.getElementById('inp-phone').value.trim();
        var password = document.getElementById('inp-pass').value.trim();
        if (!phone || !password) { showMsg('Phone and password required', false); return; }
        fetch('/add-account', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: phone, password: password }) })
        .then(function(r) { return r.json(); }).then(function(d) {
            if (d.success) { showMsg('Account ' + phone + ' added!', true); document.getElementById('inp-phone').value = ''; document.getElementById('inp-pass').value = ''; refreshStats(); }
            else { showMsg(d.error || 'Error', false); }
        }).catch(function() { showMsg('Network error', false); });
    });

    var BOX_SIZE = 30;
    var panelOpen = false;

    function parseId(tabId) {
        var m = tabId.match(/ID:\s*(\S+)\s*\(([^)]+)\)/);
        if (m) return { id: m[1], phone: m[2].replace(/^\+260/, '') };
        m = tabId.match(/ID:\s*(\S+)\s+(\S+)/);
        if (m) return { id: m[1], phone: m[2].replace(/^\+260/, '') };
        return { id: tabId.replace(/^ID:\s*/, ''), phone: '' };
    }

    function renderAlerts(data) {
        var container = document.getElementById('acontainer');
        var unique = []; var seen = {};
        data.forEach(function(a) { if (!seen[a.tabId]) { seen[a.tabId] = true; unique.push(a); } });
        if (unique.length === 0) { container.innerHTML = '<div class="aempty">No low balance accounts yet...</div>'; return; }
        var boxes = [];
        for (var i = 0; i < unique.length; i += BOX_SIZE) boxes.push(unique.slice(i, i + BOX_SIZE));
        _boxes = boxes;
        container.innerHTML = boxes.map(function(box, bi) {
            var full = box.length >= BOX_SIZE;
            var rowsHtml = box.map(function(a, ri) {
                var p = parseId(a.tabId);
                return '<div class="arow"><div class="achips"><div class="achip"><div class="achip-id">' + p.id + '</div></div>' +
                    (p.phone ? '<div class="achip"><div class="achip-ph">' + p.phone + '</div></div>' : '') +
                    '</div><div class="anum">' + (ri + 1) + '</div></div>';
            }).join('');
            var saveBtn = full ? '<div style="display:flex;gap:6px;padding:10px 12px;background:#0d1117;">' +
                '<button onclick="saveBox(' + bi + ',\'both\')" style="flex:1;background:#10b981;color:#fff;border:none;padding:10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">&#128190; IDs &amp; Numbers</button>' +
                '<button onclick="saveBox(' + bi + ',\'id\')" style="flex:1;background:#2563eb;color:#fff;border:none;padding:10px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;">&#128190; IDs Only</button>' +
                '</div>' : '';
            return '<div class="abox"><div class="abox-header"><div class="abox-title">&#9888;&#65039; BOX ' + (bi + 1) + '</div>' +
                '<div class="abox-count' + (full ? ' full' : '') + '">' + box.length + ' / ' + BOX_SIZE + (full ? ' &bull; FULL' : '') + '</div></div>' +
                '<div class="abox-body">' + rowsHtml + '</div>' + saveBtn + '</div>';
        }).join('');
    }

    function pollAlerts() {
        fetch('/alerts').then(function(r) { return r.json(); }).then(function(data) {
            renderAlerts(data);
        }).catch(function() {});
        if (panelOpen) setTimeout(pollAlerts, 5000);
    }

    var _boxes = [];
    function parseIdForPrint(tabId) {
        var m = tabId.match(/ID:\s*(\S+)\s*\(([^)]+)\)/);
        if (m) return { id: m[1], phone: m[2].replace(/^\+260/, '') };
        m = tabId.match(/ID:\s*(\S+)\s+(\S+)/);
        if (m) return { id: m[1], phone: m[2].replace(/^\+260/, '') };
        return { id: tabId.replace(/^ID:\s*/, ''), phone: '' };
    }
    function saveBox(bi, mode) {
        mode = mode || 'both';
        try {
            if (typeof html2canvas === 'undefined') {
                alert('Save failed: image library did not load. Check your internet connection and reload the page.');
                return;
            }
            var box = _boxes[bi];
            if (!box) return;
            var noteTitle = document.getElementById('note-title');
            var noteDate = document.getElementById('note-date');
            var noteRows = document.getElementById('note-rows');
            var titleLabel = mode === 'id' ? 'IDs Only' : mode === 'phone' ? 'Numbers Only' : 'IDs & Numbers';
            noteTitle.textContent = 'BOX ' + (bi + 1) + ' \u2014 ' + titleLabel + ' (' + box.length + '/30 FULL)';
            noteDate.textContent = new Date().toLocaleString('en-GB');
            noteRows.innerHTML = box.map(function(a, ri) {
                var p = parseIdForPrint(a.tabId);
                if (mode === 'id') {
                    return '<div class="note-row"><span class="note-num">' + (ri+1) + '.</span><span class="note-id">' + p.id + '</span></div>';
                }
                if (mode === 'phone') {
                    return '<div class="note-row"><span class="note-num">' + (ri+1) + '.</span><span class="note-phone">' + p.phone + '</span></div>';
                }
                return '<div class="note-row"><span class="note-num">' + (ri+1) + '.</span><span class="note-id">' + p.id + '</span><span class="note-sep">|</span><span class="note-phone">' + p.phone + '</span></div>';
            }).join('');
            var el = document.getElementById('note-printable');
            html2canvas(el, { scale: 2, backgroundColor: '#ffffff', useCORS: true }).then(function(canvas) {
                canvas.toBlob(function(blob) {
                    if (!blob) { alert('Could not generate image blob.'); return; }
                    var url = URL.createObjectURL(blob);
                    var link = document.createElement('a');
                    link.download = 'box-' + (bi+1) + '-' + mode + '.png';
                    link.href = url;
                    document.body.appendChild(link);
                    link.click();
                    document.body.removeChild(link);
                    setTimeout(function() { URL.revokeObjectURL(url); }, 5000);
                }, 'image/png');
            }).catch(function(err) {
                alert('html2canvas failed: ' + err.message);
            });
        } catch (err) {
            alert('Save failed: ' + (err && err.message ? err.message : err));
        }
    }
    window.saveBox = saveBox;

    document.getElementById('view-btn').addEventListener('click', function() {
        document.getElementById('view-btn').style.display = 'none';
        document.getElementById('apanel').style.display = 'block';
        panelOpen = true;
        pollAlerts();
    });

    document.getElementById('hide-btn').addEventListener('click', function() {
        document.getElementById('apanel').style.display = 'none';
        document.getElementById('view-btn').style.display = 'flex';
        panelOpen = false;
    });

    document.getElementById('clear-btn').addEventListener('click', function() {
        var pin = prompt('Enter PIN to clear alerts:');
        if (!pin) return;
        if (pin === '1234') {
            fetch('/clear-alerts', { method: 'POST' }).then(function() {
                renderAlerts([]);
                alert('Alerts cleared!');
            }).catch(function() { alert('Error'); });
        } else { alert('Wrong PIN'); }
    });
})();
</script>
</body>
</html>`);
    } catch(e) { console.error('dashboard error:', e); res.status(500).send('Error: ' + e.message); }
});

app.get('/manifest.json', (req, res) => {
    res.json({
        name: "Login Pool Manager 2",
        short_name: "Login Pool 2",
        description: "Account pool dashboard 2",
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

initDB().then(async function() {
    const { hour, minute } = getZambiaTime();
    const accounts = await getAccounts();
    const freeCount = accounts.filter(a => a.status === 'FREE').length;
    const { shouldLock, isWorkingHours, isLowAccounts } = checkLockStatus(hour, minute, freeCount);
    if (shouldLock) {
        poolLocked = true;
        poolLockedReason = isLowAccounts ? `Low accounts (${freeCount}). Locked until 18:00.` : 'Locked at 08:00. Unlocks at 18:00.';
        console.log('Startup lock:', poolLockedReason);
    }
    app.listen(PORT, () => console.log('Pool Manager active on port ' + PORT + ' \u2014 Zambia Time (Africa/Lusaka)'));
}).catch(function(err) {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
});
