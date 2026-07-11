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
    getWithdrawPool,
    removeWithdrawNumber,
    pickWithdrawNumber,
    requestAvailableNumber,
    markWithdrawnIfPicked,
    addAccountEverywhere,
    recycleWithdrawnToAvailable,
    finalizeStalePickedNumbers,
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

let poolLocked = false;
let poolLockedReason = '';
let withdrawLocked = false;
let withdrawLockedReason = '';

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

const HEARTBEAT_SILENCE_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours since LAST heartbeat → move to Waiting

// Two timeout checks run together every 60 seconds:
// 1. 5-hour in-use timeout — account has been IN-USE for 5h straight
// 2. 10-hour heartbeat silence — no heartbeat received for 10h straight
// Either condition moves the account to Waiting 24h.
setInterval(async () => {
    const accounts = await getAccounts();
    const now = Date.now();
    for (const acc of accounts) {
        if (acc.status === 'IN-USE' && !acc.logoutTime) {
            const { hour, minute } = getZambiaTime();
            const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;

            // Check: 3-hour heartbeat silence timeout
            // Only fires if at least one heartbeat was received AND
            // the last heartbeat was more than 3 hours ago.
            // If lastHeartbeat is null, the account never sent one — skip it.
            if (acc.lastHeartbeat && acc.lastHeartbeat > acc.inUseSince && now - acc.lastHeartbeat > HEARTBEAT_SILENCE_TIMEOUT_MS) {
                console.log(`Account ${acc.phone} last heartbeat was 3h+ ago. Moving to waiting.`);
                await updateAccount(acc.phone, { logoutTime: Date.now(), logoutTimeStr: timeStr + ' (3h no heartbeat)', inUseSince: null, tabId: null });
                continue;
            }
        }
    }
}, 60 * 1000);

// Two independent lock conditions — both can lock the pool:
// 1. TIME LOCK: 18:00 to 07:30 — pool always locked during these hours
// 2. LOW ACCOUNT LOCK: only from 16:00 onwards — if free < 50, lock
//    Before 14:30, free account count doesn't matter.
function getZambiaTime() {
    const zambiaStr = new Date().toLocaleString('en-GB', { timeZone: 'Africa/Lusaka' });
    const timePart = zambiaStr.split(', ')[1];
    const [h, m] = timePart.split(':').map(Number);
    return { hour: h, minute: m };
}

setInterval(async () => {
    const { hour, minute } = getZambiaTime();
    const accounts = await getAccounts();
    const freeCount = accounts.filter(a => a.status === 'FREE').length;

    // Time lock: 18:00 to 07:30
    const isTimeLocked = hour >= 18 || hour < 7 || (hour === 7 && minute < 30);

    // Low account lock: only from 16:00 onwards
    const afterLowLockTime = hour > LOW_ACCOUNT_LOCK_HOUR || (hour === LOW_ACCOUNT_LOCK_HOUR && minute >= LOW_ACCOUNT_LOCK_MINUTE);
    const isLowAccounts = afterLowLockTime && freeCount < FREE_ACCOUNT_LOCK_THRESHOLD;

    if (isTimeLocked || isLowAccounts) {
        if (!poolLocked) {
            poolLocked = true;
            poolLockedReason = isTimeLocked
                ? 'Locked at 18:00. Unlocks at 07:30.'
                : `Free accounts dropped to ${freeCount}. Locked from 16:00.`;
            console.log(poolLockedReason);

            // 1 hour after lock time (19:00), move ALL IN USE accounts to Waiting 24h
            // even if they never requested a new account
            if (isTimeLocked) {
                setTimeout(async () => {
                    try {
                        const latestAccounts = await getAccounts();
                        const inUseAccounts = latestAccounts.filter(a => a.status === 'IN-USE' && !a.logoutTime);
                        for (const acc of inUseAccounts) {
                            const { hour: h, minute: m } = getZambiaTime();
                            const timeStr = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
                            await updateAccount(acc.phone, {
                                logoutTime: Date.now(),
                                logoutTimeStr: timeStr + ' (19:00 auto)',
                                inUseSince: null,
                                tabId: null
                            });
                            console.log(`[LOCK 19:00] Moved ${acc.phone} to Waiting.`);
                        }
                    } catch(e) { console.error('19:00 auto-move error:', e); }
                }, 60 * 60 * 1000); // 1 hour after lock
            }
        }
    } else {
        if (poolLocked) {
            poolLocked = false;
            poolLockedReason = '';
            console.log('Pool unlocked.');
        }
    }
}, 10 * 1000);

// Withdraw-pool auto-recycle: whenever Available hits 0 (and there's
// something in Withdrawn to recycle), lock, then move every Withdrawn
// number back to Available. Next tick will see Available > 0 again and
// unlock automatically — a self-healing loop, not a permanent lock.
setInterval(async () => {
    try {
        const withdrawPool = await getWithdrawPool();
        const availableCount = withdrawPool.filter(w => w.status === 'AVAILABLE').length;
        const withdrawnCount = withdrawPool.filter(w => w.status === 'WITHDRAWN').length;

        if (availableCount === 0 && withdrawnCount > 0) {
            withdrawLocked = true;
            withdrawLockedReason = `Available reached 0 — recycling ${withdrawnCount} withdrawn number(s) back to Available.`;
            console.log(withdrawLockedReason);
            await recycleWithdrawnToAvailable();
        } else {
            if (withdrawLocked) {
                withdrawLocked = false;
                withdrawLockedReason = '';
                console.log('Withdraw pool unlocked — numbers available again.');
            }
        }
    } catch (e) {
        console.error('withdraw-recycle error:', e);
    }
}, 30 * 1000);

