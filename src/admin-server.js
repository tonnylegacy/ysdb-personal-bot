const http = require("node:http");
const path = require("node:path");
const fs = require("node:fs");
const { config } = require("./config");
const { initDb, getDb } = require("./db");

function sendJson(res, value) {
  res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value, null, 2));
}

function getDashboardData() {
  const db = getDb();
  return {
    leads: db.prepare(`
      SELECT id, name, phone, lead_stage, trading_interest, response_likelihood, ib_candidate_score, last_engagement_at
      FROM contacts
      WHERE contact_key NOT LIKE 'telegram:%'
      ORDER BY CASE lead_stage WHEN 'hot_lead' THEN 1 WHEN 'warm_lead' THEN 2 WHEN 'ib_candidate' THEN 3 ELSE 4 END,
               response_likelihood DESC
    `).all(),
    tasks: db.prepare(`
      SELECT t.id, c.name, t.type, t.priority, t.title, t.details, t.status
      FROM tasks t LEFT JOIN contacts c ON c.id = t.contact_id
      WHERE t.status = 'open'
      ORDER BY t.priority ASC, t.id DESC
    `).all(),
    invites: db.prepare(`
      SELECT om.id, c.name, om.channel, om.message_type, om.status, om.body, om.created_at
      FROM outbound_messages om LEFT JOIN contacts c ON c.id = om.contact_id
      WHERE om.message_type = 'invite_draft'
      ORDER BY om.id DESC LIMIT 30
    `).all(),
    latestResult: db.prepare("SELECT * FROM daily_results ORDER BY result_date DESC LIMIT 1").get()
  };
}

function pageHtml() {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>YSDB Personal Bot Admin</title>
  <style>
    :root { --bg:#0d1321; --card:#111a2d; --soft:#1b2846; --text:#f2f5ff; --muted:#97a5c6; --accent:#4fd1c5; --warm:#ffb454; --hot:#ff6b6b; }
    * { box-sizing:border-box; }
    body { margin:0; font-family:Segoe UI, sans-serif; background:linear-gradient(160deg,#0a1020,#10192d 60%,#0f2744); color:var(--text); }
    .wrap { max-width:1180px; margin:0 auto; padding:32px 20px 48px; }
    h1 { margin:0 0 8px; font-size:32px; }
    p { margin:0; color:var(--muted); }
    .grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:16px; margin-top:24px; }
    .card { background:rgba(17,26,45,.92); border:1px solid rgba(151,165,198,.15); border-radius:18px; padding:18px; box-shadow:0 18px 40px rgba(0,0,0,.25); }
    .section-title { font-size:14px; letter-spacing:.12em; text-transform:uppercase; color:var(--muted); margin-bottom:14px; }
    .metric { font-size:28px; font-weight:700; }
    table { width:100%; border-collapse:collapse; }
    th,td { text-align:left; padding:10px 8px; border-bottom:1px solid rgba(151,165,198,.12); vertical-align:top; }
    th { font-size:12px; letter-spacing:.08em; text-transform:uppercase; color:var(--muted); }
    td { font-size:14px; }
    .badge { display:inline-block; padding:4px 8px; border-radius:999px; font-size:12px; font-weight:700; }
    .hot_lead { background:rgba(255,107,107,.16); color:#ff9090; }
    .warm_lead { background:rgba(255,180,84,.16); color:#ffd18a; }
    .ib_candidate { background:rgba(79,209,197,.16); color:#7ce7de; }
    .cold, .new { background:rgba(151,165,198,.12); color:#bcc8e6; }
    pre { margin:0; white-space:pre-wrap; font-family:Consolas, monospace; font-size:13px; color:#d7def5; }
    .muted { color:var(--muted); }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>YSDB Personal Bot Admin</h1>
    <p>Local dashboard for leads, tasks, invite drafts, and daily result prep.</p>
    <div id="app"></div>
  </div>
  <script>
    async function load() {
      const res = await fetch('/api/dashboard');
      const data = await res.json();
      const app = document.getElementById('app');
      const hot = data.leads.filter(x => x.lead_stage === 'hot_lead').length;
      const warm = data.leads.filter(x => x.lead_stage === 'warm_lead').length;
      const ib = data.leads.filter(x => x.lead_stage === 'ib_candidate').length;
      app.innerHTML = \`
        <div class="grid">
          <div class="card"><div class="section-title">Hot Leads</div><div class="metric">\${hot}</div></div>
          <div class="card"><div class="section-title">Warm Leads</div><div class="metric">\${warm}</div></div>
          <div class="card"><div class="section-title">IB Prospects</div><div class="metric">\${ib}</div></div>
          <div class="card"><div class="section-title">Open Tasks</div><div class="metric">\${data.tasks.length}</div></div>
        </div>
        <div class="grid">
          <div class="card" style="grid-column:span 2;">
            <div class="section-title">Lead Board</div>
            <table>
              <thead><tr><th>Name</th><th>Stage</th><th>Interest</th><th>Reply</th><th>IB</th><th>Last Engagement</th></tr></thead>
              <tbody>
                \${data.leads.map(lead => \`<tr>
                  <td>\${lead.name}</td>
                  <td><span class="badge \${lead.lead_stage}">\${lead.lead_stage}</span></td>
                  <td>\${Number(lead.trading_interest).toFixed(2)}</td>
                  <td>\${Number(lead.response_likelihood).toFixed(2)}</td>
                  <td>\${Number(lead.ib_candidate_score).toFixed(2)}</td>
                  <td class="muted">\${lead.last_engagement_at || ''}</td>
                </tr>\`).join('')}
              </tbody>
            </table>
          </div>
          <div class="card">
            <div class="section-title">Latest Daily Result</div>
            \${data.latestResult ? \`<pre>\${data.latestResult.summary_text}\\n\\n\${data.latestResult.takeaway_text}\\n\\n\${data.latestResult.cta_text}</pre>\` : '<p class="muted">No result loaded yet.</p>'}
          </div>
        </div>
        <div class="grid">
          <div class="card">
            <div class="section-title">Open Tasks</div>
            <table>
              <thead><tr><th>Lead</th><th>Priority</th><th>Title</th></tr></thead>
              <tbody>
                \${data.tasks.map(task => \`<tr><td>\${task.name || ''}</td><td>\${task.priority}</td><td>\${task.title}</td></tr>\`).join('')}
              </tbody>
            </table>
          </div>
          <div class="card">
            <div class="section-title">Invite Drafts</div>
            <table>
              <thead><tr><th>Lead</th><th>Message</th></tr></thead>
              <tbody>
                \${data.invites.map(item => \`<tr><td>\${item.name || ''}</td><td>\${item.body}</td></tr>\`).join('')}
              </tbody>
            </table>
          </div>
        </div>\`;
    }
    load();
  </script>
</body>
</html>`;
}

function startServer() {
  initDb();
  const server = http.createServer((req, res) => {
    const reqPath = new URL(req.url, "http://127.0.0.1").pathname;
    if (reqPath === "/api/dashboard") {
      sendJson(res, getDashboardData());
      return;
    }
    if (reqPath === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(pageHtml());
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
