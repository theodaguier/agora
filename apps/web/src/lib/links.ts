import { basename, FILE_EXTS, fileKind, isToolName } from "./files";

/**
 * Domain endings recognized without "http://" or "www." ("e-do.fr", "github.com/…").
 * A closed list: "README.md" or "notes.txt" must not become links.
 */
const TLDS =
  "com|fr|net|org|io|dev|app|ai|co|eu|be|ch|ca|lu|mc|re|uk|de|es|it|nl|pt|us|me|tv|info|biz|xyz|tech|studio|design|cloud|site|online|shop|store|agency|page|link|so|gg|ly|sh|fm|to";
const TLD_SET = new Set(TLDS.split("|"));

/** Printable characters of an address, then its last one, which can't be sentence punctuation. */
const TAIL = "[^\\s<>\"'`]*[^\\s<>\"'`.,;:!?)\\]}]";

/** A character of a file path segment; "\ " is an escaped space, as a terminal writes it. */
const PATH_CHAR = "(?:[\\p{L}\\p{N}_@%+=,.~#-]|\\\\ )";
/** Where a path starts: "/", "~/", "./", "../" or "C:\". */
const PATH_START = "(?:~|\\.{1,2})?\\/|[a-z]:\\\\";

const ENTITY_RE = new RegExp(
  [
    // git@github.com:owner/repo.git, before emails
    "(?<ssh>(?<![\\w.+-])git@(?:github\\.com|gitlab\\.com|bitbucket\\.org|codeberg\\.org):[\\w.-]+\\/[\\w.-]*[\\w-](?![\\w-]))",
    // localhost:5173, http://127.0.0.1:3000/api, [::1]:8080
    `(?<local>(?<![\\w.-])(?:https?:\\/\\/)?(?:localhost|127\\.0\\.0\\.1|0\\.0\\.0\\.0|\\[::1\\]):\\d{2,5}(?![\\d])(?:\\/${TAIL}|\\/)?)`,
    // "port 3001", "ports 3000, 5173 et 8080", "port :3001"
    "(?<ports>\\bports?\\s+:?\\d{2,5}(?:(?:\\s*,\\s*|\\s+(?:et|and|ou|or)\\s+):?\\d{2,5})*(?![\\d.,]\\d))",
    // ":3001" on its own (4 or 5 digits, so a time "10:47" stays text)
    "(?<colon>(?<![\\w:.\\]]):\\d{4,5}(?![\\w:]))",
    // name@domain.tld
    "(?<email>(?<![\\w.+-])[\\w.+-]+@(?:[a-z0-9-]+\\.)+[a-z]{2,}(?![\\w-]))",
    // http(s)://… and www.…
    `(?<url>\\b(?:https?:\\/\\/|www\\.)${TAIL})`,
    // '/path/with spaces/file.png': between quotes, a path can hold spaces
    `(?<![\\p{L}\\p{N}])(?<q>['"])(?<qpath>(?:${PATH_START})[^'"\\n<>\`]*[^'"\\n<>\`\\s])\\k<q>(?![\\p{L}\\p{N}])`,
    // /Users/theo/notes.md, ~/Documents, ./src, C:\Users\theo: two segments at least for "/…",
    // so a "/command" stays text
    `(?<path>(?<![\\p{L}\\p{N}_:/.~\\\\\\]-])(?:(?:~|\\.{1,2})\\/${PATH_CHAR}*|\\/${PATH_CHAR}+\\/${PATH_CHAR}*|[a-z]:\\\\${PATH_CHAR}*)(?:[/\\\\]${PATH_CHAR}*)*)`,
    // 'Rapport final.pdf': between quotes, a file name can hold spaces
    `(?<![\\p{L}\\p{N}])(?<q2>['"])(?<qfile>[^'"\\n<>\`/\\\\]{0,150}[^'"\\n<>\`/\\\\\\s]\\.(?:${FILE_EXTS}))\\k<q2>(?![\\p{L}\\p{N}])`,
    // rapport.pdf, photo_2x.png, deploy.sh: a name and a known extension, before domains
    `(?<file>(?<![\\p{L}\\p{N}_@./\\\\:-])[\\p{L}\\p{N}_][\\p{L}\\p{N}_.()+-]*\\.(?:${FILE_EXTS})(?![\\p{L}\\p{N}_-]))`,
    // +33 6 12 34 56 78, 06 12 34 56 78, 06.12.34.56.78, +44 (0)20 7946 0958
    "(?<phone>(?<![\\w+/.-])(?:\\+\\d{1,3}[\\s.-]?(?:\\(0\\)[\\s.-]?)?\\d{1,4}(?:[\\s.-]?\\d{2,4}){1,4}|0[1-9](?:[\\s.-]?\\d{2}){4})(?![\\w/-]|[.,]\\d))",
    // domain.tld and domain.tld/path
    `(?<bare>(?<![\\w@.\\/-])(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${TLDS})(?![\\w-])(?::\\d+)?(?:\\/${TAIL}|\\/)?)`,
    // #1e90ff: six or eight hex digits, so "#123" stays a ticket number
    "(?<color>(?<![\\w&#])#(?:[0-9a-f]{8}|[0-9a-f]{6})(?![\\w-]))",
  ].join("|"),
  "giu",
);

