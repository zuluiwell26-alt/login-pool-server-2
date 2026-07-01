const express = require('express');
const {
    pool, initDB, getAccounts, getAccountByTabId,
    claimFreeAccount, reLoginForTab, updateAccount,
    addAccount, removeAccount, resetAllAccounts,
    getBadPasswordAccounts, addBadPasswordAccount, removeBadPasswordAccount,
    getZambiaTime, TWENTY_FOUR_HOURS_MS, FREE_ACCOUNT_LOCK_THRESHOLD,
    LOCK_HOUR, LOCK_MINUTE, UNLOCK_HOUR, UNLOCK_MINUTE,
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

let poolLocked = false;
let poolLockedReason = '';

function pad(n) { return String(n).padStart(2, '0'); }

function checkLockStatus(hour, minute, freeCount) {
    const afterLock = hour > LOCK_HOUR || (hour === LOCK_HOUR && minute >= LOCK_MINUTE);
    const beforeUnlock = hour < UNLOCK_HOUR || (hour === UNLOCK_HOUR && minute < UNLOCK_MINUTE);
    const isLockedHours = afterLock && beforeUnlock;
    // Low account lock ONLY applies during working hours (08:00-18:00)
    // After 18:00, accounts are given out freely even if below 50
    const isLowAccounts = isLockedHours && freeCount <= FREE_ACCOUNT_LOCK_THRESHOLD;
    return { shouldLock: isLockedHours || isLowAccounts, isWorkingHours: !isLockedHours, isLowAccounts };
}

const IN_USE_TIMEOUT_MS = 5 * 60 * 60 * 1000;
const HEARTBEAT_SILENCE_TIMEOUT_MS = 10 * 60 * 60 * 1000;

// Auto-free after 24h
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

// Heartbeat timeout
setInterval(async () => {
    try {
        const accounts = await getAccounts();
        const now = Date.now();
        for (const acc of accounts) {
            if (acc.status === 'IN-USE' && !acc.logoutTime && acc.lastHeartbeat) {
                if (now - acc.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
                    const { hour, minute } = getZambiaTime();
                    await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: pad(hour) + ':' + pad(minute) + ' (tab closed)', inUseSince: null, tabId: null });
                }
            }
        }
    } catch(e) { console.error('heartbeat-check error:', e); }
}, 10 * 1000);

// 5h in-use and 10h silence timeout
setInterval(async () => {
    try {
        const accounts = await getAccounts();
        const now = Date.now();
        for (const acc of accounts) {
            if (acc.status === 'IN-USE' && !acc.logoutTime) {
                const { hour, minute } = getZambiaTime();
                const timeStr = pad(hour) + ':' + pad(minute);
                if (acc.inUseSince && now - acc.inUseSince > IN_USE_TIMEOUT_MS) {
                    await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (5h timeout)', inUseSince: null, tabId: null });
                    continue;
                }
                if (acc.lastHeartbeat && now - acc.lastHeartbeat > HEARTBEAT_SILENCE_TIMEOUT_MS) {
                    await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (10h no heartbeat)', inUseSince: null, tabId: null });
                }
            }
        }
    } catch(e) { console.error('timeout-check error:', e); }
}, 60 * 1000);

// Lock check
setInterval(async () => {
    try {
        const { hour, minute } = getZambiaTime();
        const accounts = await getAccounts();
        const freeCount = accounts.filter(a => a.status === 'FREE').length;
        const { shouldLock, isWorkingHours, isLowAccounts } = checkLockStatus(hour, minute, freeCount);
        if (shouldLock) {
            if (!poolLocked) {
                poolLocked = true;
                poolLockedReason = !isWorkingHours ? 'Locked at 08:00. Unlocks at 18:00.' : `Low accounts (${freeCount}). Locked until 18:00.`;
                console.log('Pool locked:', poolLockedReason);
            }
        } else {
            if (poolLocked) { poolLocked = false; poolLockedReason = ''; console.log('Pool unlocked.'); }
        }
    } catch(e) { console.error('lock-check error:', e); }
}, 10 * 1000);

