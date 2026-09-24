/** What a file is, from its extension: it picks the icon and whether it can be previewed. */
export type FileKind = "image" | "video" | "audio" | "pdf" | "document" | "spreadsheet" | "presentation" | "archive" | "code" | "design" | "file";

const KINDS: Record<Exclude<FileKind, "file">, string> = {
  image: "png jpg jpeg gif webp avif heic heif svg bmp tiff tif ico",
  video: "mp4 mov m4v webm mkv avi wmv mpeg mpg",
  audio: "mp3 wav m4a aac flac ogg oga opus aiff aif",
  pdf: "pdf",
  document: "doc docx odt rtf txt md mdx pages tex epub log",
  spreadsheet: "xls xlsx xlsm ods csv tsv numbers",
  presentation: "ppt pptx odp key",
  archive: "zip tar gz tgz bz2 xz rar 7z dmg pkg iso deb rpm apk ipa",
  code: "ts tsx js jsx mjs cjs json jsonc yaml yml toml xml html css scss py rb go rs java kt swift c h cpp hpp cs php sql sh bash zsh fish ps1 lua dart vue svelte astro ini env conf lock prisma graphql proto dockerfile ipynb",
  design: "fig psd sketch xd indd afdesign afphoto blend",
};

const BY_EXT = new Map(Object.entries(KINDS).flatMap(([kind, exts]) => exts.split(" ").map((e) => [e, kind as FileKind])));

/** Extensions recognized after a bare name ("rapport.pdf"), for the detection regex. */
export const FILE_EXTS = [...BY_EXT.keys()].sort((a, b) => b.length - a.length).join("|");

export const extensionOf = (name: string) => /\.([\p{L}\d]{1,10})$/u.exec(name)?.[1]?.toLowerCase();

export const fileKind = (name: string): FileKind => BY_EXT.get(extensionOf(name) ?? "") ?? "file";

/** "Node.js", "Next.js", "Three.js": names of tools, not files. */
export const isToolName = (name: string) => /^(node|next|nuxt|vue|react|three|d3|p5|chart|express|nest|deno|alpine|ember|angular|backbone|moment|video|solid)\.js$/i.test(name);

/** Last segment of a path, "/" or "\" separated. */
export const basename = (path: string) => path.replace(/[/\\]+$/, "").split(/[/\\]/).pop() ?? path;

export const isImage = (mime: string) => mime.startsWith("image/");

