const express = require('express');
const {
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

// Auto-free accounts after 24h
setInterval(async () => {
    const accounts = await getAccounts();
    const now = Date.now();
    for (const acc of accounts) {
        if (acc.status === 'IN-USE' && acc.logoutTime && (now - acc.logoutTime >= TWENTY_FOUR_HOURS_MS)) {
            await updateAccount(acc.phone, { status: 'FREE', logoutTime: null, logoutTimeStr: null, lastHeartbeat: null });
        }
    }
}, 60 * 1000);

// Heartbeat timeout check
setInterval(async () => {
    const accounts = await getAccounts();
    const now = Date.now();
    for (const acc of accounts) {
        if (acc.status === 'IN-USE' && !acc.logoutTime && acc.lastHeartbeat) {
            if (now - acc.lastHeartbeat > HEARTBEAT_TIMEOUT_MS) {
                const { hour, minute } = getZambiaTime();
                const timeStr = pad(hour) + ':' + pad(minute);
                console.log(`Heartbeat lost for ${acc.phone}. Moving to waiting.`);
                await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (tab closed)' });
            }
        }
    }
}, 10 * 1000);

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
        .map(a => ({ phone: a.phone, lastHeartbeat: a.lastHeartbeat }));
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
</script>
</body>
</html>`);
});

app.get('/view/free', async (req, res) => {
    const accounts = await getAccounts();
    const list = accounts.filter(a => a.status === 'FREE');
    res.send(listPage('Free Accounts', list.length + ' accounts ready', list, 'free'));
});

app.get('/view/inuse', async (req, res) => {
    const accounts = await getAccounts();
    const list = accounts.filter(a => a.status === 'IN-USE' && !a.logoutTime);
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
                if(!acc.lastHeartbeat){el.className='row-hb hb-warning';el.textContent='⚡ Waiting for first heartbeat...';return;}
                const elapsed=Date.now()-acc.lastHeartbeat;
                const s=Math.floor(elapsed/1000);
                if(elapsed<5000){el.className='row-hb hb-alive';el.textContent='● Heartbeat OK — '+s+'s ago';}
                else if(elapsed<30000){el.className='row-hb hb-warning';el.textContent='◐ Heartbeat slow — '+s+'s ago';}
                else{el.className='row-hb hb-dead';el.textContent='✕ No heartbeat — '+s+'s ago';}
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
        .map(a => ({ phone: a.phone, freeAt: a.logoutTime + TWENTY_FOUR_HOURS_MS, logoutTimeStr: a.logoutTimeStr }));
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
    const accounts = await getAccounts();
    const available = accounts.find(a => a.status === 'FREE');
    if (available) {
        await updateAccount(available.phone, { status: 'IN-USE', logoutTime: null, logoutTimeStr: null, lastHeartbeat: Date.now() });
        return res.json({ success: true, phone: available.phone, password: available.password });
    }
    return res.json({ success: false, error: 'No free accounts available' });
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
        await updateAccount(phone, { logoutTime: Date.now(), logoutTimeStr: logoutTime, lastHeartbeat: null });
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
        ["769341931","12345QAZ"],["764970746","12345QAZ"],["969950228","12345QAZ"],
        ["963060339","12345QAZ"],["760663789","12345QAZ"],["969594643","12345QAZ"],
        ["760021383","12345QAZ"],["760659551","12345QAZ"],["964708601","12345QAZ"],
        ["968760277","12345QAZ"],["760019591","12345QAZ"],["968651969","12345QAZ"],
        ["764164912","12345QAZ"],["760664025","12345QAZ"],["766330133","12345QAZ"],
        ["760661980","12345QAZ"],["760037797","12345QAZ"],["968760637","12345QAZ"],
        ["760020788","12345QAZ"],["760663289","12345QAZ"],["963436308","12345QAZ"],
        ["771955649","12345QAZ"],["760667659","12345QAZ"],["761409130","12345QAZ"],
        ["760018595","12345QAZ"],["968617422","12345QAZ"],["967941470","12345QAZ"],
        ["968760381","12345QAZ"],["966877147","12345QAZ"],["760891376","12345QAZ"],
        ["967049603","12345QAZ"],["960700340","12345QAZ"],["760661194","12345QAZ"],
        ["968155185","12345QAZ"],["963533297","12345QAZ"],["967558578","12345QAZ"],
        ["963912256","12345QAZ"],["968763426","12345QAZ"],["760583293","12345QAZ"],
        ["962726590","12345QAZ"],["763568073","12345QAZ"],["760666109","12345QAZ"],
        ["760006202","12345QAZ"],["763023299","12345QAZ"],["965764761","12345QAZ"],
        ["968154435","12345QAZ"],["760020756","12345QAZ"],["764939812","12345QAZ"],
        ["761518509","12345QAZ"],["965471815","12345QAZ"],["966175242","12345QAZ"],
        ["760019654","12345QAZ"],["964807585","12345QAZ"],["965205922","12345QAZ"],
        ["965311647","12345QAZ"],["760005574","12345QAZ"],["962244843","12345QAZ"],
        ["760247262","12345QAZ"],["760006984","12345QAZ"],["962375823","12345QAZ"],
        ["760956348","12345QAZ"],["760021086","12345QAZ"],["760006873","12345QAZ"],
        ["765423136","12345QAZ"],["764889476","12345QAZ"],["763953726","12345QAZ"],
        ["762088489","12345QAZ"],["969403257","12345QAZ"],["763587210","12345QAZ"],
        ["966390327","12345QAZ"],["760664826","12345QAZ"],["960660484","12345QAZ"],
        ["760020814","12345QAZ"],["760227578","12345QAZ"],["769385258","12345QAZ"],
        ["962055080","12345QAZ"],["966925797","12345QAZ"],["960597218","12345QAZ"],
        ["968625930","12345QAZ"],["760005186","12345QAZ"],["760933213","12345QAZ"],
        ["760019189","12345QAZ"],["966468427","12345QAZ"],["960731698","12345QAZ"],
        ["968542617","12345QAZ"],["964053903","12345QAZ"],["969534706","12345QAZ"],
        ["968724386","12345QAZ"],["768454129","12345QAZ"],["768404417","12345QAZ"],
        ["965580916","12345QAZ"],["764964762","12345QAZ"],
    ];
    let added = 0;
    for (const [phone, password] of phoneList) {
        const existing = await getAccounts();
        if (!existing.find(a => a.phone === phone)) {
            await addAccount(phone, password);
            added++;
        }
    }
    res.json({ success: true, message: `Seeded ${added} new accounts. Total attempted: ${phoneList.length}` });
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
