/**
 * An artifact opened on its own (its share link, « Ouvrir dans un onglet »): Agora's toolbar on top
 * (what it is, its version, copy the link, download, back into Agora for the people who can) and the
 * page under it, in a frame that loads it from `/s/<token>/raw`, sandboxed as everywhere else.
 */
import { randomBytes } from "node:crypto";
import { artifactKitCss } from "@agora/core";

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function artifactPage(a: { title: string; version: number; token: string; appPath: string | null }) {
  const nonce = randomBytes(16).toString("base64");
  const raw = `/s/${encodeURIComponent(a.token)}/raw`;
  const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(a.title)}</title>
<style>${artifactKitCss()}
html,body{height:100%}body{padding:0;display:flex;flex-direction:column;overflow:hidden}
.bar{display:flex;align-items:center;gap:12px;height:56px;flex-shrink:0;padding:0 16px;border-bottom:1px solid var(--border);background:var(--background)}
.tile{display:flex;align-items:center;justify-content:center;width:36px;height:36px;flex-shrink:0;border-radius:var(--radius);background:var(--muted);color:var(--muted-foreground)}
.what{min-width:0;flex:1}.what b{display:block;font-weight:500;font-size:.875rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.what span{display:block;font-size:.75rem;color:var(--muted-foreground)}
.actions{display:flex;align-items:center;gap:8px}
iframe{flex:1;width:100%;border:0;background:var(--background)}
@media (max-width:560px){.actions .wide{display:none}}
</style></head><body>
<header class="bar">
<span class="tile" aria-hidden="true"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m10 13-2 2 2 2"/><path d="m14 17 2-2-2-2"/></svg></span>
<div class="what"><b>${esc(a.title)}</b><span>Artefact, version ${a.version}</span></div>
<div class="actions">
<button class="ag-button ag-button-outline ag-button-sm" id="copy">Copier le lien</button>
<a class="ag-button ag-button-outline ag-button-sm wide" href="${raw}?download" download>Télécharger</a>
${a.appPath ? `<a class="ag-button ag-button-sm" href="${esc(a.appPath)}">Ouvrir dans Agora</a>` : ""}
</div>
</header>
<iframe src="${raw}" title="${esc(a.title)}" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads"></iframe>
<script nonce="${nonce}">const b=document.getElementById("copy");b.onclick=()=>navigator.clipboard.writeText(location.href).then(()=>{b.textContent="Lien copié";setTimeout(()=>b.textContent="Copier le lien",1500)})</script>
</body></html>`;
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; script-src 'nonce-${nonce}'; frame-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'none'; frame-ancestors 'self'`,
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "Cache-Control": "no-store",
    },
  });
}
