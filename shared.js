/* ===== Ward Ledger — shared data & logic (loaded by resident.html and admin.html) ===== */

const WARDS = ["Ward 1 — Anna Nagar","Ward 2 — T Nagar","Ward 3 — Adyar","Ward 4 — Mylapore"];

// Simulated electoral roll: voter ID -> registered name & ward.
// A resident's ward is looked up here, never self-selected.
const VOTER_ROLL = {
  "TN-0119284": {name:"Priya Raman", ward:WARDS[0]},
  "TN-0119285": {name:"Arjun Suresh", ward:WARDS[0]},
  "TN-0119286": {name:"Kavitha Nair", ward:WARDS[0]},
  "TN-0119287": {name:"Deepak Iyer", ward:WARDS[0]},
  "TN-0119288": {name:"Meena Krishnan", ward:WARDS[0]},
  "TN-0223391": {name:"Rahul Verma", ward:WARDS[1]},
  "TN-0223392": {name:"Sowmya Rangan", ward:WARDS[1]},
  "TN-0223393": {name:"Vignesh Kumar", ward:WARDS[1]},
  "TN-0223394": {name:"Anitha Bose", ward:WARDS[1]},
  "TN-0223395": {name:"Karthik Subramaniam", ward:WARDS[1]},
  "TN-0337712": {name:"Lakshmi Venkatesh", ward:WARDS[2]},
  "TN-0337713": {name:"Suresh Pillai", ward:WARDS[2]},
  "TN-0337714": {name:"Divya Shankar", ward:WARDS[2]},
  "TN-0337715": {name:"Naveen Raj", ward:WARDS[2]},
  "TN-0337716": {name:"Bhavani Murthy", ward:WARDS[2]},
  "TN-0448827": {name:"Ganesh Babu", ward:WARDS[3]},
  "TN-0448828": {name:"Revathi Chandran", ward:WARDS[3]},
  "TN-0448829": {name:"Manoj Sekar", ward:WARDS[3]},
  "TN-0448830": {name:"Swathi Ravi", ward:WARDS[3]},
  "TN-0448831": {name:"Vinoth Kannan", ward:WARDS[3]},
};

// Simulated municipal staff roll: admin ID -> registered officer.
const ADMIN_ROLL = {
  "MC-ADM-001": {name:"S. Kalaivani", role:"Ward Engineer"},
  "MC-ADM-002": {name:"R. Venkataraghavan", role:"Municipal Commissioner Office"},
  "MC-ADM-003": {name:"T. Preethi", role:"Budget Officer"},
};

const CHART_COLORS = ['var(--gold)','var(--teal)','#8B8FD6','#D68B70','#6FBF9B'];

/* ---------------- shared, persisted state ---------------- */
let proposals = [
  {id:1, ward:WARDS[0], name:"Anna Park Renovation", desc:"Resurface walking paths, repair fencing and add shaded seating in the community park.", budget:1200000},
  {id:2, ward:WARDS[0], name:"Street Light Upgrade", desc:"Replace 40 sodium-vapour lamps along the ward's residential lanes with LED fixtures.", budget:850000},
  {id:3, ward:WARDS[1], name:"Main Road Repair", desc:"Pothole repair and resurfacing of the 2km arterial stretch through the ward market.", budget:1500000},
  {id:4, ward:WARDS[1], name:"Public Toilet Block", desc:"Construct a new accessible public toilet block near the bus terminus.", budget:600000},
];
let nextId = 5;
let voteLog = [];            // {proposalId, ward, voterId, ts, prevHash, hash}
let votedVoters = new Set(); // voter IDs that have already voted (one vote per resident)

const STORAGE_KEY = 'wardLedgerState';

function loadState(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    if(raw){
      const s = JSON.parse(raw);
      if(s.proposals) proposals = s.proposals;
      if(typeof s.nextId === 'number') nextId = s.nextId;
      if(s.voteLog) voteLog = s.voteLog;
      if(s.votedVoters) votedVoters = new Set(s.votedVoters);
    } else {
      saveState(); // persist the initial seed so both pages start in sync
    }
  }catch(e){ console.warn('Ward Ledger: local storage unavailable, state will not sync across pages.', e); }
}

