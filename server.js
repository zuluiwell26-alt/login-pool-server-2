const express = require('express');
const {
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
    REMOVE_PASSWORD,
    HEARTBEAT_TIMEOUT_MS,
    TIMEZONE,
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
    // Locked from 08:00 to 18:00, open from 18:00 to 08:00
    const afterLock = hour > LOCK_HOUR || (hour === LOCK_HOUR && minute >= LOCK_MINUTE);
    const beforeUnlock = hour < UNLOCK_HOUR || (hour === UNLOCK_HOUR && minute < UNLOCK_MINUTE);
    const isLockedHours = afterLock && beforeUnlock;
    const isLowAccounts = freeCount <= FREE_ACCOUNT_LOCK_THRESHOLD;
    return { shouldLock: isLockedHours || isLowAccounts, isWorkingHours: !isLockedHours, isLowAccounts };
}

const IN_USE_TIMEOUT_MS = 5 * 60 * 60 * 1000; // 5 hours
const HEARTBEAT_SILENCE_TIMEOUT_MS = 10 * 60 * 60 * 1000; // 10 hours

// Auto-free accounts after 24h — sets freed_at so claim order tracks it
setInterval(async () => {
    const accounts = await getAccounts();
    const now = Date.now();
    for (const acc of accounts) {
        if (acc.status === 'IN-USE' && acc.logoutTime && (now - acc.logoutTime >= TWENTY_FOUR_HOURS_MS)) {
            await updateAccount(acc.phone, { status: 'FREE', logoutTime: null, logoutTimeStr: null, lastHeartbeat: null, inUseSince: null, tabId: null, freedAt: now });
        }
    }
}, 60 * 1000);
setInterval(async () => {
    const accounts = await getAccounts();
    const now = Date.now();
    for (const acc of accounts) {
        if (acc.status === 'IN-USE' && !acc.logoutTime && acc.lastHeartbeat) {
            if (now - acc.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
                const { hour, minute } = getZambiaTime();
                const timeStr = pad(hour) + ':' + pad(minute);
                console.log(`Heartbeat lost for ${acc.phone}. Moving to waiting.`);
                await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (tab closed)', inUseSince: null, tabId: null });
            }
        }
    }
}, 10 * 1000);

// 5-hour in-use timeout and 10-hour heartbeat silence timeout
setInterval(async () => {
    const accounts = await getAccounts();
    const now = Date.now();
    for (const acc of accounts) {
        if (acc.status === 'IN-USE' && !acc.logoutTime) {
            const { hour, minute } = getZambiaTime();
            const timeStr = pad(hour) + ':' + pad(minute);
            if (acc.inUseSince && now - acc.inUseSince > IN_USE_TIMEOUT_MS) {
                console.log(`Account ${acc.phone} IN-USE for 5h. Moving to waiting.`);
                await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (5h timeout)', inUseSince: null, tabId: null });
                continue;
            }
            if (acc.lastHeartbeat && now - acc.lastHeartbeat > HEARTBEAT_SILENCE_TIMEOUT_MS) {
                console.log(`Account ${acc.phone} no heartbeat for 10h. Moving to waiting.`);
                await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (10h no heartbeat)', inUseSince: null, tabId: null });
            }
        }
    }
}, 60 * 1000);

// Pool lock check
setInterval(async () => {
    const { hour, minute } = getZambiaTime();
    const accounts = await getAccounts();
    const freeCount = accounts.filter(a => a.status === 'FREE').length;
    const { shouldLock, isWorkingHours, isLowAccounts } = checkLockStatus(hour, minute, freeCount);

    if (shouldLock) {
        if (!poolLocked) {
            poolLocked = true;
            poolLockedReason = !isWorkingHours
                ? 'Locked at 08:00. Unlocks at 18:00.'
                : `Free accounts reached ${freeCount}. Locked until 18:00.`;
            console.log(poolLockedReason);
        }
    } else {
        if (poolLocked) {
            poolLocked = false;
            poolLockedReason = '';
            console.log('Pool unlocked at 18:00.');
        }
    }
}, 10 * 1000);

