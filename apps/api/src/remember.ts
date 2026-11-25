/**
 * "Save to the second brain": a message, or one of its files (an artifact is one), dropped into the
 * shared wiki's raw/sources/ like a document the team hands in. The curator (memory.ts) compiles it into
 * pages on its next run, and every agent reads those.
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { ensureVault, vaultDir } from "./memory";

/** Files whose text goes into the source itself; others are copied next to it. */
const TEXT_MIME = /^(text\/|application\/(json|xml|x-yaml|yaml|javascript|typescript|sql|x-sh|markdown))/;
const TEXT_EXT = new Set([".md", ".markdown", ".txt", ".csv", ".tsv", ".json", ".yaml", ".yml", ".html", ".htm", ".xml", ".sql", ".ts", ".js", ".py"]);
/** Beyond this, a text file is copied rather than inlined: the curator reads sources in chunks anyway. */
const MAX_INLINE = 200_000;

type File = { name: string; mime: string; path: string; size: number };

export type RememberInput = {
  text: string;
  files: File[];
  savedBy: string;
  author: string | null;
  where: string;
  at: Date;
};

const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "note";

const isText = (f: File) => TEXT_MIME.test(f.mime) || TEXT_EXT.has(extname(f.name).toLowerCase());

/** An artifact or any HTML page, as the text a reader would see. */
const htmlText = (html: string) =>
  html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|h[1-6]|li|tr|section|article)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Writes the source; returns its vault-relative path. */
export async function remember(input: RememberInput) {
  await ensureVault();
  const day = input.at.toISOString().slice(0, 10);
  const dir = join("raw", "sources", day);
  await mkdir(join(vaultDir(), dir), { recursive: true });
  const title = input.files.length === 1 && !input.text.trim() ? input.files[0]!.name : input.text.trim().split("\n")[0]!.slice(0, 80) || input.files[0]?.name || "note";
  const base = `${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`;

  const sections: string[] = [];
  if (input.text.trim()) sections.push(input.text.trim());
  for (const f of input.files) {
    if (isText(f) && f.size <= MAX_INLINE) {
      const raw = await readFile(f.path, "utf8").catch(() => null);
      if (raw !== null) {
        const body = /html?$/i.test(extname(f.name)) || f.mime === "text/html" ? htmlText(raw) : raw;
        sections.push(`## ${f.name}\n\n${body}`);
        continue;
      }
    }
    // Kept as is next to the source (a PDF, a spreadsheet, an image): the curator only reads the note.
    const copy = `${base}-${slugify(f.name.replace(/\.[^.]+$/, ""))}${extname(f.name).toLowerCase()}`;
    await copyFile(f.path, join(vaultDir(), dir, copy));
    sections.push(`## ${f.name}\n\nFile kept next to this note: ${copy} (${f.mime}, ${Math.round(f.size / 1024)} KB).`);
  }

  const front = [
    "---",
    `title: ${JSON.stringify(title)}`,
    `saved_by: ${JSON.stringify(input.savedBy)}`,
    ...(input.author ? [`author: ${JSON.stringify(input.author)}`] : []),
    `from: ${JSON.stringify(input.where)}`,
    `date: ${input.at.toISOString()}`,
    "---",
  ].join("\n");
  const rel = join(dir, `${base}.md`);
  await writeFile(join(vaultDir(), rel), `${front}\n\n${sections.join("\n\n")}\n`);
  return rel;
}
