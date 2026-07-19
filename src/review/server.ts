import { createServer } from "node:http";
import { config } from "../config.js";
import { getLead, listLeads, setStatus } from "../queue/store.js";
import type { QueuedLead } from "../types.js";
import { publishLead } from "../luma/publish.js";

function esc(s: string | null): string {
  return (s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
}

function card(l: QueuedLead): string {
  const url = l.lumaUrl || l.otherUrl;
  return `
  <div class="card" data-id="${l.id}">
    <div class="conf">${(l.confidence * 100).toFixed(0)}%</div>
    <h3>${esc(l.title)}</h3>
    <p class="meta">${esc(l.startDate) || "no date"} · ${esc(l.location) || "no location"} · ${esc(l.host) || "no host"}</p>
    <p>${esc(l.description)}</p>
    ${url ? `<p><a href="${esc(url)}" target="_blank" rel="noopener">${esc(url)}</a></p>` : ""}
    <details><summary>source (${esc(l.sourceChat)})</summary><pre>${esc(l.sourceText)}</pre></details>
    <div class="actions">
      <button onclick="act(${l.id},'publish')">Approve + Publish to Luma</button>
      <button onclick="act(${l.id},'approve')">Approve only</button>
      <button class="rej" onclick="act(${l.id},'reject')">Reject</button>
    </div>
  </div>`;
}

function page(): string {
  const pending = listLeads("pending");
  return `<!doctype html><html><head><meta charset="utf-8"><title>THC Bot — Review</title>
  <style>
    body{font:15px/1.5 system-ui;margin:0;background:#0f1115;color:#e6e6e6}
    header{padding:16px 24px;background:#171a21;border-bottom:1px solid #262b36}
    main{max-width:820px;margin:0 auto;padding:24px}
    .card{position:relative;background:#171a21;border:1px solid #262b36;border-radius:12px;padding:16px 20px;margin:0 0 16px}
    .conf{position:absolute;top:16px;right:20px;font-weight:700;color:#7dd3fc}
    h3{margin:.2em 0}.meta{color:#8b93a7;font-size:13px;margin:.2em 0 .6em}
    a{color:#7dd3fc}pre{white-space:pre-wrap;background:#0f1115;padding:10px;border-radius:8px;font-size:12px}
    .actions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
    button{background:#2563eb;color:#fff;border:0;border-radius:8px;padding:8px 12px;cursor:pointer}
    button.rej{background:#3a3f4b}
    summary{cursor:pointer;color:#8b93a7}
  </style></head><body>
  <header><b>THC Bot</b> — ${pending.length} pending lead(s)</header>
  <main>${pending.map(card).join("") || "<p>Nothing pending. 🎉</p>"}</main>
  <script>
    async function act(id, action){
      const b = event.target; b.disabled = true; b.textContent = "…";
      const r = await fetch("/api/action", {method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({id,action})});
      const j = await r.json();
      if(j.ok){ document.querySelector('.card[data-id="'+id+'"]').remove(); }
      else { alert(j.error||"failed"); b.disabled=false; }
    }
  </script></body></html>`;
}

export function startReviewServer(): void {
  const server = createServer(async (req, res) => {
    if (req.method === "GET" && (req.url === "/" || req.url === "")) {
      res.writeHead(200, { "content-type": "text/html" });
      res.end(page());
      return;
    }
    if (req.method === "POST" && req.url === "/api/action") {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", async () => {
        try {
          const { id, action } = JSON.parse(body);
          const lead = getLead(Number(id));
          if (!lead) throw new Error("lead not found");
          if (action === "reject") setStatus(lead.id, "rejected");
          else if (action === "approve") setStatus(lead.id, "approved");
          else if (action === "publish") {
            setStatus(lead.id, "approved");
            const publishedUrl = await publishLead(lead);
            setStatus(lead.id, "published", publishedUrl);
          } else throw new Error("unknown action");
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: true }));
        } catch (e: any) {
          res.writeHead(200, { "content-type": "application/json" });
          res.end(JSON.stringify({ ok: false, error: String(e?.message || e) }));
        }
      });
      return;
    }
    res.writeHead(404);
    res.end("not found");
  });
  server.listen(config.reviewPort, () => {
    console.log(`Review dashboard: http://localhost:${config.reviewPort}`);
  });
}
