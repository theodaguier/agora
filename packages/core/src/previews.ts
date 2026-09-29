/**
 * HTML mockups a bot writes in its reply, in a ```preview block: a complete,
 * self-contained page (CSS in a <style>, no script). The app renders it in a
 * sandboxed frame while the bot writes it, then keeps it as a file of the
 * conversation (apps/api/src/previews.ts).
 */

/** A mockup kept with the bot's message: the conversation file holding the page. */
export type PreviewRef = {
  /** Attachment id of the HTML file. */
  id: string;
  title: string;
  /** `<turnId>:<index>`: follows the mockup from the live reply to the saved message. */
  key: string;
};

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

/** A mockup read from a reply: finished once its block is closed. */
export type LivePreview = { title: string; html: string; done: boolean };

const OPEN = /```preview[ \t]*\n/;

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
  return scan(reply).map(({ html, done }) => ({ title: previewTitle(html), html, done }));
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
  const out: { start: number; end: number; html: string; done: boolean }[] = [];
  // Not matchAll: Hermes (the mobile app's engine) doesn't run it reliably.
  const open = new RegExp(OPEN.source, "g");
  let m: RegExpExecArray | null;
  while ((m = open.exec(reply))) {
    const from = m.index + m[0].length;
    const rest = reply.slice(from);
    const close = /(^|\n)```/.exec(rest);
    if (!close) {
      out.push({ start: m.index, end: reply.length, html: rest.replace(/(^|\n)`{0,2}$/, ""), done: false });
      break;
    }
    const end = from + close.index + close[0].length;
    out.push({ start: m.index, end, html: rest.slice(0, close.index), done: true });
    open.lastIndex = end;
  }
  return out;
}
