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
    LOW_ACCOUNT_LOCK_START_HOUR,
    LOW_ACCOUNT_LOCK_START_MINUTE,
    REMOVE_PASSWORD,
    HEARTBEAT_TIMEOUT_MS,
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
const ICON_192_B64 = "iVBORw0KGgoAAAANSUhEUgAAAMAAAADACAMAAABlApw1AAAA/1BMVEVSXWmhqaNrVSUgHhzXy12plTVec4Ta2923wYXOrzBkiJwfMEuFZSE5UmyryNJHLi+5vMD/4DU/QzoHCxYOFywVJkfipg8TITz+/v6EsMH82DQMER5ONC2DrsCZchC44+ncohApOVHPmBB0WRpxmKvzyCqOaBR8preNsrVWdotniJyGqrkyRVqmeRHqtRqUlZl1XCMyNjW4hxDp0UskJy8zSWPAjQ7tvSBFOBh+rsem0tvo6epYQiqw2+OZxdHExckAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAADay6DAAAAAQHRSTlP/////////////////////////////////////////////////////////////////////////////////////73leyQAACXFJREFUeNrt3QtX2kgUAOBJsFh8tN3NxAFGUhIgyEsEwXZF5f//q528yCTkOQ9kzvG25+xWEe+Xe+9kgrQB7YLYa02wtW0TmZUDmSgZkCfQxgZg+WNXkCPI+8SlBuzwWWrk7xtSAg6DEcQGLC/rAXYaML3UTZYQWQI/MDFAMNtVBuw020/e+/ZCCIgvfYz9Wmy0XTWAl36UhGkKEAgoACkBMaBlBcAekPSjb22yRnKW+QBGIDAwIcz3ZYCpN7Tc+YssAo4AnsEwmoWAS0Clz5V/SsDVQjHAE4DLfMCPa3H5p88IvDMQE+CvPIAGBeafrAFEUJzA0LIBovMXNgZJgCdYZgE0On0R+acIYoYgDO0Y8Ev08T8CIFElSAgiwCWSUACJAHyZAgAZ+cvrIWzYScAUykg/tRLxn4xpQZMG7BPHX5YA8W6rk7GnAJIaSBgAZwHsGDCTVwBBFcga42Al8gE2RFBS/jJ7aBMBNJn5C9lQ4Kwewv4JGQQFkJc/LRA7A0EJgJw9hGABzimB5gNAooOklgCJnGISXvbtHTpdBZDgHsI7Apg1EIRnD8gUeGMM5HeQCEFOBUgPgeQaJCV/IUOQsw7twB6qAMB5JdiDGaRHwFQNsARN+QUQcCbIBQAApO4j5E8xmEOEoLqAFUjsRE35ACQWsAEmlD8ClEDwqdiAAEEITwkQXAEMIITyh9iUNgMGOEn+8lro9AAkAfDVQl8tJKyFTtBBSGoF1NtKBACoOkDh7bT0ZRQhMW+d+JwWurb9uCYOeKIKiBPYWzC5Gg6H4/FwOAFb2wy+jRyA8B6yb5vDcecQvdl4ONnaXhmkA0QIrsEVyf7j9fX9/f1Hp9fr+Yrx1Lt4En0aCFtIaAm2kzHJ/v13EB9xIWbTW5PxRFYCEFkBuznsdF5/H+K10zt0Umc8sc+9AnPSPT/e4/zpChBBbzoX+ep0VgX4BNurxOH//ftHJxXDLWIpQAlAVAW2w85HfPjfXz/S6ZMiDLciF6FjABKTv7f+ePn2jggsgvz8MwDsAnsa9Y9/7HuHSNfAFl8BITWYRPm/dh46ibx7ScHUFF4BETUA496Hf/g/woR7w+nVZDKZeiflBGEGkHAA/09p5uH6Hy38s6m3A0LQvJ77Z2aeQT5JCzU7PW+Co/yHwA6eyts9mLfTWUIwqddExglaiKxAsw8v/+DwT+bBe96jXbTdTBRhvBXUQRSAk9DsEcB7ePx7ExulrsTIiNCCWiXAVYYY8r1jxR6GqQfpBfknroXNJt1F47mY/GkAVwlux95Ox186yTJpZ1xPQm+ZjaPGQlSUfy6grmBC7zlvUdb1MIyq5MeVKb4CHAIqN2+Jycjfe34wiwFjW3wFkgBUu4MOi3wwwOkfLJESTOMSzICQAqQAzGMQD2h2AcJvAKhzwQSJB7A30WQWTwBAZt6b7+fUFEyRiPwLATUIV6kOyvkbHHEPkceZIkbAOOpENsGQSsxG6QIcBGgSP258zb+PKAdUJFxTgOnRX4ajnp0G2DJaiLGL7CQAVQLMRXRQOaASoRAAuQC4NuC4BqgeoOjVaAaAUR9wXAT0aQAsCFBCyANAyA0wWAB1CSgHcPy8k86sHsBgBGQKcschBwBFADAjII/grfGp7PMAUAAAM1eggJARNYa4FgB/JgAKqEB5/kbJrpwFEH/lKozY06wFwJwVqC6gAVf/vulPun7zLRk6+eDbqnnqClQk0Fe7Wqs1GnX/6abin+5o1GppnYc6FTAEAFAFA325/p/WLYjv/9UAVMnfqHJlWpI96XUwqwvwLopX3EtQRUARAqKV/q118XDooMqAh4vWN33DW4DKgDzDSm+Nut1nJkC3O2rdrHiWoJqAQJGAvLX8vFgBJFoDrg6qAzgwUPgCDERvTpcX0O0PePKvD6A6Cq7WI37AyLlnnwAeAIknJwY8MAP6LkcB+AB6/zEEfI+W916UV3aQ5So6ZWvPwYf+3FnME8wPuItKcPFde+g8PGgXhfkTwYX24Mf3MP/RYybAME4EiATE8Hzx/PzcLQ3yuIuLwwNJ/p8MuPsz6rLHiDxBBqB6/gIA7ISRn34GAJ8YcHf3OBrVz/4x/OIjADZOBXiKACGiIoM87vGR+kqr7isRcgA+4tFnZEOCz/xJ5J4FqFUAwYDYQeIPHf5Hsh+dAtQZAFmAmmExLkDnCTBUByheAYzVrkC9BegsAYbKAMyQ/zkBmPI/IwBmGADZAGd983TjLpxSQIP1+HMCBsWA9dP9/c+f9/f6ol8KYM1fJsC5uQ9DX5cBGPtHKqC/uD+EW9hFFm6wHn+ZAMeNAYN1vxBgnCGgv6YAeuEgfwFkAfQD4EZJgHVYhQZWGcA4Q8CLZQ3CBnKtsiE2znEVWliWHhx/yypZRs8ScOeEANey1koC+i9uWIHi/M8WcNcPF1K3ZM93tgAnWEd/PjmKAg6boYWagHgz5KoJeDmcifUXiQDvH/eXA6C30xIBhiyA80Rtpx2ZAPYaFALW91QsJAIMzGwo3AtZb3EUX5LxArx/qYpNUARwFi4VhZshlx9gGEyCYoBFh3SAgRkM1QELyS10MIhchV7iKN7NuaIAtWdhIOilRXEAT1DDIAbQF1iBmoa/jgiAoxtiATWmwRVRgkVDLOCAqADYuNw16Ftc+ecAwl4qrUQDD9a8/cOXfyEgOjt4v/IEsFH8umdxrN2/2JAGoGvRwDiH0cAN3WUqg+PqDd70KwL8dgo2ff4SlfzdMHDj78B66ferlqLfdxYDEdlXB8RdFf3GOFYZnoEg3MWL4zj5DkIkn1+4g78NMdnXBsTDkfj/8D2G5D+EoQ8IZLF20rFYWIOBTlJvYFHJswJymgxTJ0IcYKJoRB8zhAcQ+3QSMjwtwPgCfAGUA2DVAVDt/DHYqA1AYKU2YAMUn2KgPmCpNmAJ9moD9qCt9DK08W5lpPQIEIDSQ+DdTGqn8mZi599QTeUO8m9ppy4guKWduutQeFNBdcc4uq3jTtEtNd5FdwZdqluA8Oaytor5r+jb+yq5DaJvsNxU8hyQuMW1avnb6ZuMK7YSHd1kvP1LuXNwCqDWjuKQPwVQ6WywbGcB2jP1jn8S0NaUuDTAdP5JQPtSgVPy6rKdD1DgfHCUcOrP7f38rE9f+3YZgKxG6FzTh8vjbDMA7Z12ltdoG23Xrgbw1qOzmwWgZWeaAyAL0vJ8fvaBwfIyL89cgN9KGrAR/MyTA4Y20DJbJ4r/Ae9a1iORLuIaAAAAAElFTkSuQmCC";
const ICON_512_B64 = "iVBORw0KGgoAAAANSUhEUgAAAgAAAAIACAMAAADDpiTIAAAA/1BMVEWeqJ5nVyjWqyNRXWmmz9nZ2typlTSGaSMeMEs7VG1TbYJHOhotJxjczFiOscC1wIdhg5eenV09QDa+w31tgnnAvmzfwDQHCxYOFywWJkfiphATITz+/v6EsMH81zQLEB5ONS3OlxC44+myhBKdcwyKZhbzyCp7pbcmOFHcog8rJhrptBpwmKtuVBhWd4yleQ80S2WOs7RnThiBrL1lh5pJY3knKSuv2+Ls0kfMx2wxQ1kzNzaYxNBLQyxmRyRojaEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAACnKtztAAAAQHRSTlP/////////////////////////////////////////////////////////////////////////////////////73leyQAAIdRJREFUeNrtnQt34jjShg0OwyWdTHr227UZ060wQHASAiRcppvc/v+/+iQZEwy2JduyrUsVp8/unOk0PdRTr94qScYaiI9Wy7LWvd7GXvp+36Ov6sILXxzhfr3kDW/r2/bG7llWq1VCsiyhf9rFar1Zdo4+4n49wZf/PQOu1Pk/CoRcH4Nw3ZITgOv1MvLRHmqxhuzrpQFh/l0H0Zfr96yWXACcJj8koL7IpAHKKABCzj6QKAgEAGDZXmz2ayegn4EABShAoQaE4dpW/QBc9GI/5pqzn8MHqKAAWAOO8h8wcF0nAK2178lY/REvoI0CuK4TuoDj2PZa9QDQsnZJH6kE2c+mAiq6gKPwC9iB3ABYvidx9WfTAFVU4NAHnFGwtaoFoJWQ/jp7/0QKdNKAmNzvw8upAlaupb+frP3y1H8WFVBGAVwnkQE3lxnIAYCV+nH25QvuVUDFPiCCgFUBANfJ4i9h/fNqgCqdQGwfcOwFLkoGoLVJ/yD7coZGGoBSNcBxNq0yAUhTf0nrXy8NQAwFyL4OZPndrV169cta/zppQMIkIDoWuCgFgJbNyL70BGigAel9QJ51gBuAls8qn77coYcGMPqAgwi0RAPA6P1kr39dfABi9gFZnQDn79uwql/2+ufVAAV8IIcLIGELBIAh/wrUvy4+4OxMQEpsW6IAsNiF01cjuHyA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";

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