function saveState(){
  try{
    localStorage.setItem(STORAGE_KEY, JSON.stringify({proposals, nextId, voteLog, votedVoters:[...votedVoters]}));
  }catch(e){ console.warn('Ward Ledger: could not save state', e); }
}

let _channel = null;
// Call once per page with your render function; keeps this page in sync
// whenever the other page (opened from the same host) changes the data.
function subscribeToUpdates(onChange){
  try{
    _channel = new BroadcastChannel('ward-ledger');
    _channel.onmessage = () => { loadState(); onChange(); };
  }catch(e){ /* BroadcastChannel unsupported in this browser — storage event below still works */ }
  window.addEventListener('storage', e=>{
    if(e.key === STORAGE_KEY){ loadState(); onChange(); }
  });
}

function broadcastChange(){
  saveState();
  if(_channel){ try{ _channel.postMessage('update'); }catch(e){} }
}

/* ---------------- crypto chain ---------------- */
async function sha256(str){
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}
function shortHash(h){ return h ? (h.slice(0,6)+'…'+h.slice(-4)) : ''; }

async function castVote(proposalId, session){
  if(!session) return false;
  if(votedVoters.has(session.voterId)) return false;
  const prevHash = voteLog.length ? voteLog[voteLog.length-1].hash : 'GENESIS-WARD-LEDGER';
  const entry = {proposalId, ward:session.ward, voterId:session.voterId, ts:Date.now()};
  const hash = await sha256(prevHash + JSON.stringify(entry));
  voteLog.push({...entry, prevHash, hash});
  votedVoters.add(session.voterId);
  broadcastChange();
  return true;
}

async function verifyChain(){
  let prev = 'GENESIS-WARD-LEDGER';
  for(const e of voteLog){
    const entry = {proposalId:e.proposalId, ward:e.ward, voterId:e.voterId, ts:e.ts};
    const h = await sha256(prev + JSON.stringify(entry));
    if(h !== e.hash || e.prevHash !== prev) return false;
    prev = e.hash;
  }
  return true;
}

function addProposal(name, desc, budget, ward){
  proposals.push({id:nextId++, ward, name, desc, budget});
  broadcastChange();
}

/* ---------------- helpers ---------------- */
const inr = n => '₹' + n.toLocaleString('en-IN');
const votesFor = pid => voteLog.filter(v=>v.proposalId===pid).length;
const proposalsByWard = w => proposals.filter(p=>p.ward===w);
function registeredCount(w){ return Object.values(VOTER_ROLL).filter(v=>v.ward===w).length; }
function turnoutCount(w){ return [...votedVoters].filter(id=>VOTER_ROLL[id] && VOTER_ROLL[id].ward===w).length; }

