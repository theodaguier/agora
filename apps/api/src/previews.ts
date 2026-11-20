/**
 * Artifacts written by a bot in an ```artifact block (@agora/core previews.ts; ```preview still reads).
 * The app renders them while they stream; at the end of the reply each becomes an HTML file of the
 * conversation (shown with the message and in its files, downloadable, readable by the bots' file
 * tools) and the next version of the artifact its slug names (artifacts.ts), which can be shared.
 */
import { eq } from "drizzle-orm";
import { artifactSlug, previewFileName, type LivePreview, type PreviewRef } from "@agora/core";
import { ARTIFACT_SCRIPT_HOSTS, recordVersion } from "./artifacts";
import { MAX_FILE, storeAttachment } from "./attachments";
import { db, schema } from "./db";
import { env } from "./env";
import { agentAuthor, postMessage } from "./messages";

/** How an artifact page is written, whoever writes it: a bot in its reply, a code session in a file. */
export const ARTIFACT_PAGE_RULES = [
  `- One self-contained file. JavaScript runs once the page is complete (scripts inside the page, or libraries from ${ARTIFACT_SCRIPT_HOSTS.join(", ")} with an exact version). Nothing else is loaded: no other script host. Images, stylesheets and fonts over \`https://\` display; \`fetch\` to a public https API works, without cookies or access to the app.`,
  "- The design is Agora's and comes automatically: the page receives the app's stylesheet (Geist font, colours, the person's light or dark theme). Write no colour, font, shadow or background: your CSS only does layout (grids, widths, spacing). Headings, paragraphs, inputs, selects, buttons and HTML tables are already styled.",
  "- Agora components, as classes: `ag-page` (centred column), `ag-header` (h1 + grey p), `ag-card` with `ag-card-header` (+ `ag-bordered`), `ag-card-title`, `ag-card-description`, `ag-card-action`, `ag-card-footer`; `ag-stat` with `ag-stat-label`, `ag-stat-value`, `ag-stat-note`; `ag-grid`, `ag-row`, `ag-stack`; buttons `ag-button` (+ `ag-button-outline`, `ag-button-secondary`, `ag-button-ghost`, `ag-button-destructive`, `ag-button-sm`); `ag-badge` (+ `ag-badge-outline`, `ag-dot`); `ag-tabs` (buttons with `aria-selected`); `ag-progress`; text `ag-muted`, `ag-subtle`, `ag-mono`, `ag-tabular`; meaning `ag-success`, `ag-warning`, `ag-danger`, `ag-brand`.",
  "- Colours in JavaScript (charts): read the CSS variables (`getComputedStyle(document.documentElement).getPropertyValue('--chart-2')`, `--foreground`, `--muted-foreground`, `--border`, `--brand`, `--success`). Data uses ink levels (`--chart-1` to `--chart-5`); colour only carries meaning.",
  "- Start from the matching template, without inventing a layout:",
  '  · Dashboard: `<main class="ag-page"><header class="ag-header"><h1>Title</h1><p>Period, unit</p></header><div class="ag-grid"><div class="ag-card"><div class="ag-stat"><span class="ag-stat-label">Label</span><span class="ag-stat-value">Value</span><span class="ag-stat-note">Comparison</span></div></div>…</div><div class="ag-card"><div class="ag-card-header ag-bordered"><div class="ag-card-title">Chart</div><div class="ag-card-description">Unit</div></div><div style="position:relative;height:240px"><canvas></canvas></div></div><div class="ag-card"><table>…</table></div></main>`',
  '  · Tool or calculator: `<main class="ag-page"><header class="ag-header">…</header><div class="ag-card"><div class="ag-card-header ag-bordered"><div class="ag-card-title">Settings</div></div><div class="fields"><label>Name<input></label><label>Choice<select>…</select></label></div><div class="ag-card-footer"><span class="ag-muted">Summary</span><button>Action</button></div></div><div class="ag-grid">results as ag-stat</div></main>` (`.fields{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px}`)',
  '  · Document or report: `<main class="ag-page" style="max-width:720px"><header class="ag-header"><h1>…</h1><p>Author, date</p></header><section class="ag-stack"><h2>…</h2><p>…</p><table>…</table></section></main>`: bare headings, paragraphs and tables, no card around each section.',
  "- One primary action per card (solid `button`); the others `ag-button-outline` or `ag-button-ghost`, on the right. No emoji, no gradient, no decorative block, no filler text: real data only.",
  "- The page runs isolated: no reliable `localStorage`, no form posted anywhere. Keep state in memory.",
  "- `<title>`: the artifact's name (\"Sales dashboard — Q3\").",
  "- Write the page's text in the language of the conversation.",
];