export type Entity =
  /** A web address or an email ("mailto:"). */
  | { kind: "link"; url: string; text: string }
  /** A GitHub, GitLab, Bitbucket or Codeberg repository, or a page in it. */
  | ({ kind: "repo"; url: string; text: string } & Repo)
  | { kind: "phone"; url: string; text: string }
  /** A port, or a local address: opened on this machine ("http://localhost:3001"). */
  | { kind: "port"; port: number; url: string; text: string }
  /**
   * A file named in the text ("rapport.pdf"), or a web address of a file (`url`).
   * A name matching a file of the conversation opens it.
   */
  | { kind: "file"; name: string; url?: string; text: string }
  /** A file or folder path, as written: it can't be opened from the browser, only copied. */
  | { kind: "path"; path: string; text: string }
  | { kind: "color"; color: string; text: string };

export type TextPart = string | Entity;

/** Sentence punctuation right after a path belongs to the sentence. */
const PATH_END = /[.,;:!?)\]]+$/;

/** Splits text into plain parts and what can be acted on: links, emails, phone numbers, paths, colors. */
export function splitEntities(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  const push = (from: number, to: number) => from < to && out.push(text.slice(from, to));
  for (const m of text.matchAll(ENTITY_RE)) {
    const g = m.groups ?? {};
    let found = m[0];
    let entity: Entity | undefined;
    if (g.local) {
      const url = /^https?:\/\//i.test(found) ? found : `http://${found}`;
      entity = { kind: "port", port: Number(/:(\d+)/.exec(found.replace(/^https?:\/\//i, ""))![1]), url, text: found };
    } else if (g.ports || g.colon) {
      // Each number is a port; the words around stay text.
      let at = 0;
      const parts: TextPart[] = [];
      for (const n of found.matchAll(/:?(\d+)/g)) {
        const port = Number(n[1]);
        if (port > 65535) continue;
        if (n.index > at) parts.push(found.slice(at, n.index));
        parts.push({ kind: "port", port, url: `http://localhost:${port}`, text: n[0] });
        at = n.index + n[0].length;
      }
      if (!parts.some((p) => typeof p !== "string")) continue;
      push(last, m.index);
      out.push(...parts);
      push(m.index + at, m.index + found.length);
      last = m.index + found.length;
      continue;
    } else if (g.ssh) {
      const [, host, path] = /^git@([^:]+):(.+)$/.exec(found)!;
      const url = `https://${host}/${path!.replace(/\.git$/, "")}`;
      const repo = parseRepo(url);
      if (repo) entity = { kind: "repo", url, text: found, ...repo };
    } else if (g.email) {
      // "photo@2x.png" is a file, not an address.
      const tld = found.split(".").pop()!.toLowerCase();
      entity = fileKind(found) !== "file" && !TLD_SET.has(tld) ? { kind: "file", name: found, text: found } : { kind: "link", url: `mailto:${found}`, text: found };
    } else if (g.url || g.bare) {
      const url = /^https?:\/\//i.test(found) ? found : `https://${found}`;
      const repo = parseRepo(url);
      const file = repo ? undefined : fileOfUrl(url);
      entity = repo ? { kind: "repo", url, text: found, ...repo } : file ? { kind: "file", name: file, url, text: found } : { kind: "link", url, text: found };
    } else if (g.qfile) {
      // The quotes stay text around the name.
      push(last, m.index + 1);
      out.push({ kind: "file", name: g.qfile, text: g.qfile });
      last = m.index + found.length - 1;
      continue;
    } else if (g.file) {
      if (!isToolName(found)) entity = { kind: "file", name: found, text: found };
    }
    else if (g.qpath) {
      // The quotes stay text around the path.
      push(last, m.index + 1);
      out.push({ kind: "path", path: g.qpath, text: g.qpath });
      last = m.index + found.length - 1;
      continue;
    } else if (g.path) {
      found = found.replace(PATH_END, "");
      if (found.length > 1) entity = { kind: "path", path: found.replace(/\\ /g, " "), text: found };
    } else if (g.phone) {
      const digits = found.replace(/\(0\)/, "").replace(/[^\d+]/g, "");
      const count = digits.replace("+", "").length;
      if (count >= 8 && count <= 15) entity = { kind: "phone", url: `tel:${digits}`, text: found };
    } else if (g.color) entity = { kind: "color", color: found.toLowerCase(), text: found };
    if (!entity) continue;
    push(last, m.index);
    out.push(entity);
    last = m.index + found.length;
  }
  push(last, text.length);
  return out;
}

/**
 * The name of the file a web address points to ("…/rapport.pdf"), when it is one:
 * pages (".html", ".php") and the site's root stay links.
 */
export function fileOfUrl(url: string): string | undefined {
  try {
    const name = basename(decodeURIComponent(new URL(url).pathname));
    const kind = fileKind(name);
    return kind === "file" || kind === "code" ? undefined : name;
  } catch {
    return undefined;
  }
}

/** Splits text into plain parts and links (web addresses, bare domains, emails, repositories). */
export function splitLinks(text: string): (string | { url: string; text: string })[] {
  return splitEntities(text).map((p) =>
    typeof p === "string" ? p : p.kind === "link" || p.kind === "repo" || (p.kind === "file" && p.url) ? { url: p.url!, text: p.text } : p.text,
  );
}

export type Repo = {
  host: "github" | "gitlab" | "bitbucket" | "codeberg";
  owner: string;
  name: string;
  /** "#12" for an issue or a pull request, "@1a2b3c4" for a commit. */
  ref?: string;
};

const REPO_HOSTS: Record<string, Repo["host"]> = {
  "github.com": "github",
  "gitlab.com": "gitlab",
  "bitbucket.org": "bitbucket",
  "codeberg.org": "codeberg",
};

/** First path segments of these hosts that are pages of the site, not accounts. */
const NOT_OWNERS = new Set(
  "settings orgs organizations features pricing marketplace explore topics login logout signup join about sponsors notifications new apps enterprise enterprises collections trending search pulls issues codespaces users dashboard help security site blog contact readme customer-stories team solutions resources projects groups -".split(" "),
);

/** "https://github.com/owner/repo/pull/12" → GitHub, owner, repo, "#12"; undefined for anything else. */
export function parseRepo(url: string): Repo | undefined {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return undefined;
  }
  const host = REPO_HOSTS[u.hostname.replace(/^www\./, "").toLowerCase()];
  const [owner, rawName, ...rest] = u.pathname.split("/").filter(Boolean);
  if (!host || !owner || !rawName || NOT_OWNERS.has(owner.toLowerCase())) return undefined;
  const name = rawName.replace(/\.git$/, "");
  // GitLab puts "/-/" before the pages of a project.
  const [page, id] = rest[0] === "-" ? rest.slice(1) : rest;
  let ref: string | undefined;
  if (id && /^(pull|pulls|issues|merge_requests|pull-requests)$/.test(page ?? "") && /^\d+$/.test(id)) ref = `#${id}`;
  else if (id && /^commits?$/.test(page ?? "") && /^[0-9a-f]{7,40}$/i.test(id)) ref = `@${id.slice(0, 7)}`;
  return { host, owner, name, ref };
}

/** First link of a text, if any. */
export const firstUrl = (text: string) => splitLinks(text).find((p) => typeof p !== "string") as { url: string } | undefined;

/** "github.com/owner/repo": host and path, without the scheme, "www." or a trailing slash. */
export function linkLabel(url: string) {
  if (url.startsWith("mailto:")) return url.slice(7);
  try {
    const u = new URL(url);
    return `${u.hostname.replace(/^www\./, "")}${u.pathname === "/" ? "" : u.pathname.replace(/\/$/, "")}`;
  } catch {
    return url;
  }
}

/** A whole string that is a file name ("`rapport.pdf`" in code); else undefined. In code, spaces are part of the name. */
export function asFile(text: string): string | undefined {
  const t = text.trim();
  return !/[\n`<>"|/\\]/.test(t) && fileKind(t) !== "file" && !isToolName(t) && /^[\p{L}\p{N}_]/u.test(t) ? t : undefined;
}

/**
 * A whole string that is a path ("`/Users/theo/My file.png`" in code), unescaped; else undefined.
 * Code marks where the path ends, so it can hold spaces; "/help" stays a command.
 */
export function asPath(text: string): string | undefined {
  const t = text.trim();
  if (/[\n`<>"|]/.test(t) || !new RegExp(`^(?:${PATH_START})`, "iu").test(t)) return undefined;
  if (/^\/[^/]+$/.test(t) || t === "/") return undefined;
  return t.replace(/\\ /g, " ");
}

/** "notes.md" is a file, "Documents/" or "~/Documents" a folder. */
export const isFolderPath = (path: string) => /[/\\]$/.test(path) || !/\.[\p{L}\d]{1,8}$/u.test(path.split(/[/\\]/).pop() ?? "");

/** Classes of a link in text: blue, underlined on hover. */
export const linkClass = "break-words text-brand underline-offset-2 hover:underline";

type HastNode = {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
};

const SKIP = new Set(["code", "pre", "a"]);

/** Where the hast of an entity is built: a link, or a marked span rendered by the `span` override. */
function entityNode(p: Entity): HastNode[] {
  const text = { type: "text", value: p.text };
  switch (p.kind) {
    case "link":
    case "repo":
    case "phone":
      return [{ type: "element", tagName: "a", properties: { href: p.url }, children: [text] }];
    case "path":
      return [{ type: "element", tagName: "span", properties: { dataPath: p.path }, children: [text] }];
    case "port":
      return [{ type: "element", tagName: "span", properties: { dataPort: p.url }, children: [text] }];
    case "file":
      return [{ type: "element", tagName: "span", properties: { dataFile: p.name, dataUrl: p.url }, children: [text] }];
    case "color":
      return [{ type: "element", tagName: "span", properties: { dataColor: p.color }, children: [text] }];
  }
}

/**
 * rehype plugin: turns what markdown didn't catch (bare domains, phone numbers, paths, colors)
 * into links and marked spans, outside code and links.
 */
export function rehypeLinks() {
  return (tree: HastNode) => {
    const walk = (node: HastNode) => {
      if (!node.children || (node.tagName && SKIP.has(node.tagName))) return;
      node.children = node.children.flatMap((child): HastNode[] => {
        if (child.type !== "text" || !child.value) {
          walk(child);
          return [child];
        }
        return splitEntities(child.value).flatMap((p) => (typeof p === "string" ? [{ type: "text", value: p }] : entityNode(p)));
      });
    };
    walk(tree);
  };
}