/* ---------------- results panel (used by both pages) ---------------- */
function renderResultsForWard(w){
  const list = proposalsByWard(w);
  const registered = registeredCount(w);
  const turnout = turnoutCount(w);
  const turnoutHTML = `
    <div class="panel" style="margin-bottom:18px;">
      <div class="bar-row" style="margin-bottom:0;">
        <div class="bar-label"><span class="name">Turnout</span><span class="n">${turnout} of ${registered} registered residents</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${registered? (turnout/registered*100):0}%"></div></div>
      </div>
    </div>`;
  if(list.length===0) return turnoutHTML + `<div class="empty">No proposals to show results for.</div>`;
  const counted = list.map(p=>({...p, votes:votesFor(p.id)}));
  const totalVotes = counted.reduce((s,p)=>s+p.votes,0);
  const maxVotes = Math.max(1, ...counted.map(p=>p.votes));

  const bars = counted.map((p,i)=>`
    <div class="bar-row">
      <div class="bar-label"><span class="name">${p.name}</span><span class="n">${p.votes} vote${p.votes===1?'':'s'}</span></div>
      <div class="bar-track"><div class="bar-fill ${i%2===0?'gold':''}" style="width:${(p.votes/maxVotes*100)}%"></div></div>
    </div>`).join('');

  let donutHTML, legendHTML;
  if(totalVotes===0){
    donutHTML = `<div class="donut" style="background:var(--panel-3)"></div>`;
    legendHTML = `<span style="color:var(--text-faint)">No votes cast yet — allocation will update live.</span>`;
  } else {
    let acc=0; const stops=[];
    counted.forEach((p,i)=>{
      const pct = p.votes/totalVotes*100;
      const color = CHART_COLORS[i%CHART_COLORS.length];
      stops.push(`${color} ${acc}% ${acc+pct}%`);
      acc+=pct;
    });
    donutHTML = `<div class="donut" style="background:conic-gradient(${stops.join(',')})"></div>`;
    legendHTML = counted.map((p,i)=>{
      const pct = totalVotes? (p.votes/totalVotes*100):0;
      return `<div><span class="swatch" style="background:${CHART_COLORS[i%CHART_COLORS.length]}"></span>${p.name} — ${pct.toFixed(0)}% of votes</div>`;
    }).join('');
  }

  return turnoutHTML + `
    <div class="panel">
      <h3 style="font-size:0.95rem; margin-bottom:14px; color:var(--text-dim); font-family:'IBM Plex Sans'; font-weight:600;">Vote tally</h3>
      ${bars}
    </div>
    <div class="panel">
      <h3 style="font-size:0.95rem; margin-bottom:14px; color:var(--text-dim); font-family:'IBM Plex Sans'; font-weight:600;">Fund allocation by vote share</h3>
      <div class="allocation-donut">
        ${donutHTML}
        <div class="donut-legend">${legendHTML}</div>
      </div>
    </div>`;
}

async function renderLedgerPanel(scopeWard){
  const rows = (scopeWard ? voteLog.filter(v=>v.ward===scopeWard) : voteLog).slice(-8).reverse();
  const rowsHTML = rows.length ? rows.map(v=>{
    const p = proposals.find(pp=>pp.id===v.proposalId);
    return `<tr><td>${new Date(v.ts).toLocaleTimeString()}</td><td>${p?p.name:'—'}</td><td>${shortHash(v.prevHash)}</td><td>${shortHash(v.hash)}</td></tr>`;
  }).join('') : `<tr><td colspan="4" style="color:var(--text-faint); font-family:'IBM Plex Sans'">No votes recorded yet.</td></tr>`;

  return `
    <div class="panel">
      <div class="verify-row">
        <h3 style="font-size:0.95rem; color:var(--text-dim); font-family:'IBM Plex Sans'; font-weight:600;">Vote ledger (SHA-256 chained)</h3>
        <button class="btn-secondary" onclick="runVerify()">Verify integrity</button>
      </div>
      <div id="verify-result"></div>
      <div class="ledger-wrap">
        <table class="ledger-table">
          <thead><tr><th>Time</th><th>Proposal</th><th>Prev hash</th><th>Entry hash</th></tr></thead>
          <tbody>${rowsHTML}</tbody>
        </table>
      </div>
    </div>`;
}

async function runVerify(){
  const ok = await verifyChain();
  document.getElementById('verify-result').innerHTML = ok
    ? `<div class="verify-badge">✓ Chain verified — ${voteLog.length} vote${voteLog.length===1?'':'s'} intact</div>`
    : `<div class="verify-badge" style="background:rgba(193,85,58,0.18); color:var(--danger);">✗ Chain broken — tampering detected</div>`;
}

function renderSyncNote(){
  const supported = typeof BroadcastChannel !== 'undefined';
  document.getElementById('sync-note').classList.toggle('offline', !supported);
  return `<span class="dot"></span>${supported
    ? 'Live-synced with the other page when both are opened from the same host.'
    : 'This browser can\'t live-sync between pages — reload to see the other page\'s updates.'}`;
}