export const PREVIEW_PROMPT = [
  "# Artifacts (HTML pages)",
  "When asked for a page, a mockup, a screen, a small tool, a dashboard or a document to look at or share, write the whole page in this block, in your reply: the app shows it live while you write it, keeps it as an artifact of the conversation, and the person can share it by link.",
  "```artifact slug=short-name",
  '<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>…</title><style>/* layout only */</style></head><body><main class="ag-page"><header class="ag-header"><h1>…</h1><p>…</p></header>…</main><script>…</script></body></html>',
  "```",
  "- `slug`: a short lowercase, hyphenated identifier unique to this page (`sales-dashboard-q3`). To change it, send the whole changed page again with the same slug: it becomes the next version of the same artifact, and its share link shows the new one. Another slug makes another artifact. Several pages: one block each.",
  ...ARTIFACT_PAGE_RULES,
  "- Start with `<head>` and the `<style>`, then the page top to bottom: it builds up before the person's eyes. Put scripts at the end.",
  "- Write it yourself in this block: no file on disk, subagent, repository or link instead. Keep your surrounding text short, don't repeat the page and don't mention the block.",
].join("\n");

/**
 * Saves the pages of a reply as files of the conversation (in the bot's profile in a direct
 * conversation, like an upload) and as versions of their artifacts. One that can't be saved is
 * left out; one saved without its version stays a plain mockup.
 */
export async function savePreviews(previews: LivePreview[], ctx: { conversationId: string; turnId: string; directProfile: string | null }) {
  const saved: { attachment: { id: string; name: string; mime: string; size: number }; preview: PreviewRef }[] = [];
  for (const [index, p] of previews.entries()) {
    const body = new Blob([p.html], { type: "text/html" });
    // Same index as in the streamed reply: the app follows the page by it.
    if (!p.html.trim() || body.size > MAX_FILE) continue;
    const row = await storeAttachment(ctx.conversationId, ctx.directProfile, previewFileName(p.title), "text/html", body).catch((err) => {
      console.error("previews: save", err);
      return null;
    });
    if (!row) continue;
    const slug = p.slug || artifactSlug(p.title) || `page-${index + 1}`;
    const version = await recordVersion(ctx.conversationId, slug, p.title, row.id).catch((err) => {
      console.error("previews: artifact version", err);
      return null;
    });
    saved.push({
      attachment: { id: row.id, name: row.name, mime: row.mime, size: row.size },
      preview: { id: row.id, title: p.title, key: `${ctx.turnId}:${index}`, ...version },
    });
  }
  return saved;
}

/** The bot a page is posted under: the given one, else the conversation's (the first one of a group). */
async function authorBot(conversationId: string, agentId: string | null) {
  const rows = await db
    .select({ agent: schema.agent, kind: schema.conversation.kind })
    .from(schema.conversationAgent)
    .innerJoin(schema.agent, eq(schema.agent.id, schema.conversationAgent.agentId))
    .innerJoin(schema.conversation, eq(schema.conversation.id, schema.conversationAgent.conversationId))
    .where(eq(schema.conversationAgent.conversationId, conversationId));
  const row = rows.find((r) => r.agent.id === agentId) ?? rows[0];
  if (row) return row;
  if (!agentId) return null;
  // A bot that left the conversation still signs what its session made.
  const [agent] = await db.select().from(schema.agent).where(eq(schema.agent.id, agentId));
  const [conv] = await db.select({ kind: schema.conversation.kind }).from(schema.conversation).where(eq(schema.conversation.id, conversationId));
  return agent && conv ? { agent, kind: conv.kind } : null;
}

/**
 * A page written outside a bot's reply (a code session's file), posted in the conversation as a
 * message of its bot with the page's card: the same artifact as a ```artifact block, versioned by
 * its slug. Returns where to open it.
 */
export async function postArtifact(page: { conversationId: string; agentId: string | null; html: string; title: string; slug?: string; text?: string }) {
  const bot = await authorBot(page.conversationId, page.agentId);
  if (!bot) throw new Error("No bot in this conversation to post the artifact under.");
  if (!page.html.trim()) throw new Error("The page is empty.");
  if (new Blob([page.html]).size > MAX_FILE) throw new Error("The page is too large to be saved.");
  const title = page.title.trim().slice(0, 200) || "Artifact";
  const [saved] = await savePreviews([{ title, html: page.html, done: true, slug: artifactSlug(page.slug ?? "") }], {
    conversationId: page.conversationId,
    turnId: crypto.randomUUID(),
    directProfile: bot.kind === "direct" ? bot.agent.hermesProfile : null,
  });
  if (!saved) throw new Error("The page could not be saved.");
  await postMessage(
    {
      id: crypto.randomUUID(),
      conversationId: page.conversationId,
      kind: "bot",
      authorAgentId: bot.agent.id,
      text: page.text?.trim() ?? "",
      data: { attachments: [saved.attachment], previews: [saved.preview] },
    },
    agentAuthor(bot.agent),
  );
  const [row] = saved.preview.artifactId
    ? await db.select({ token: schema.artifact.shareToken, shareMode: schema.artifact.shareMode }).from(schema.artifact).where(eq(schema.artifact.id, saved.preview.artifactId))
    : [];
  return { version: saved.preview.version ?? null, link: row ? `${env.WEB_ORIGIN.replace(/\/$/, "")}/s/${row.token}` : null, shareMode: row?.shareMode ?? null };
}
