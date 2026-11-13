/**
 * Artifacts: HTML pages a bot writes in its reply, in an ```artifact block (```preview, the
 * older name, still reads): a complete, self-contained page, scripts allowed. The app renders it
 * while the bot writes it (without running its scripts until the block is closed), then keeps it
 * as a file of the conversation and as a version of the artifact its slug names
 * (apps/api/src/previews.ts). The same slug in the same conversation is a new version of the same
 * artifact: its share link keeps working and shows the latest.
 */

/** A mockup kept with the bot's message: the conversation file holding the page. */
export type PreviewRef = {
  /** Attachment id of the HTML file. */
  id: string;
  title: string;
  /** `<turnId>:<index>`: follows the mockup from the live reply to the saved message. */
  key: string;
  /** The artifact this page is a version of (absent on mockups saved before artifacts). */
  artifactId?: string;
  version?: number;
};

/** Who opens an artifact's share link: the conversation's members, the organization's, or anyone with it. */
export const ARTIFACT_SHARE_MODES = ["private", "org", "link"] as const;
export type ArtifactShareMode = (typeof ARTIFACT_SHARE_MODES)[number];

export type ArtifactVersionDto = { version: number; attachmentId: string; createdAt: string };
export type ArtifactDto = {
  id: string;
  conversationId: string;
  slug: string;
  title: string;
  shareMode: ArtifactShareMode;
  /** Path of the share link on the instance (`/s/<token>`). */
  sharePath: string;
  /** Newest first. */
  versions: ArtifactVersionDto[];
  /** Whether the reader may change who the link is open to (members of the conversation). */
  canShare: boolean;
};

/** An artifact in the list of every one the reader can open (the Artefacts screen). */
export type ArtifactSummary = {
  id: string;
  conversationId: string;
  title: string;
  shareMode: ArtifactShareMode;
  sharePath: string;
  /** The latest version's number, and how many versions are kept. */
  version: number;
  versions: number;
  updatedAt: string;
};

/** An artifact's slug: the one its block names, else one drawn from its title. */
export const artifactSlug = (raw: string) =>
  raw
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 80);

/** File name of a mockup, from its title. */
export const previewFileName = (title: string) =>
  `${
    title
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\w]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase()
      .slice(0, 80) || "maquette"
  }.html`;

/** A page read from a reply: finished once its block is closed. `slug`: the one its block names, or "". */
export type LivePreview = { title: string; html: string; done: boolean; slug: string };

/** ```artifact or ```preview, then an optional info string: `slug=…` (or a bare slug). */
const OPEN = /```(?:artifact|preview)(?=[ \t\n])([^\n`]*)\n/;

function infoSlug(info: string) {
  const raw = /(?:^|\s)(?:slug|id)=["']?([^\s"']+)/.exec(info)?.[1] ?? /^\s*([\w-]+)\s*$/.exec(info)?.[1] ?? "";
  return artifactSlug(raw);
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** The page's <title>, else its first heading, else "". */
export function previewTitle(html: string) {
  const raw = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1] ?? /<h1[^>]*>([\s\S]*?)<\/h1>/i.exec(html)?.[1] ?? "";
  return raw
    .replace(/<[^>]*>/g, "")
    .replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : (entities[e.toLowerCase()] ?? m)))
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * The mockups of a reply, the last one possibly still being written. A block's end is the first
 * ``` at the start of a line: an HTML page has no reason to hold one. While streaming, the
 * backticks that may be the start of that end are held back.
 */
export function readPreviews(reply: string): LivePreview[] {
  return scan(reply).map(({ html, done, slug }) => ({ title: previewTitle(html), html, done, slug }));
}

/** The reply without its mockups, written or being written. */
export function withoutPreviews(reply: string) {
  let text = "";
  let from = 0;
  for (const block of scan(reply)) {
    text += reply.slice(from, block.start);
    from = block.end;
  }
  return text + reply.slice(from);
}

function scan(reply: string) {
  const out: { start: number; end: number; html: string; done: boolean; slug: string }[] = [];
  // Not matchAll: Hermes (the mobile app's engine) doesn't run it reliably.
  const open = new RegExp(OPEN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = open.exec(reply))) {
    const from = m.index + m[0].length;
    const slug = infoSlug(m[1] ?? "");
    const rest = reply.slice(from);
    const close = /(^|\n)```/.exec(rest);
    if (!close) {
      out.push({ start: m.index, end: reply.length, html: rest.replace(/(^|\n)`{0,2}$/, ""), done: false, slug });
      break;
    }
    const end = from + close.index + close[0].length;
    out.push({ start: m.index, end, html: rest.slice(0, close.index), done: true, slug });
    open.lastIndex = end;
  }
  return out;
}