// ── API ENDPOINTS ──────────────────────────────────────────────────────────

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
        if (poolLocked) return res.json({ success: false, error: `Pool locked. ${poolLockedReason}` });
        const { tabId } = req.body;
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

// ── VIEW PAGES ─────────────────────────────────────────────────────────────

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
        res.send(`<!DOCTYPE html><html><head><title>In Use</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#04060a;padding:20px;min-height:100vh}.page{background:#0d1117;border-radius:16px;max-width:520px;margin:0 auto;overflow:hidden}.ph{padding:16px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:12px}.back{background:#161b22;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:8px;font-size:12px;text-decoration:none}.pt{font-size:15px;font-weight:500;color:#e6edf3}.ps{font-size:11px;color:#4b5563}.sw{padding:14px 20px;border-bottom:1px solid #21262d}.si{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}.row{display:flex;align-items:center;padding:12px 20px;border-bottom:1px solid #161b22;gap:10px}.row:last-child{border-bottom:none}.rn{font-size:12px;color:#4b5563;width:26px}.ri{flex:1}.rp{font-size:14px;color:#e6edf3;font-weight:500}.rs{font-size:11px;margin-top:3px}.alive{color:#3fb950}.warn{color:#fbbf24}.dead{color:#f87171}.empty{padding:40px;text-align:center;color:#4b5563;font-size:13px}.hidden{display:none}</style></head><body><div class="page"><div class="ph"><a href="/" class="back">&#8592; Back</a><div><div class="pt">In Use</div><div class="ps">${list.length} accounts</div></div></div><div class="sw"><input class="si" placeholder="Search..." oninput="filterRows(this.value)"></div><div id="list">${rows}</div></div><script>function filterRows(q){document.querySelectorAll('.row').forEach(r=>{r.classList.toggle('hidden',q!==''&&!r.dataset.phone.includes(q));})}function updateHB(){fetch('/inuse-stats').then(r=>r.json()).then(data=>{data.forEach((a,i)=>{const el=document.getElementById('hb-'+i);if(!el)return;if(!a.lastHeartbeat){el.className='rs warn';el.textContent='Waiting for heartbeat'+(a.tabId?' — '+a.tabId:'');return;}const s=Math.floor((Date.now()-a.lastHeartbeat)/1000);if(s<5){el.className='rs alive';el.textContent='OK — '+s+'s ago'+(a.tabId?' — '+a.tabId:'');}else if(s<30){el.className='rs warn';el.textContent='Slow — '+s+'s ago'+(a.tabId?' — '+a.tabId:'');}else{el.className='rs dead';el.textContent='No heartbeat — '+s+'s ago'+(a.tabId?' — '+a.tabId:'');}});}).catch(()=>{})}setInterval(updateHB,1000);updateHB();</script></body></html>`);
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
    return `<!DOCTYPE html><html><head><title>${title}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:sans-serif;background:#04060a;padding:20px;min-height:100vh}.page{background:#0d1117;border-radius:16px;max-width:520px;margin:0 auto;overflow:hidden}.ph{padding:16px 20px;border-bottom:1px solid #21262d;display:flex;align-items:center;gap:12px}.back{background:#161b22;border:1px solid #30363d;color:#8b949e;padding:6px 12px;border-radius:8px;font-size:12px;text-decoration:none}.pt{font-size:15px;font-weight:500;color:#e6edf3}.ps{font-size:11px;color:#4b5563}.sw{padding:14px 20px;border-bottom:1px solid #21262d}.si{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}.row{display:flex;align-items:center;padding:12px 20px;border-bottom:1px solid #161b22;gap:10px}.row:last-child{border-bottom:none}.rn{font-size:12px;color:#4b5563;width:26px}.ri{flex:1}.rp{font-size:14px;color:#e6edf3;font-weight:500}.rs{font-size:11px;color:#4b5563;margin-top:2px}.rt{font-size:10px;color:#f87171;margin-top:2px}.rb{background:#2d0a0a;border:1px solid #7f1d1d;color:#f87171;padding:4px 10px;border-radius:6px;font-size:11px;cursor:pointer}.empty{padding:40px;text-align:center;color:#4b5563;font-size:13px}.hidden{display:none}.pm{position:fixed;inset:0;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:20px;z-index:100}.pb{background:#0d1117;border:1.5px solid #21262d;border-radius:16px;padding:28px 24px;width:100%;max-width:320px;text-align:center}.ptt{font-size:15px;font-weight:500;color:#e6edf3;margin-bottom:6px}.ps2{font-size:12px;color:#4b5563;margin-bottom:20px}.pi{width:100%;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:12px;border-radius:8px;font-size:16px;outline:none;text-align:center;letter-spacing:4px;margin-bottom:14px}.pr{display:flex;gap:10px}.pc{flex:1;background:#161b22;border:1px solid #30363d;color:#8b949e;padding:10px;border-radius:8px;font-size:13px;cursor:pointer}.pco{flex:1;background:#7f1d1d;border:none;color:#f87171;padding:10px;border-radius:8px;font-size:13px;cursor:pointer}.pe{color:#f87171;font-size:12px;margin-top:10px;display:none}</style></head><body><div class="page"><div class="ph"><a href="/" class="back">&#8592; Back</a><div><div class="pt">${title}</div><div class="ps">${subtitle}</div></div></div><div class="sw"><input class="si" placeholder="Search..." oninput="filterRows(this.value)"></div><div id="list">${rows}</div></div>${showRemove ? `<div class="pm" id="modal" style="display:none"><div class="pb"><div class="ptt">&#128274; Confirm</div><div class="ps2">Enter password to remove</div><input class="pi" id="pin" type="password" maxlength="10" placeholder="••••"><div class="pr"><button class="pc" onclick="closeModal()">Cancel</button><button class="pco" onclick="confirmRemove()">Remove</button></div><div class="pe" id="perr">Wrong password</div></div></div>` : ''}<script>let pending=null;function removeAccount(p){pending=p;document.getElementById('pin').value='';document.getElementById('perr').style.display='none';document.getElementById('modal').style.display='flex';}function closeModal(){pending=null;document.getElementById('modal').style.display='none';}function confirmRemove(){const pin=document.getElementById('pin').value.trim();fetch('/remove-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone:pending,pin})}).then(r=>r.json()).then(d=>{if(d.success){closeModal();document.querySelector('[data-phone="'+pending+'"]').remove();}else{document.getElementById('perr').style.display='block';}});}document.addEventListener('DOMContentLoaded',()=>{const pi=document.getElementById('pin');if(pi){pi.addEventListener('keydown',e=>{if(e.key==='Enter')confirmRemove();if(e.key==='Escape')closeModal();});}});function filterRows(q){document.querySelectorAll('.row').forEach(r=>{r.classList.toggle('hidden',q!==''&&!r.dataset.phone.includes(q));});}</script></body></html>`;
}

