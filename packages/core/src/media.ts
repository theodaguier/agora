/**
 * Files a bot sends with its reply: `MEDIA:<absolute path>`, Hermes's own convention (its
 * text-to-speech, screenshot and MCP tools answer with these tags). The API joins each file
 * it accepts to the message (apps/api/src/bot-files.ts); the tag leaves the text.
 */

/**
 * A tag: the path bare (up to the first space, or the `*` of Markdown emphasis around the tag),
 * or in backticks or quotes when it holds spaces.
 */
const TAG = /[ \t]*[`*_]{0,2}MEDIA:[ \t]*(?:`([^`\n]+)`|"([^"\n]+)"|'([^'\n]+)'|((?:~\/|\/)[^\s`"'*]+))[`*_]{0,2}/g;

/** Punctuation that ends a sentence after a bare path, not part of it. */
const TRAILING = /[.,;:!?)\]]+$/;

type Tag = { start: number; end: number; path: string };

function scan(text: string) {
  const out: Tag[] = [];
  // Not matchAll: Hermes (the mobile app's engine) doesn't run it reliably.
  const re = new RegExp(TAG.source, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const bare = m[4];
    const path = (m[1] ?? m[2] ?? m[3] ?? bare?.replace(TRAILING, "") ?? "").trim();
    // The punctuation after a bare path stays in the sentence.
    const end = bare ? m.index + m[0].length - (bare.length - bare.replace(TRAILING, "").length) : m.index + m[0].length;
    if (path) out.push({ start: m.index, end, path });
  }
  return out;
}

/** The paths a reply sends, in order, each once. */
export function readMediaTags(text: string) {
  return [...new Set(scan(text).map((t) => t.path))];
}

/**
 * The reply without its tags (only those of `sent` when given: a file that couldn't be sent
 * keeps its tag, so the reader sees it is missing). A line left empty goes with it.
 */
export function withoutMediaTags(text: string, sent?: (path: string) => boolean) {
  let out = "";
  let from = 0;
  for (const tag of scan(text)) {
    if (sent && !sent(tag.path)) continue;
    out += text.slice(from, tag.start);
    from = tag.end;
  }
  out += text.slice(from);
  return out
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