let poolLocked = false;
let poolLockedReason = '';

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

// Pool lock logic for THIS service:
// 1. TIME LOCK: locked every day from LOCK_HOUR:LOCK_MINUTE (08:00) until
//    UNLOCK_HOUR:UNLOCK_MINUTE (18:00) - the opposite schedule from the
//    original login-pool-server, which locks overnight instead.
// 2. LOW ACCOUNT LOCK: from LOW_ACCOUNT_LOCK_START_HOUR:MINUTE (06:00)
//    onward, if free accounts are already at/under the threshold, lock
//    early - no point waiting for 08:00 if the pool is already thin.
setInterval(async () => {
    const { hour, minute } = getZambiaTime();
    const accounts = await getAccounts();
    const freeCount = accounts.filter(a => a.status === 'FREE').length;

    const nowMinutes = hour * 60 + minute;
    const lockStart = LOCK_HOUR * 60 + LOCK_MINUTE;     // 08:00
    const lockEnd = UNLOCK_HOUR * 60 + UNLOCK_MINUTE;   // 18:00
    const isTimeLocked = nowMinutes >= lockStart && nowMinutes < lockEnd;

    const lowLockStart = LOW_ACCOUNT_LOCK_START_HOUR * 60 + LOW_ACCOUNT_LOCK_START_MINUTE; // 06:00
    const afterLowLockTime = nowMinutes >= lowLockStart && nowMinutes < lockStart; // only the 06:00-08:00 window
    const isLowAccounts = afterLowLockTime && freeCount <= FREE_ACCOUNT_LOCK_THRESHOLD;

    if (isTimeLocked || isLowAccounts) {
        if (!poolLocked) {
            poolLocked = true;
            poolLockedReason = isTimeLocked
                ? `Locked at ${pad(LOCK_HOUR)}:${pad(LOCK_MINUTE)}. Unlocks at ${pad(UNLOCK_HOUR)}:${pad(UNLOCK_MINUTE)}.`
                : `Free accounts dropped to ${freeCount}. Locked early from ${pad(LOW_ACCOUNT_LOCK_START_HOUR)}:${pad(LOW_ACCOUNT_LOCK_START_MINUTE)}.`;
            console.log(poolLockedReason);
        }
    } else {
        if (poolLocked) {
            poolLocked = false;
            poolLockedReason = '';
            console.log('Pool unlocked.');
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
        reason: poolLockedReason,
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
    const showRemove = (type === 'free' || type === 'bad');
    const rowsHtml = rows.length
        ? rows.map((r, i) => `
            <div class="row" data-phone="${r.phone}">
                <div class="row-num">${i + 1}.</div>
                <div class="row-info">
                    <div class="row-phone">${r.display || r.phone}</div>
                    ${r.password ? `<div class="row-pass">${r.password}</div>` : ''}
                    ${r.reportedAt ? `<div class="row-time">&#9888; Reported at ${r.reportedAt}</div>` : ''}
                </div>
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
    <title>Login Pool Manager 2</title>
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
        .four-boxes{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
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
        .divider{height:1px;background:#1a1f2a;margin-bottom:20px}
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
    </style>
</head>
<body>
<div class="db">
    <div class="top-bar">
        <div class="db-title">&#128274; Login pool manager 2</div>
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
                <div class="unlock-sub">Unlocks at ${pad(UNLOCK_HOUR)}:${pad(UNLOCK_MINUTE)}</div>
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
        <span class="tick" id="tick">--:--:--</span>
        <span class="hint">Live data - Postgres</span>
    </div>
</div>
<script>
    function pad(n){return String(n).padStart(2,'0')}
    function update(){
        const now=new Date();
        document.getElementById('tick').textContent=pad(now.getHours())+':'+pad(now.getMinutes())+':'+pad(now.getSeconds());
        const cd=document.getElementById('unlock-countdown');
        if(cd&&document.getElementById('unlock-block').style.display!=='none'){
            const unlock=new Date();unlock.setHours(${UNLOCK_HOUR},${UNLOCK_MINUTE},0,0);
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
                freeLabel.style.color='#f87171';freeLabel.innerHTML='&#128274; Free - Locked';
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
            if (a.logoutTime && b.logoutTime) return b.logoutTime - a.logoutTime;
            if (a.logoutTime) return -1;
            if (b.logoutTime) return 1;
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
    if (poolLocked) {
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
                    console.log(`[LOCK] ${tabId} tried to request during lock - moved ${heldAccount.phone} to Waiting.`);
                }
            } catch(e) { console.error('lock-move error:', e); }
        }
        return res.json({ success: false, error: `Pool locked. ${poolLockedReason}` });
    }
    const { tabId } = req.body;
    if (!tabId) return res.json({ success: false, error: 'Tab ID required. No account will be assigned without one.' });
    try {
        const { hour, minute } = getZambiaTime();
        const timeStr = `${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}`;
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

app.post('/reset', async (req, res) => {
    await resetAllAccounts();
    poolLocked = false; poolLockedReason = '';
    res.json({ success: true });
});

// Start server after DB is ready
initDB().then(async () => {
    const { hour, minute } = getZambiaTime();
    const accounts = await getAccounts();
    const freeCount = accounts.filter(a => a.status === 'FREE').length;
    const nowMinutes = hour * 60 + minute;
    const lockStart = LOCK_HOUR * 60 + LOCK_MINUTE;
    const lockEnd = UNLOCK_HOUR * 60 + UNLOCK_MINUTE;
    const isTimeLocked = nowMinutes >= lockStart && nowMinutes < lockEnd;
    const lowLockStart = LOW_ACCOUNT_LOCK_START_HOUR * 60 + LOW_ACCOUNT_LOCK_START_MINUTE;
    const afterLowLockTime = nowMinutes >= lowLockStart && nowMinutes < lockStart;
    const isLowAccounts = afterLowLockTime && freeCount <= FREE_ACCOUNT_LOCK_THRESHOLD;
    if (isTimeLocked || isLowAccounts) {
        poolLocked = true;
        poolLockedReason = isTimeLocked
            ? `Locked at ${pad(LOCK_HOUR)}:${pad(LOCK_MINUTE)}. Unlocks at ${pad(UNLOCK_HOUR)}:${pad(UNLOCK_MINUTE)}.`
            : `Free accounts dropped to ${freeCount}. Locked early from ${pad(LOW_ACCOUNT_LOCK_START_HOUR)}:${pad(LOW_ACCOUNT_LOCK_START_MINUTE)}.`;
        console.log('Startup lock:', poolLockedReason);
    }
    app.listen(PORT, () => console.log(`Pool Manager 2 active on port ${PORT} - connected to Postgres`));
}).catch(err => {
    console.error('Failed to initialize DB:', err);
    process.exit(1);
});