// Safety net: numbers stuck in 'PICKED' for 5+ minutes without a logout
// get finalized to 'WITHDRAWN' automatically, so nothing sits invisibly
// between Available and Withdrawn forever.
setInterval(async () => {
    try {
        const result = await finalizeStalePickedNumbers();
        if (result.finalized > 0) {
            console.log(`[PICKED timeout] Finalized ${result.finalized} stale picked number(s) to Withdrawn.`);
        }
    } catch (e) {
        console.error('finalize-stale-picked error:', e);
    }
}, 60 * 1000);

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
        withdrawLocked: withdrawLocked,
        withdrawLockedReason: withdrawLockedReason
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
                <div class="unlock-sub">Unlocks at 07:30</div>
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
        <div class="box box-available">
            <div class="box-label available-col">&#128230; Available</div>
            <div class="box-num num-available" id="num-available">${availableAccounts.length}</div>
            <div class="box-desc desc-available" id="available-desc">${withdrawLocked ? withdrawLockedReason : 'Ready to be withdrawn'}</div>
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
        <span class="hint">Live data · Postgres</span>
    </div>
</div>
<script>
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
            const availDesc=document.getElementById('available-desc');
            if(availDesc){availDesc.textContent=d.withdrawLocked?d.withdrawLockedReason:'Ready to be withdrawn';}
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
            // Accounts with a logout_time were previously used — sort those
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
                if(!acc.lastHeartbeat){el.className='row-hb hb-warning';el.textContent='⚡ Waiting for first heartbeat...'+(acc.tabId?' — '+acc.tabId:'');return;}
                const elapsed=Date.now()-acc.lastHeartbeat;
                const s=Math.floor(elapsed/1000);
                var tab=acc.tabId?' — '+acc.tabId:'';
                if(elapsed<5000){el.className='row-hb hb-alive';el.textContent='● Heartbeat OK'+tab;}
                else if(elapsed<60000){el.className='row-hb hb-warning';el.textContent='◐ '+s+' seconds no heartbeat'+tab;}
                else if(elapsed<3600000){var mins=Math.floor(elapsed/60000);el.className='row-hb hb-warning';el.textContent='◐ '+mins+(mins===1?' minute':' minutes')+' no heartbeat'+tab;}
                else{var hrs=Math.floor(elapsed/3600000);var remMins=Math.floor((elapsed%3600000)/60000);var hrStr=hrs+(hrs===1?' hour':' hours');var minStr=remMins>0?' '+remMins+(remMins===1?' minute':' minutes'):'';el.className='row-hb hb-dead';el.textContent='✕ '+hrStr+minStr+' no heartbeat'+tab;}
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
    // in one transaction — this is the only way accounts get added now.
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
// just hands back the oldest AVAILABLE number and marks it PICKED.
// Only touches withdraw_pool — Free/In-Use/Waiting are untouched.
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
    if (poolLocked) {
        // If this tab currently holds an account, move it to Waiting 24h
        const { tabId } = req.body;
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
                    console.log(`[LOCK] ${tabId} tried to request during lock — moved ${heldAccount.phone} to Waiting.`);
                }
            } catch(e) { console.error('lock-move error:', e); }
        }
        return res.json({ success: false, error: `Pool locked. ${poolLockedReason}` });
    }
    const { tabId } = req.body;
    // Reject any request that doesn't include a tab ID — every tab must
    // identify itself so the server can track account ownership correctly.
    if (!tabId) return res.json({ success: false, error: 'Tab ID required. No account will be assigned without one.' });
    try {
        const { hour, minute } = getZambiaTime();
        const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
        // Single transaction: moves old account to Waiting (if any) and
        // claims a new one in one round-trip — no delay between steps.
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
        // This is the ONLY place a logout can move a picked withdraw number
        // to Withdrawn — a genuine, manual logout through this route.
        // Automatic/system logouts (19:00 lock, idle timeout, re-login bump)
        // never call this, by design.
        await markWithdrawnIfPicked(phone);
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

app.post('/reset', async (req, res) => {
    await resetAllAccounts();
    poolLocked = false; poolLockedReason = '';
    res.json({ success: true });
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
    if (isTimeLocked || isLowAccounts) {
        poolLocked = true;
        poolLockedReason = isTimeLocked
            ? 'Locked at 18:00. Unlocks at 07:30.'
            : `Free accounts dropped to ${freeCount}. Locked from 16:00.`;
        console.log('Startup lock:', poolLockedReason);
    }
    app.listen(PORT, () => console.log(`Pool Manager active on port ${PORT} — connected to Postgres`));
}).catch(err => {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
});