app.get('/stats', async (req, res) => {
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

// Fired by navigator.sendBeacon the instant a tab actually closes (real close,
// not a connection drop). Moves the account straight to "Waiting 24h" right
// away instead of waiting for the heartbeat timeout to expire.
app.post('/tab-closed', express.text({ type: '*/*' }), async (req, res) => {
    try {
        let phone;
        if (typeof req.body === 'string') {
            const parsed = JSON.parse(req.body);
            phone = parsed.phone;
        } else if (req.body && req.body.phone) {
            phone = req.body.phone;
        }
        if (!phone) return res.json({ success: false, error: 'Phone required.' });

        const accounts = await getAccounts();
        const account = accounts.find(a => a.phone === phone);
        if (account && account.status === 'IN-USE' && !account.logoutTime) {
            const { hour, minute } = getZambiaTime();
            const timeStr = pad(hour) + ':' + pad(minute);
            console.log(`Tab closed signal received for ${phone}. Moving to waiting.`);
            await updateAccount(phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (tab closed)' });
        }
        res.json({ success: true });
    } catch (e) {
        console.error('tab-closed error:', e);
        res.json({ success: false });
    }
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
    const rowsHtml = rows.length
        ? rows.map((r, i) => `
            <div class="row" data-phone="${r.phone}">
                <div class="row-num">${i + 1}.</div>
                <div class="row-info">
                    <div class="row-phone">${r.display || r.phone}</div>
                    ${r.password ? `<div class="row-pass">${r.password}</div>` : ''}
                    ${r.reportedAt ? `<div class="row-time">&#9888; Reported at ${r.reportedAt}</div>` : ''}
                </div>
                ${type === 'free' || type === 'bad' ? `<button class="rm-btn" onclick="removeAccount('${r.phone}')">Remove</button>` : ''}
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
    <div id="list">${rowsHtml}</div>
</div>
<div class="pin-overlay" id="pin-modal" style="display:none;">
    <div class="pin-box">
        <div class="pin-title">&#128274; Confirm removal</div>
        <div class="pin-sub">Enter password to remove this account</div>
        <input class="pin-input" id="pin-input" type="password" maxlength="10" placeholder="••••">
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
    function confirmRemove(){
        const pin=document.getElementById('pin-input').value.trim();
        if(pin!=='1234'){document.getElementById('pin-err').style.display='block';document.getElementById('pin-input').value='';return;}
        const endpoint=listType==='bad'?'/remove-bad-password':'/remove-account';
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
    res.send(`<!DOCTYPE html>
<html>
<head>
    <title>Login Pool Manager</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        .four-boxes{display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:12px;margin-bottom:20px}
        .box{border-radius:16px;padding:20px 16px 16px;display:flex;flex-direction:column;min-width:0}
        .box-free{background:#0a1a0f;border:1.5px solid #1a4a27}
        .box-inuse{background:#080f1f;border:1.5px solid #1a2f55}
        .box-waiting{background:#120c22;border:1.5px solid #2e1f55}
        .box-bad{background:#1a0f0a;border:1.5px solid #4a1f0a}
        .box-label{font-size:10px;font-weight:500;letter-spacing:1px;text-transform:uppercase;margin-bottom:14px}
        .free-col{color:#3fb950}.inuse-col{color:#58a6ff}.waiting-col{color:#c4b5fd}.bad-col{color:#fb923c}
        .box-num{font-size:56px;font-weight:500;line-height:1;letter-spacing:-3px;margin-bottom:8px}
        .num-free{color:#3fb950}.num-inuse{color:#58a6ff}.num-waiting{color:#c4b5fd}.num-bad{color:#fb923c}
        .box-desc{font-size:11px;margin-bottom:16px;flex:1;line-height:1.4}
        .desc-free{color:#2a6e3a}.desc-inuse{color:#1e4a7a}.desc-waiting{color:#4a3080}.desc-bad{color:#7a3a10}
        .unlock-timer{font-size:15px;font-weight:500;color:#fff;margin-bottom:3px}
        .unlock-sub{font-size:10px;color:#4b1111;margin-bottom:12px}
        .view-btn{width:100%;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;padding:10px;border:none;background:#92400e;color:#fed7aa;text-decoration:none}
        .view-count{background:#fed7aa;color:#92400e;border-radius:20px;padding:1px 8px;font-size:11px;font-weight:700}
        .add-box{background:#0d1117;border:1.5px solid #21262d;border-radius:14px;padding:20px 24px;margin-bottom:20px}
        .add-title{font-size:13px;font-weight:500;color:#8b949e;margin-bottom:14px;letter-spacing:0.5px;text-transform:uppercase}
        .add-row{display:flex;gap:10px;flex-wrap:wrap}
        .add-input{flex:1;min-width:120px;background:#161b22;border:1px solid #30363d;color:#e6edf3;padding:10px 14px;border-radius:8px;font-size:13px;outline:none}
        .add-input::placeholder{color:#4b5563}
        .add-btn{background:#1a3a6e;border:none;color:#a8d0ff;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:500;cursor:pointer;white-space:nowrap}
        .footer{display:flex;justify-content:space-between;align-items:center;margin-top:16px}
        .tick{font-size:11px;color:#3fb950;font-family:monospace;opacity:0.7}
        .hint{font-size:10px;color:#252b35}
        .msg{font-size:12px;margin-top:10px;padding:8px 12px;border-radius:6px;display:none}
        .msg-ok{background:#0d4429;color:#3fb950}.msg-err{background:#4b1111;color:#f87171}
        @media(max-width:600px){.four-boxes{grid-template-columns:1fr 1fr}.box-num{font-size:44px}}
    </style>
</head>
<body>
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
                <div class="unlock-sub">Unlocks at 18:00 (Zambia)</div>
            </div>
            <a href="/view/free" class="view-btn">View <span class="view-count" id="cnt-free">${freeAccounts.length}</span></a>
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
    </div>
    <div class="add-box">
        <div class="add-title">&#43; Add account</div>
        <div class="add-row">
            <input class="add-input" id="inp-phone" placeholder="Phone number" type="text">
            <input class="add-input" id="inp-pass" placeholder="Password" type="text">
            <button class="add-btn" onclick="addAccount()">Add</button>
        </div>
        <div class="msg" id="add-msg"></div>
    </div>

    <!-- LOW BALANCE ID BOX PANEL -->
    <div style="margin-top:20px;">
        <div style="display:flex;gap:10px;margin-bottom:12px;">
            <button id="alerts-reveal-btn" onclick="showAlerts()" style="flex:1;background:#1e293b;color:#fff;border:none;padding:14px 16px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;">👁️ View IDs &amp; Numbers</button>
            <button onclick="clearAlerts()" style="background:#ef4444;color:#fff;border:none;padding:14px 20px;border-radius:12px;font-size:13px;font-weight:700;cursor:pointer;">🔄 Deposit / Clear</button>
        </div>
        <div id="alerts-panel" style="display:none;">
            <button onclick="hideAlerts()" style="width:100%;background:#0f172a;color:#fff;border:none;padding:12px 16px;border-radius:10px;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:14px;">🔒 Hide IDs &amp; Numbers</button>
            <div id="alerts-container"><div style="padding:20px;text-align:center;color:#4b5563;font-size:13px;">No low balance accounts yet...</div></div>
        </div>
    </div>

    <div class="footer">
        <span class="tick" id="tick">--:--:-- CAT</span>
        <span class="hint">Live data · Postgres · Zambia Time</span>
    </div>
</div>
<script>
    function pad(n){return String(n).padStart(2,'0')}
    function getZambiaTime(){
        return new Date().toLocaleTimeString('en-GB',{timeZone:'Africa/Lusaka',hour:'2-digit',minute:'2-digit',second:'2-digit'});
    }
    function update(){
        document.getElementById('tick').textContent=getZambiaTime()+' CAT';
        const cd=document.getElementById('unlock-countdown');
        if(cd&&document.getElementById('unlock-block').style.display!=='none'){
            const now=new Date();
            const unlock=new Date(now.toLocaleDateString('en-GB',{timeZone:'Africa/Lusaka'}).split('/').reverse().join('-')+'T18:00:00+02:00');
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
            document.getElementById('cnt-free').textContent=d.free;
            document.getElementById('cnt-inuse').textContent=d.inUse;
            document.getElementById('cnt-waiting').textContent=d.waiting;
            document.getElementById('cnt-bad').textContent=d.badPassword;
            const pill=document.getElementById('pill');
            pill.className=d.locked?'locked-pill':'live-pill';
            pill.innerHTML=d.locked?'<div class="lock-dot"></div> Locked':'<div class="live-dot"></div> Live';
            const freeBox=document.getElementById('free-box');
            const freeLabel=document.getElementById('free-label');
            const freeNum=document.getElementById('num-free');
            const freeDesc=document.getElementById('free-desc');
            const unlockBlock=document.getElementById('unlock-block');
            if(d.locked){
                freeBox.style.cssText='background:#1a0a0a;border:1.5px solid #7f1d1d;border-radius:16px;padding:20px 16px 16px;display:flex;flex-direction:column;min-width:0;';
                freeLabel.style.color='#f87171';freeLabel.innerHTML='&#128274; Free — Locked';
                freeNum.style.color='#f87171';freeDesc.style.color='#7f2020';freeDesc.textContent=d.reason;
                unlockBlock.style.display='block';
            } else {
                freeBox.style.cssText='background:#0a1a0f;border:1.5px solid #1a4a27;border-radius:16px;padding:20px 16px 16px;display:flex;flex-direction:column;min-width:0;';
                freeLabel.style.color='#3fb950';freeLabel.innerHTML='&#10003; Free';
                freeNum.style.color='#3fb950';freeDesc.style.color='#2a6e3a';freeDesc.textContent='Accounts ready';
                unlockBlock.style.display='none';
            }
        }).catch(()=>{});
    }
    function showMsg(text,ok){const el=document.getElementById('add-msg');el.textContent=text;el.className='msg '+(ok?'msg-ok':'msg-err');el.style.display='block';setTimeout(()=>el.style.display='none',3000);}
    function addAccount(){
        const phone=document.getElementById('inp-phone').value.trim();
        const password=document.getElementById('inp-pass').value.trim();
        if(!phone||!password){showMsg('Phone and password required',false);return;}
        fetch('/add-account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phone,password})})
        .then(r=>r.json()).then(d=>{
            if(d.success){showMsg('Account '+phone+' added!',true);document.getElementById('inp-phone').value='';document.getElementById('inp-pass').value='';refreshStats();}
            else{showMsg(d.error,false);}
        });
    }
    setInterval(update,1000);setInterval(refreshStats,1000);update();refreshStats();

    // ── ALERTS PANEL ─────────────────────────────────────────────
    const BOX_SIZE = 30;
    let _alertBoxes = [];

    function parseAlertId(tabId) {
        const match = tabId.match(/ID:\s*(\S+)\s*\(([^)]+)\)/);
        if (match) return { id: match[1], phone: match[2] };
        return { id: tabId, phone: '—' };
    }

    function renderAlerts(alerts) {
        const container = document.getElementById('alerts-container');
        if (!container) return;
        const unique = []; const seen = new Set();
        alerts.forEach(a => { if (!seen.has(a.tabId)) { seen.add(a.tabId); unique.push(a); } });
        if (unique.length === 0) {
            container.innerHTML = '<div style="padding:20px;text-align:center;color:#4b5563;font-size:13px;">No low balance accounts yet...</div>';
            _alertBoxes = []; return;
        }
        const boxes = [];
        for (let i = 0; i < unique.length; i += BOX_SIZE) boxes.push(unique.slice(i, i + BOX_SIZE));
        _alertBoxes = boxes;
        container.innerHTML = boxes.map((box, bi) => {
            const isFull = box.length >= BOX_SIZE;
            const rows = box.map((a, ri) => {
                const p = parseAlertId(a.tabId);
                return '<div style="display:flex;align-items:center;padding:10px 14px;border-bottom:1px solid #1a1a2e;gap:10px;">' +
                    '<div style="flex:1;display:flex;gap:10px;">' +
                    '<div style="background:#0d1117;border-radius:8px;padding:8px 14px;font-size:13px;font-weight:800;color:#e6edf3;">' + p.id + '</div>' +
                    '<div style="background:#0d1117;border-radius:8px;padding:8px 14px;font-size:12px;font-weight:600;color:#e6edf3;font-family:monospace;">' + p.phone + '</div>' +
                    '</div><div style="font-size:12px;font-weight:800;color:#4b5563;min-width:24px;text-align:right;">' + (ri + 1) + '</div></div>';
            }).join('');
            return '<div style="margin-bottom:16px;">' +
                '<div style="background:#0d1117;border-radius:14px 14px 0 0;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">' +
                '<div style="font-size:12px;font-weight:800;color:#f1f5f9;letter-spacing:2px;">⚠️ BOX ' + (bi + 1) + '</div>' +
                '<div style="font-size:11px;font-weight:700;background:' + (isFull ? '#ef4444' : '#1e293b') + ';color:' + (isFull ? '#fff' : '#94a3b8') + ';padding:4px 10px;border-radius:20px;">' + box.length + ' / ' + BOX_SIZE + (isFull ? ' • FULL' : '') + '</div>' +
                '</div><div style="background:#161b22;border-radius:0 0 14px 14px;overflow:hidden;">' + rows + '</div></div>';
        }).join('');
    }

    async function pollAlerts() {
        try {
            const res = await fetch('/alerts');
            const data = await res.json();
            renderAlerts(data);
        } catch(e) {}
        setTimeout(pollAlerts, 5000);
    }

    function showAlerts() {
        document.getElementById('alerts-reveal-btn').style.display = 'none';
        document.getElementById('alerts-panel').style.display = 'block';
        pollAlerts();
    }
    function hideAlerts() {
        document.getElementById('alerts-panel').style.display = 'none';
        document.getElementById('alerts-reveal-btn').style.display = 'flex';
    }

    function clearAlerts() {
        const pin = prompt('Enter PIN to clear alerts:');
        if (pin === null) return;
        if (pin === '1234') {
            fetch('/clear-alerts', { method: 'POST' })
            .then(() => { renderAlerts([]); alert('Alerts cleared!'); })
            .catch(() => alert('Error clearing alerts.'));
        } else { alert('❌ Wrong PIN'); }
    }
</script>
</body>
</html>`);
});

app.get('/view/free', async (req, res) => {
    const accounts = await getAccounts();
    const list = accounts
        .filter(a => a.status === 'FREE')
        .sort((a, b) => {
            if (a.freedAt && b.freedAt) return a.freedAt - b.freedAt;
            if (a.freedAt) return -1;
            if (b.freedAt) return 1;
            return 0;
        });
    res.send(listPage('Free Accounts', list.length + ' accounts ready', list, 'free'));
});

app.get('/view/inuse', async (req, res) => {
    const accounts = await getAccounts();
    const list = accounts
        .filter(a => a.status === 'IN-USE' && !a.logoutTime)
        .sort((a, b) => {
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
                if(!acc.lastHeartbeat){el.className='row-hb hb-warning';el.textContent='⚡ Waiting for first heartbeat...'+(acc.tabId?' — '+acc.tabId:'');return;}
                const elapsed=Date.now()-acc.lastHeartbeat;
                const s=Math.floor(elapsed/1000);
                if(elapsed<5000){el.className='row-hb hb-alive';el.textContent='● Heartbeat OK — '+s+'s ago'+(acc.tabId?' — '+acc.tabId:'');}
                else if(elapsed<30000){el.className='row-hb hb-warning';el.textContent='◐ Heartbeat slow — '+s+'s ago'+(acc.tabId?' — '+acc.tabId:'');}
                else{el.className='row-hb hb-dead';el.textContent='✕ No heartbeat — '+s+'s ago'+(acc.tabId?' — '+acc.tabId:'');}
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
        .sort((a, b) => a.freeAt - b.freeAt);
    res.send(waitingPage(list));
});

app.get('/view/bad', async (req, res) => {
    const badPasswordAccounts = await getBadPasswordAccounts();
    res.send(listPage('Bad Password', badPasswordAccounts.length + ' accounts with wrong password', badPasswordAccounts, 'bad'));
});

app.post('/wrong-password', async (req, res) => {
    const { phone } = req.body;
    if (!phone) return res.json({ success: false, error: 'Phone required.' });
    const { hour, minute } = getZambiaTime();
    const timeStr = pad(hour) + ':' + pad(minute);
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
    await addAccount(phone, password);
    res.json({ success: true });
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
    if (poolLocked) return res.json({ success: false, error: `Pool locked. ${poolLockedReason}` });
    const { tabId } = req.body;
    if (!tabId) return res.json({ success: false, error: 'Tab ID required. No account will be assigned without one.' });
    try {
        const { hour, minute } = getZambiaTime();
        const timeStr = pad(hour) + ':' + pad(minute);
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

app.get('/seed-all-accounts', async (req, res) => {
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
        ["760005417","12345QAZ"],
        ["760006384","12345QAZ"],
        ["760006979","12345QAZ"],
        ["760011793","12345QAZ"],
        ["760018356","12345QAZ"],
        ["760018443","12345QAZ"],
        ["760019219","12345QAZ"],
        ["760019593","12345QAZ"],
        ["760019659","12345QAZ"],
        ["760019672","12345QAZ"],
        ["760019724","12345QAZ"],
        ["760020761","12345QAZ"],
        ["760021261","12345QAZ"],
        ["760027905","12345QAZ"],
        ["760037246","12345QAZ"],
        ["760037688","12345QAZ"],
        ["760037719","12345QAZ"],
        ["760037866","12345QAZ"],
        ["760037870","12345QAZ"],
        ["760037894","12345QAZ"],
        ["760090381","12345QAZ"],
        ["760147665","12345QAZ"],
        ["760657413","12345QAZ"],
        ["760657444","12345QAZ"],
        ["760657485","12345QAZ"],
        ["760659322","12345QAZ"],
        ["760659465","12345QAZ"],
        ["760659523","12345QAZ"],
        ["760659538","12345QAZ"],
        ["760660688","12345QAZ"],
        ["760661063","12345QAZ"],
        ["760661938","12345QAZ"],
        ["760661967","12345QAZ"],
        ["760661985","12345QAZ"],
        ["760662019","12345QAZ"],
        ["760662341","12345QAZ"],
        ["760663865","12345QAZ"],
        ["760663943","12345QAZ"],
        ["760664195","12345QAZ"],
        ["760664794","12345QAZ"],
        ["760664839","12345QAZ"],
        ["760665432","12345QAZ"],
        ["760665836","12345QAZ"],
        ["760665870","12345QAZ"],
        ["760665895","12345QAZ"],
        ["760667647","12345QAZ"],
        ["760755695","12345QAZ"],
        ["760782061","12345QAZ"],
        ["761359385","12345QAZ"],
        ["761388412","12345QAZ"],
        ["761885193","12345QAZ"],
        ["761910389","12345QAZ"],
        ["762078529","12345QAZ"],
        ["762166792","12345QAZ"],
        ["762574897","12345QAZ"],
        ["762791005","12345QAZ"],
        ["762916225","12345QAZ"],
        ["762917321","12345QAZ"],
        ["763694621","12345QAZ"],
        ["763779153","12345QAZ"],
        ["763780710","12345QAZ"],
        ["763891249","12345QAZ"],
        ["763937843","12345QAZ"],
        ["764120868","12345QAZ"],
        ["764616688","12345QAZ"],
        ["764647217","12345QAZ"],
        ["764861091","12345QAZ"],
        ["764894316","12345QAZ"],
        ["764956251","12345QAZ"],
        ["765423849","12345QAZ"],
        ["766254182","12345QAZ"],
        ["766254841","12345QAZ"],
        ["766413159","12345QAZ"],
        ["766447125","12345QAZ"],
        ["766447339","12345QAZ"],
        ["766663001","12345QAZ"],
        ["767322451","12345QAZ"],
        ["767396659","12345QAZ"],
        ["767595312","12345QAZ"],
        ["768136503","12345QAZ"],
        ["768488312","12345QAZ"],
        ["768529129","12345QAZ"],
        ["768553584","12345QAZ"],
        ["768665792","12345QAZ"],
        ["768863243","12345QAZ"],
        ["768871987","12345QAZ"],
        ["769339547","12345QAZ"],
        ["769662639","12345QAZ"],
        ["769662803","12345QAZ"],
        ["769686705","12345QAZ"],
        ["771160063","12345QAZ"],
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
        ["960716610","12345QAZ"],
        ["960972806","12345QAZ"],
        ["960988569","12345QAZ"],
        ["961034483","12345QAZ"],
        ["961372854","12345QAZ"],
        ["961383265","12345QAZ"],
        ["961764617","12345QAZ"],
        ["961991985","12345QAZ"],
        ["962016579","12345QAZ"],
        ["962111939","12345QAZ"],
        ["962161072","12345QAZ"],
        ["962235914","12345QAZ"],
        ["962318925","12345QAZ"],
        ["962364393","12345QAZ"],
        ["962631331","12345QAZ"],
        ["962745448","12345QAZ"],
        ["962948516","12345QAZ"],
        ["962950253","12345QAZ"],
        ["962961844","12345QAZ"],
        ["963128044","12345QAZ"],
        ["963251380","12345QAZ"],
        ["963829652","12345QAZ"],
        ["963834140","12345QAZ"],
        ["963935918","12345QAZ"],
        ["963966578","12345QAZ"],
        ["963987862","12345QAZ"],
        ["964049301","12345QAZ"],
        ["964132474","12345QAZ"],
        ["964236202","12345QAZ"],
        ["964261215","12345QAZ"],
        ["964284022","12345QAZ"],
        ["964309212","12345QAZ"],
        ["964445696","12345QAZ"],
        ["964548589","12345QAZ"],
        ["964618834","12345QAZ"],
        ["965038856","12345QAZ"],
        ["965047269","12345QAZ"],
        ["965057534","12345QAZ"],
        ["965147328","12345QAZ"],
        ["965207347","12345QAZ"],
        ["965214710","12345QAZ"],
        ["965283630","12345QAZ"],
        ["965564865","12345QAZ"],
        ["965579054","12345QAZ"],
        ["965604772","12345QAZ"],
        ["965778603","12345QAZ"],
        ["965920178","12345QAZ"],
        ["965951517","12345QAZ"],
        ["966198792","12345QAZ"],
        ["966254536","12345QAZ"],
        ["966259941","12345QAZ"],
        ["966293099","12345QAZ"],
        ["967048567","12345QAZ"],
        ["967062046","12345QAZ"],
        ["967510378","12345QAZ"],
        ["967558582","12345QAZ"],
        ["967558654","12345QAZ"],
        ["967625186","12345QAZ"],
        ["967784998","12345QAZ"],
        ["967928877","12345QAZ"],
        ["967989484","12345QAZ"],
        ["968154162","12345QAZ"],
        ["968154474","12345QAZ"],
        ["968154974","12345QAZ"],
        ["968318486","12345QAZ"],
        ["968346879","12345QAZ"],
        ["968391108","12345QAZ"],
        ["968610588","12345QAZ"],
        ["968617020","12345QAZ"],
        ["968724129","12345QAZ"],
        ["968760741","12345QAZ"],
        ["968761547","12345QAZ"],
        ["968761667","12345QAZ"],
        ["968761768","12345QAZ"],
        ["968763119","12345QAZ"],
        ["968763398","12345QAZ"],
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
        ["969451826","12345QAZ"],
        ["969462871","12345QAZ"],
        ["969523598","12345QAZ"],
        ["969530530","12345QAZ"],
        ["969734371","12345QAZ"],
        ["969781048","12345QAZ"],
    ];
    try {
        const values = [];
        const placeholders = [];
        phoneList.forEach(([phone, password], i) => {
            placeholders.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
            values.push(phone, password);
        });
        const result = await pool.query(
            `INSERT INTO accounts (phone, password) VALUES ${placeholders.join(', ')} ON CONFLICT DO NOTHING RETURNING phone`,
            values
        );
        res.json({ success: true, message: `Seeded ${result.rowCount} new accounts. Total attempted: ${phoneList.length}` });
    } catch (e) {
        console.error('seed-all-accounts error:', e);
        res.json({ success: false, error: e.message });
    }
});
// Stores a low-balance ID alert from the balance monitor Tampermonkey script
app.post('/cashout', async (req, res) => {
    try {
        const { tabId, amount, timestamp } = req.body;
        if (!tabId || !tabId.startsWith('ID:')) return res.json({ ok: false, error: 'Invalid tabId' });
        await pool.query(
            `INSERT INTO alerts (tab_id, amount, timestamp) VALUES ($1, $2, $3)`,
            [tabId, amount || 0, timestamp || Date.now()]
        );
        console.log(`[ALERT] Low balance ID recorded: ${tabId}`);
        res.json({ ok: true });
    } catch (e) {
        console.error('cashout error:', e);
        res.status(500).json({ ok: false });
    }
});

// Clears all stored ID alert records (called by "Deposit / Clear" button)
app.post('/clear-alerts', async (req, res) => {
    try {
        await pool.query(`DELETE FROM alerts`);
        console.log('Alerts cleared.');
        res.json({ ok: true });
    } catch (e) {
        console.error('clear-alerts error:', e);
        res.status(500).json({ ok: false });
    }
});

// Returns all stored ID alert records for the dashboard panel
app.get('/alerts', async (req, res) => {
    try {
        const { rows } = await pool.query(`SELECT * FROM alerts ORDER BY id ASC`);
        res.json(rows.map(r => ({
            tabId: r.tab_id,
            amount: parseFloat(r.amount),
            timestamp: parseInt(r.timestamp)
        })));
    } catch (e) {
        console.error('alerts error:', e);
        res.status(500).json([]);
    }
});

app.post('/reset', async (req, res) => {
    await resetAllAccounts();
    poolLocked = false; poolLockedReason = '';
    res.json({ success: true });
});

initDB().then(async () => {
    const { hour, minute } = getZambiaTime();
    const accounts = await getAccounts();
    const freeCount = accounts.filter(a => a.status === 'FREE').length;
    const { shouldLock, isWorkingHours } = checkLockStatus(hour, minute, freeCount);
    if (shouldLock) {
        poolLocked = true;
        poolLockedReason = !isWorkingHours
            ? 'Locked at 08:00. Unlocks at 18:00.'
            : `Free accounts reached ${freeCount}. Locked until 18:00.`;
        console.log('Startup lock:', poolLockedReason);
    }
    app.listen(PORT, () => console.log(`Pool Manager active on port ${PORT} — Zambia Time (Africa/Lusaka)`));
}).catch(err => {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
});
