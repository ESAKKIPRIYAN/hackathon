/* ===== Ward Ledger — Supabase Connected shared.js ===== */

const SUPABASE_URL = 'https://fyyxtamoijkmhxtbwqiu.supabase.co/rest/v1/';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ5eXh0YW1vaWprbWh4dGJ3cWl1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzNDQwMTgsImV4cCI6MjEwNTkyMDAxOH0.NFEtYfFZ81UWBCD76Gn_jl68dfXfiuj7nLVIrF0i9pg';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const WARDS = ["Ward 1 — Anna Nagar", "Ward 2 — T Nagar", "Ward 3 — Adyar", "Ward 4 — Mylapore"];
const CHART_COLORS = ['var(--gold)', 'var(--teal)', '#8B8FD6', '#D68B70', '#6FBF9B'];

let proposals = [];
let voteLog = [];
let votedVoters = new Set();
let VOTER_ROLL = {};
let ADMIN_ROLL = {};

async function loadState() {
  try {
    const [{ data: pData }, { data: vLog }, { data: vRoll }, { data: aRoll }] = await Promise.all([
      db.from('proposals').select('*').order('id', { ascending: true }),
      db.from('vote_log').select('*').order('id', { ascending: true }),
      db.from('voter_roll').select('*'),
      db.from('admin_roll').select('*')
    ]);

    if (pData) proposals = pData.map(p => ({ id: p.id, ward: p.ward, name: p.name, desc: p.desc_text, budget: p.budget }));
    if (vLog) {
      voteLog = vLog.map(v => ({ proposalId: v.proposal_id, ward: v.ward, voterId: v.voter_id, ts: v.ts, prevHash: v.prev_hash, hash: v.hash }));
      votedVoters = new Set(vLog.map(v => v.voter_id));
    }
    if (vRoll) {
      VOTER_ROLL = {};
      vRoll.forEach(r => { VOTER_ROLL[r.voter_id] = { name: r.name, ward: r.ward }; });
    }
    if (aRoll) {
      ADMIN_ROLL = {};
      aRoll.forEach(r => { ADMIN_ROLL[r.admin_id] = { name: r.name, role: r.role }; });
    }
  } catch (err) {
    console.error('Error fetching data:', err);
  }
}

function subscribeToUpdates(onChange) {
  db.channel('db-changes')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals' }, async () => { await loadState(); onChange(); })
    .on('postgres_changes', { event: '*', schema: 'public', table: 'vote_log' }, async () => { await loadState(); onChange(); })
    .subscribe();
}

async function sha256(str) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function shortHash(h) { return h ? (h.slice(0, 6) + '…' + h.slice(-4)) : ''; }

async function castVote(proposalId, session) {
  if (!session || votedVoters.has(session.voterId)) return false;
  const prevHash = voteLog.length ? voteLog[voteLog.length - 1].hash : 'GENESIS-WARD-LEDGER';
  const entry = { proposalId, ward: session.ward, voterId: session.voterId, ts: Date.now() };
  const hash = await sha256(prevHash + JSON.stringify(entry));

  const { error } = await db.from('vote_log').insert({
    proposal_id: proposalId, ward: session.ward, voter_id: session.voterId, ts: entry.ts, prev_hash: prevHash, hash: hash
  });
  if (error) { alert('Voting failed.'); return false; }
  await loadState(); return true;
}

async function addProposal(name, desc, budget, ward) {
  const { error } = await db.from('proposals').insert({ name, desc_text: desc, budget, ward });
  if (error) { alert('Failed to post proposal.'); return; }
  await loadState();
}

async function verifyChain() {
  let prev = 'GENESIS-WARD-LEDGER';
  for (const e of voteLog) {
    const entry = { proposalId: e.proposalId, ward: e.ward, voterId: e.voterId, ts: e.ts };
    const h = await sha256(prev + JSON.stringify(entry));
    if (h !== e.hash || e.prevHash !== prev) return false;
    prev = e.hash;
  }
  return true;
}