// ── MAIN DASHBOARD ─────────────────────────────────────────────────────────

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
    // ── Clock ──────────────────────────────────────────────────────
    function pad(n) { return String(n).padStart(2, '0'); }
    function zambiaTime() {
        var d = new Date(Date.now() + 2 * 3600000);
        return pad(d.getUTCHours()) + ':' + pad(d.getUTCMinutes()) + ':' + pad(d.getUTCSeconds());
    }
    setInterval(function() {
        document.getElementById('tick').textContent = zambiaTime() + ' CAT';
    }, 1000);
    document.getElementById('tick').textContent = zambiaTime() + ' CAT';

    // ── Stats polling ──────────────────────────────────────────────
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
                // Unlock countdown
                var now = new Date();
                var h = now.getUTCHours() + 2; // Zambia UTC+2
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

    // ── Add Account ────────────────────────────────────────────────
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

    // ── Alerts Panel ───────────────────────────────────────────────
    var BOX_SIZE = 30;
    var panelOpen = false;

    function parseId(tabId) {
        var m = tabId.match(/ID:\\s*(\\S+)\\s*\\(([^)]+)\\)/);
        if (m) return { id: m[1], phone: m[2].replace(/^\\+260/, '') };
        m = tabId.match(/ID:\\s*(\\S+)\\s+(\\S+)/);
        if (m) return { id: m[1], phone: m[2].replace(/^\\+260/, '') };
        return { id: tabId.replace(/^ID:\\s*/, ''), phone: '' };
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
            var saveBtn = full ? '<div style="display:flex;gap:8px;padding:10px 12px;background:#0d1117;">' +
                '<button onclick="saveIds(' + bi + ')" style="flex:1;background:#3b82f6;color:#fff;border:none;padding:10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">&#128203; Copy IDs</button>' +
                '<button onclick="saveAll(' + bi + ')" style="flex:1;background:#10b981;color:#fff;border:none;padding:10px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">&#128203; Copy IDs &amp; Numbers</button>' +
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
        var m = tabId.match(/ID:\\s*(\\S+)\\s*\\(([^)]+)\\)/);
        if (m) return { id: m[1], phone: m[2].replace(/^\\+260/, '') };
        m = tabId.match(/ID:\\s*(\\S+)\\s+(\\S+)/);
        if (m) return { id: m[1], phone: m[2].replace(/^\\+260/, '') };
        return { id: tabId.replace(/^ID:\\s*/, ''), phone: '' };
    }
    function saveIds(bi) {
        var box = _boxes[bi];
        if (!box) return;
        var text = 'BOX ' + (bi+1) + ' — IDs\n' + new Date().toLocaleString('en-GB') + '\n\n' +
            box.map(function(a, ri) {
                var p = parseIdForPrint(a.tabId);
                return (ri+1) + '. ' + p.id;
            }).join('\n');
        copyText(text, 'IDs copied!');
    }
    function saveAll(bi) {
        var box = _boxes[bi];
        if (!box) return;
        var text = 'BOX ' + (bi+1) + ' — IDs & Numbers\n' + new Date().toLocaleString('en-GB') + '\n\n' +
            box.map(function(a, ri) {
                var p = parseIdForPrint(a.tabId);
                return (ri+1) + '. ' + p.id + ' | ' + p.phone;
            }).join('\n');
        copyText(text, 'IDs & Numbers copied!');
    }
    function copyText(text, msg) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function() { alert(msg); }).catch(function() { fallbackCopy(text, msg); });
        } else { fallbackCopy(text, msg); }
    }
    function fallbackCopy(text, msg) {
        var ta = document.createElement('textarea');
        ta.value = text; ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.left = '0';
        ta.style.opacity = '0'; document.body.appendChild(ta);
        ta.focus(); ta.select();
        try { document.execCommand('copy'); alert(msg); } catch(e) { alert('Copy failed. Text:\n\n' + text); }
        document.body.removeChild(ta);
    }

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

initDB().then(async function() {
    const { hour, minute } = getZambiaTime();
    const accounts = await getAccounts();
    const freeCount = accounts.filter(a => a.status === 'FREE').length;
    const { shouldLock, isWorkingHours } = checkLockStatus(hour, minute, freeCount);
    if (shouldLock) {
        poolLocked = true;
        poolLockedReason = !isWorkingHours ? 'Locked at 08:00. Unlocks at 18:00.' : `Low accounts (${freeCount}). Locked until 18:00.`;
        console.log('Startup lock:', poolLockedReason);
    }
    app.listen(PORT, () => console.log('Pool Manager active on port ' + PORT + ' — Zambia Time (Africa/Lusaka)'));
}).catch(function(err) {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
});
