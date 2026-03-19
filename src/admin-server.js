const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { config } = require("./config");
const { initDb } = require("./db");
const { ingestWhatsAppInputs, ingestWhatsAppFile } = require("./whatsapp-parser");
const { draftDailyResultFromFile } = require("./daily-results");
const { draftInviteMessages, getContactDetail, getDashboardData, updateLeadStage, completeTask } = require("./operations");
const { ensureDir, slugify } = require("./utils");

function sendJson(res, value) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value, null, 2));
}

function sendHtml(res, value) {
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(value);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  return text ? JSON.parse(text) : {};
}

function pageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YSDB Personal Bot Admin</title>
  <style>
    :root { --bg:#f4efe2; --ink:#151515; --muted:#6b675d; --panel:#fff8ea; --panel-2:#f6ead2; --line:#d8c8a7; --green:#157f62; --amber:#a96a16; --red:#b7423a; --shadow:0 20px 45px rgba(73,45,5,.12); }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Georgia, "Segoe UI", sans-serif; color:var(--ink); background:
      radial-gradient(circle at top left, rgba(255,255,255,.5), transparent 28%),
      linear-gradient(160deg,#f7f0e3,#f4efe2 55%,#eadfc6); }
    .wrap { max-width:1320px; margin:0 auto; padding:30px 18px 56px; }
    .hero { display:grid; grid-template-columns:1.4fr .9fr; gap:16px; align-items:stretch; }
    .hero-main,.hero-side,.card { background:rgba(255,248,234,.92); border:1px solid var(--line); border-radius:24px; box-shadow:var(--shadow); }
    .hero-main { padding:26px; position:relative; overflow:hidden; }
    .hero-main:before { content:""; position:absolute; inset:auto -8% -35% auto; width:260px; height:260px; background:radial-gradient(circle, rgba(21,127,98,.18), transparent 65%); }
    .hero-side { padding:20px; display:grid; gap:14px; }
    h1 { margin:0 0 8px; font-size:38px; line-height:1; letter-spacing:-.03em; }
    .subtitle { margin:0; color:var(--muted); font-size:16px; max-width:720px; }
    .toolbar { margin-top:22px; display:flex; flex-wrap:wrap; gap:10px; }
    button { border:0; border-radius:999px; padding:11px 16px; font:600 14px/1 "Segoe UI", sans-serif; cursor:pointer; }
    .btn-primary { background:var(--ink); color:#fff; }
    .btn-soft { background:var(--panel-2); color:var(--ink); border:1px solid var(--line); }
    .status { padding:12px 14px; border-radius:16px; background:#fffdf8; border:1px dashed var(--line); color:var(--muted); min-height:48px; }
    .quicklist { display:grid; gap:10px; }
    .quickitem { padding:12px 14px; border-radius:16px; background:rgba(246,234,210,.66); border:1px solid var(--line); }
    .quickitem strong { display:block; font-size:12px; letter-spacing:.1em; text-transform:uppercase; color:var(--muted); margin-bottom:6px; }
    .quickitem textarea, .quickitem input { width:100%; margin-top:8px; border:1px solid var(--line); background:#fffdf8; border-radius:14px; padding:12px; font:14px/1.45 "Segoe UI", sans-serif; color:var(--ink); }
    .quickitem textarea { min-height:120px; resize:vertical; }
    .grid { display:grid; grid-template-columns:repeat(12,1fr); gap:16px; margin-top:18px; }
    .card { padding:18px; }
    .metrics { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; margin-top:18px; }
    .metric { background:#fffdf8; border:1px solid var(--line); border-radius:18px; padding:16px; }
    .metric-label { font-size:12px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin-bottom:10px; }
    .metric-value { font:700 30px/1 "Segoe UI", sans-serif; }
    .section-title { font-size:13px; letter-spacing:.14em; text-transform:uppercase; color:var(--muted); margin-bottom:14px; font-family:"Segoe UI", sans-serif; }
    table { width:100%; border-collapse:collapse; }
    th,td { text-align:left; padding:10px 8px; border-bottom:1px solid rgba(216,200,167,.7); vertical-align:top; }
    th { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); font-family:"Segoe UI", sans-serif; }
    td { font-size:14px; }
    tbody tr { cursor:pointer; }
    tbody tr:hover { background:rgba(246,234,210,.5); }
    .badge { display:inline-block; padding:4px 8px; border-radius:999px; font-size:12px; font-weight:700; }
    .hot_lead { background:rgba(183,66,58,.12); color:var(--red); }
    .warm_lead { background:rgba(169,106,22,.14); color:var(--amber); }
    .ib_candidate { background:rgba(21,127,98,.14); color:var(--green); }
    .cold, .new { background:rgba(107,103,93,.12); color:#6b675d; }
    pre { margin:0; white-space:pre-wrap; font-family:Consolas, monospace; font-size:13px; color:#2e2a23; }
    .muted { color:var(--muted); }
    .panel-left { grid-column:span 7; }
    .panel-right { grid-column:span 5; }
    .detail { display:grid; gap:14px; }
    .detail-box { background:#fffdf8; border:1px solid var(--line); border-radius:18px; padding:14px; }
    .stack { display:grid; gap:10px; }
    .message { padding:10px 12px; border-radius:14px; background:#fffdf8; border:1px solid var(--line); }
    .message.out { background:#f0f6ff; }
    .message-head { font:600 12px/1.3 "Segoe UI", sans-serif; color:var(--muted); margin-bottom:6px; }
    .footer-note { margin-top:16px; color:var(--muted); font-size:13px; }
    .inline-actions { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
    .tiny { padding:8px 12px; font-size:12px; }
    select { border:1px solid var(--line); border-radius:999px; padding:9px 12px; background:#fffdf8; font:600 13px/1 "Segoe UI", sans-serif; }
    @media (max-width: 1000px) {
      .hero { grid-template-columns:1fr; }
      .metrics { grid-template-columns:repeat(2,1fr); }
      .panel-left, .panel-right { grid-column:span 12; }
    }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hero">
      <section class="hero-main">
        <h1>Tony's Conversion Desk</h1>
        <p class="subtitle">A local sales cockpit for WhatsApp lead recovery, Telegram nurturing, and daily YSDB proof-based follow-up without living in terminal commands.</p>
        <div class="toolbar">
          <button class="btn-primary" onclick="runAction('ingest')">Ingest WhatsApp Chats</button>
          <button class="btn-soft" onclick="runAction('draftInvites')">Refresh Invite Drafts</button>
          <button class="btn-soft" onclick="runAction('draftResult')">Draft Today's Result</button>
          <button class="btn-soft" onclick="loadDashboard()">Refresh Board</button>
        </div>
        <div id="status" class="status" style="margin-top:16px;">Ready.</div>
        <div class="metrics" id="metrics"></div>
      </section>
      <aside class="hero-side">
        <div class="quickitem"><strong>What This Solves</strong>See warm leads, generate personal invite copy, and push good conversations into Telegram without working directly in code.</div>
        <div class="quickitem"><strong>Input Folders</strong><span id="paths"></span></div>
        <div class="quickitem">
          <strong>Paste WhatsApp Chat</strong>
          <input id="chat-name" placeholder="lead-name-or-date">
          <textarea id="chat-text" placeholder="Paste exported WhatsApp chat text here"></textarea>
          <div class="inline-actions"><button class="btn-soft tiny" onclick="submitChat()">Save + Ingest Chat</button></div>
        </div>
        <div class="quickitem">
          <strong>Paste Daily Result</strong>
          <textarea id="result-text" placeholder="Paste today's YSDB result text here"></textarea>
          <div class="inline-actions"><button class="btn-soft tiny" onclick="submitResult()">Save + Draft Result</button></div>
        </div>
      </aside>
    </div>
    <div id="app"></div>
    <div class="footer-note">Local only. Telegram sending still requires your bot token in <code>.env</code> and user opt-in.</div>
  </div>
  <script>
    let selectedLeadId = null;

    function fmt(num) {
      return Number(num || 0).toFixed(2);
    }

    function setStatus(text) {
      document.getElementById('status').textContent = text;
    }

    async function api(url, options = {}) {
      const res = await fetch(url, options);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    }

    function renderMetrics(data) {
      const hot = data.leads.filter(x => x.lead_stage === 'hot_lead').length;
      const warm = data.leads.filter(x => x.lead_stage === 'warm_lead').length;
      const ib = data.leads.filter(x => x.lead_stage === 'ib_candidate').length;
      document.getElementById('metrics').innerHTML = [
        ['Hot Leads', hot],
        ['Warm Leads', warm],
        ['IB Prospects', ib],
        ['Open Tasks', data.tasks.length]
      ].map(item => \`<div class="metric"><div class="metric-label">\${item[0]}</div><div class="metric-value">\${item[1]}</div></div>\`).join('');
    }

    async function loadDashboard() {
      setStatus('Loading dashboard...');
      const data = await api('/api/dashboard');
      const app = document.getElementById('app');
      renderMetrics(data);
      document.getElementById('paths').innerHTML = \`WhatsApp: <code>imports/whatsapp</code><br>Results: <code>imports/daily-results</code>\`;
      app.innerHTML = \`
        <div class="grid">
          <div class="card panel-left">
            <div class="section-title">Lead Board</div>
            <table>
              <thead><tr><th>Name</th><th>Stage</th><th>Interest</th><th>Reply</th><th>IB</th><th>Telegram</th></tr></thead>
              <tbody>
                \${data.leads.map(lead => \`<tr onclick="loadLead(\${lead.id})">
                  <td><strong>\${lead.name}</strong><div class="muted">\${lead.phone || ''}</div></td>
                  <td><span class="badge \${lead.lead_stage}">\${lead.lead_stage}</span></td>
                  <td>\${fmt(lead.trading_interest)}</td>
                  <td>\${fmt(lead.response_likelihood)}</td>
                  <td>\${fmt(lead.ib_candidate_score)}</td>
                  <td class="muted">\${lead.telegram_username ? '@' + lead.telegram_username : (lead.opted_in_telegram ? 'opted in' : 'not linked')}</td>
                </tr>\`).join('')}
              </tbody>
            </table>
          </div>
          <div class="card panel-right">
            <div class="section-title">Lead Detail</div>
            <div id="lead-detail" class="detail-box muted">Pick a lead from the board to review summary, chat lines, and invite drafts.</div>
          </div>
        </div>
        <div class="grid">
          <div class="card panel-left">
            <div class="section-title">Open Tasks</div>
            <table>
              <thead><tr><th>Lead</th><th>Priority</th><th>Title</th></tr></thead>
              <tbody>
                \${data.tasks.map(task => \`<tr><td>\${task.name || ''}</td><td>\${task.priority}</td><td>\${task.title}<div class="inline-actions"><button class="btn-soft tiny" onclick="completeTask(\${task.id})">Mark Done</button></div></td></tr>\`).join('')}
              </tbody>
            </table>
          </div>
          <div class="card panel-right">
            <div class="section-title">Latest Daily Result</div>
            \${data.latestResult ? \`<pre>\${data.latestResult.summary_text}\\n\\n\${data.latestResult.takeaway_text}\\n\\n\${data.latestResult.cta_text}</pre>\` : '<p class="muted">No result loaded yet.</p>'}
          </div>
        </div>
        <div class="grid">
          <div class="card panel-left">
            <div class="section-title">Invite Drafts</div>
            <table>
              <thead><tr><th>Lead</th><th>Message</th></tr></thead>
              <tbody>
                \${data.invites.map(item => \`<tr><td>\${item.name || ''}</td><td>\${item.body}</td></tr>\`).join('')}
              </tbody>
            </table>
          </div>
          <div class="card panel-right">
            <div class="section-title">How To Work Here</div>
            <div class="stack">
              <div class="detail-box">1. Paste a WhatsApp export into the chat box and save it directly from the browser.</div>
              <div class="detail-box">2. Review stages and refresh invite drafts.</div>
              <div class="detail-box">3. Paste today's YSDB result text into the result box and draft it in one click.</div>
              <div class="detail-box">4. Copy invite messages and send manually on WhatsApp, then continue on Telegram after opt-in.</div>
            </div>
          </div>
        </div>\`;
      if (selectedLeadId) loadLead(selectedLeadId);
      setStatus('Dashboard ready.');
    }

    async function runAction(action) {
      const labels = {
        ingest: 'Ingesting WhatsApp chats...',
        draftInvites: 'Refreshing invite drafts...',
        draftResult: 'Drafting daily result...'
      };
      setStatus(labels[action] || 'Working...');
      try {
        const result = await api('/api/actions/' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
        setStatus(JSON.stringify(result));
        await loadDashboard();
      } catch (error) {
        setStatus('Error: ' + error.message);
      }
    }

    async function loadLead(id) {
      selectedLeadId = id;
      const data = await api('/api/contact?id=' + id);
      const c = data.contact;
      document.getElementById('lead-detail').innerHTML = \`
        <div class="detail">
          <div class="detail-box">
            <strong>\${c.name}</strong><br>
            <span class="badge \${c.lead_stage}">\${c.lead_stage}</span>
            <div class="muted" style="margin-top:8px;">Interest \${fmt(c.trading_interest)} | Reply \${fmt(c.response_likelihood)} | IB \${fmt(c.ib_candidate_score)}</div>
            <div class="muted" style="margin-top:8px;">Objection: \${c.objection_summary || 'none'} | Telegram: \${c.telegram_username ? '@' + c.telegram_username : 'not linked'}</div>
            <div class="inline-actions">
              <select id="lead-stage-select" onchange="changeLeadStage(\${c.id}, this.value)">
                <option value="hot_lead" \${c.lead_stage === 'hot_lead' ? 'selected' : ''}>hot_lead</option>
                <option value="warm_lead" \${c.lead_stage === 'warm_lead' ? 'selected' : ''}>warm_lead</option>
                <option value="ib_candidate" \${c.lead_stage === 'ib_candidate' ? 'selected' : ''}>ib_candidate</option>
                <option value="cold" \${c.lead_stage === 'cold' ? 'selected' : ''}>cold</option>
              </select>
              <button class="btn-soft tiny" onclick="copyLatestDraft()">Copy Latest Draft</button>
            </div>
          </div>
          <div class="detail-box">
            <div class="section-title" style="margin-bottom:10px;">Conversation Summary</div>
            \${data.conversations.map(item => \`<div style="margin-bottom:10px;"><strong>\${item.source_file}</strong><div class="muted">\${item.summary || ''}</div></div>\`).join('') || '<div class="muted">No conversation summary yet.</div>'}
          </div>
          <div class="detail-box">
            <div class="section-title" style="margin-bottom:10px;">Recent Messages</div>
            <div class="stack">\${data.messages.map(msg => \`<div class="message \${msg.direction}"><div class="message-head">\${msg.sender_name} · \${msg.sent_at || ''}</div><div>\${msg.body}</div></div>\`).join('') || '<div class="muted">No messages.</div>'}</div>
          </div>
          <div class="detail-box">
            <div class="section-title" style="margin-bottom:10px;">Invite Drafts</div>
            <div class="stack">\${data.drafts.map((item, index) => \`<div class="message"><div class="message-head">\${item.created_at}</div><div data-draft-body="\${index === 0 ? 'latest' : 'older'}" data-copy="\${encodeURIComponent(item.body)}">\${item.body}</div><div class="inline-actions"><button class="btn-soft tiny" onclick="copyEncoded(this.parentNode.parentNode.querySelector('[data-copy]').dataset.copy)">Copy</button></div></div>\`).join('') || '<div class="muted">No drafts for this lead yet.</div>'}</div>
          </div>
        </div>\`;
    }

    async function submitChat() {
      const filename = document.getElementById('chat-name').value.trim();
      const content = document.getElementById('chat-text').value.trim();
      if (!content) {
        setStatus('Paste a WhatsApp chat first.');
        return;
      }
      setStatus('Saving and ingesting chat...');
      const result = await api('/api/actions/importChat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, content })
      });
      document.getElementById('chat-text').value = '';
      setStatus('Chat imported.');
      await loadDashboard();
      if (result.contactId) loadLead(result.contactId);
    }

    async function submitResult() {
      const content = document.getElementById('result-text').value.trim();
      if (!content) {
        setStatus('Paste a daily result first.');
        return;
      }
      setStatus('Saving and drafting daily result...');
      await api('/api/actions/saveResult', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      document.getElementById('result-text').value = '';
      setStatus('Daily result drafted.');
      await loadDashboard();
    }

    async function changeLeadStage(contactId, leadStage) {
      setStatus('Updating lead stage...');
      await api('/api/actions/stage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contactId, leadStage })
      });
      setStatus('Lead stage updated.');
      await loadDashboard();
      await loadLead(contactId);
    }

    async function copyText(value) {
      await navigator.clipboard.writeText(value);
      setStatus('Copied to clipboard.');
    }

    async function copyEncoded(value) {
      await copyText(decodeURIComponent(value));
    }

    async function copyLatestDraft() {
      const draftEl = document.querySelector('[data-draft-body="latest"]');
      if (!draftEl) {
        setStatus('No draft available to copy.');
        return;
      }
      await copyText(draftEl.textContent);
    }

    async function completeTask(taskId) {
      setStatus('Completing task...');
      await api('/api/actions/taskComplete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ taskId })
      });
      setStatus('Task completed.');
      await loadDashboard();
    }

    loadDashboard();
  </script>
</body>
</html>`;
}

function startServer() {
  initDb();
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const reqPath = url.pathname;
    if (reqPath === "/api/dashboard") {
      sendJson(res, getDashboardData());
      return;
    }
    if (reqPath === "/api/contact") {
      const id = Number(url.searchParams.get("id"));
      const detail = getContactDetail(id);
      if (!detail) {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Contact not found");
        return;
      }
      sendJson(res, detail);
      return;
    }
    if (req.method === "POST" && reqPath === "/api/actions/ingest") {
      sendJson(res, { ok: true, result: await ingestWhatsAppInputs() });
      return;
    }
    if (req.method === "POST" && reqPath === "/api/actions/importChat") {
      const body = await readJsonBody(req);
      ensureDir(config.whatsappImportsDir);
      const filename = `${slugify(body.filename || "chat") || "chat"}-${Date.now()}.txt`;
      const filePath = path.join(config.whatsappImportsDir, filename);
      fs.writeFileSync(filePath, String(body.content || ""), "utf8");
      const result = await ingestWhatsAppFile(filePath);
      const detail = result.imported ? getDashboardData().leads.find((lead) => lead.name === result.contactName) : null;
      sendJson(res, { ok: true, result, filePath, contactId: detail?.id || null });
      return;
    }
    if (req.method === "POST" && reqPath === "/api/actions/draftInvites") {
      sendJson(res, { ok: true, result: draftInviteMessages() });
      return;
    }
    if (req.method === "POST" && reqPath === "/api/actions/draftResult") {
      await readJsonBody(req);
      sendJson(res, { ok: true, result: await draftDailyResultFromFile() });
      return;
    }
    if (req.method === "POST" && reqPath === "/api/actions/saveResult") {
      const body = await readJsonBody(req);
      ensureDir(config.dailyResultsDir);
      const filePath = path.join(config.dailyResultsDir, "today.txt");
      fs.writeFileSync(filePath, String(body.content || ""), "utf8");
      sendJson(res, { ok: true, result: await draftDailyResultFromFile(filePath) });
      return;
    }
    if (req.method === "POST" && reqPath === "/api/actions/stage") {
      const body = await readJsonBody(req);
      sendJson(res, { ok: true, result: updateLeadStage(Number(body.contactId), String(body.leadStage || "warm_lead")) });
      return;
    }
    if (req.method === "POST" && reqPath === "/api/actions/taskComplete") {
      const body = await readJsonBody(req);
      sendJson(res, completeTask(Number(body.taskId)));
      return;
    }
    if (reqPath === "/") {
      sendHtml(res, pageHtml());
      return;
    }
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not found");
  });
  server.listen(config.adminPort, "127.0.0.1", () => {
    console.log(`Admin page: http://127.0.0.1:${config.adminPort}`);
  });
}

startServer();