const inr = n => '₹' + n.toLocaleString('en-IN');
const votesFor = pid => voteLog.filter(v => v.proposalId === pid).length;
const proposalsByWard = w => proposals.filter(p => p.ward === w);
function registeredCount(w) { return Object.values(VOTER_ROLL).filter(v => v.ward === w).length; }
function turnoutCount(w) { return [...votedVoters].filter(id => VOTER_ROLL[id] && VOTER_ROLL[id].ward === w).length; }

function renderResultsForWard(w) {
  const list = proposalsByWard(w);
  const registered = registeredCount(w);
  const turnout = turnoutCount(w);
  const turnoutHTML = `
    <div class="panel" style="margin-bottom:18px;">
      <div class="bar-row" style="margin-bottom:0;">
        <div class="bar-label"><span class="name">Turnout</span><span class="n">${turnout} of ${registered} registered</span></div>
        <div class="bar-track"><div class="bar-fill" style="width:${registered ? (turnout / registered * 100) : 0}%"></div></div>
      </div>
    </div>`;
  if (list.length === 0) return turnoutHTML + <div class="empty">No proposals yet.</div>;
  
  const counted = list.map(p => ({ ...p, votes: votesFor(p.id) }));
  const totalVotes = counted.reduce((s, p) => s + p.votes, 0);
  const maxVotes = Math.max(1, ...counted.map(p => p.votes));
  
  const bars = counted.map((p, i) => `
    <div class="bar-row">
      <div class="bar-label"><span class="name">${p.name}</span><span class="n">${p.votes} vote${p.votes === 1 ? '' : 's'}</span></div>
      <div class="bar-track"><div class="bar-fill ${i % 2 === 0 ? 'gold' : ''}" style="width:${(p.votes / maxVotes * 100)}%"></div></div>
    </div>`).join('');
    
  let donutHTML, legendHTML;
  if (totalVotes === 0) {
    donutHTML = <div class="donut" style="background:var(--panel-3)"></div>;
    legendHTML = <span style="color:var(--text-faint)">No votes cast yet.</span>;
  } else {
    let acc = 0; const stops = [];
    counted.forEach((p, i) => {
      const pct = p.votes / totalVotes * 100;
      const color = CHART_COLORS[i % CHART_COLORS.length];
      stops.push(${color} ${acc}% ${acc + pct}%);
      acc += pct;
    });
    donutHTML = <div class="donut" style="background:conic-gradient(${stops.join(',')})"></div>;
    legendHTML = counted.map((p, i) => {
      const pct = totalVotes ? (p.votes / totalVotes * 100) : 0;
      return <div><span class="swatch" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></span>${p.name} — ${pct.toFixed(0)}%</div>;
    }).join('');
  }
  return turnoutHTML + `
    <div class="panel"><h3 style="font-size:0.95rem; margin-bottom:14px;">Vote tally</h3>${bars}</div>
    <div class="panel">
      <h3 style="font-size:0.95rem; margin-bottom:14px;">Fund allocation</h3>
      <div class="allocation-donut">${donutHTML}<div class="donut-legend">${legendHTML}</div></div>
    </div>`;
}

async function renderLedgerPanel(scopeWard) {
  const rows = (scopeWard ? voteLog.filter(v => v.ward === scopeWard) : voteLog).slice(-8).reverse();
  const rowsHTML = rows.length ? rows.map(v => {
    const p = proposals.find(pp => pp.id === v.proposalId);
    return <tr><td>${new Date(v.ts).toLocaleTimeString()}</td><td>${p ? p.name : '—'}</td><td>${shortHash(v.prevHash)}</td><td>${shortHash(v.hash)}</td></tr>;
  }).join('') : <tr><td colspan="4">No votes yet.</td></tr>;
  return `
    <div class="panel">
      <div class="verify-row">
        <h3 style="font-size:0.95rem;">Vote ledger (SHA-256 chained)</h3>
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

async function runVerify() {
  const ok = await verifyChain();
  document.getElementById('verify-result').innerHTML = ok
    ? <div class="verify-badge">✓ Chain verified — ${voteLog.length} vote(s) intact</div>
    : <div class="verify-badge" style="color:var(--danger);">✗ Chain broken</div>;
}

function renderSyncNote() { return <span class="dot"></span> Live-synced with Supabase; }
