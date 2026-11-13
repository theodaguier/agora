import type { JSONContent } from "@tiptap/react";
import { extensionOf } from "@/lib/files";

/** How a document the app can edit is read and written back. */
export type DocFormat = "docx" | "markdown" | "text";

/** Which files open in the text editor rather than a preview. */
export function docFormat(name: string): DocFormat | null {
  const ext = extensionOf(name);
  if (ext === "docx") return "docx";
  if (ext === "md" || ext === "markdown") return "markdown";
  if (ext === "txt") return "text";
  return null;
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/**
 * A Word document as HTML for the editor: headings, paragraphs, lists, bold, italic, underline,
 * links. Its page layout and fonts aren't kept (Mammoth reads structure, not looks).
 */
export async function docxToHtml(data: ArrayBuffer) {
  // The standalone browser build: the package's main entry wants Node's modules.
  const { default: mammoth } = (await import("mammoth/mammoth.browser.js")) as { default: typeof import("mammoth") };
  const { value } = await mammoth.convertToHtml(
    { arrayBuffer: data },
    {
      styleMap: [
        "u => u",
        "strike => s",
        // The editor's own blocks, written as named Word styles (see docToDocx), read back as blocks.
        `p[style-name='${STYLE.callout}'] => p.callout:fresh`,
        `p[style-name='${STYLE.summary}'] => p.toggle-summary:fresh`,
        `p[style-name='${STYLE.toggled}'] => p.toggle-content:fresh`,
      ],
    },
  );
  return restoreBlocks(value);
}

/** Word style names for the blocks Word has no equivalent of. */
const STYLE = { callout: "Callout", summary: "Toggle Summary", toggled: "Toggle Content" };

/** Mammoth's flat paragraphs regrouped into the editor's blocks: callouts, toggles, to-dos. */
function restoreBlocks(html: string) {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const body = doc.body;
  const wrapRuns = (match: (el: Element) => boolean, make: (run: Element[]) => Element) => {
    let run: Element[] = [];
    const flush = () => {
      if (!run.length) return;
      // Placed first, then filled: `make` moves the paragraphs into it.
      const anchor = doc.createComment("");
      run[0].before(anchor);
      anchor.replaceWith(make(run));
      run = [];
    };
    for (const el of [...body.children]) {
      if (match(el)) run.push(el);
      else flush();
    }
    flush();
  };
  wrapRuns(
    (el) => el.matches("p.callout"),
    (run) => {
      const box = doc.createElement("div");
      box.setAttribute("data-callout", "");
      run.forEach((p) => (p.removeAttribute("class"), box.append(p)));
      return box;
    },
  );
  // A toggle: its title, then the paragraphs under it.
  for (const title of [...body.querySelectorAll(":scope > p.toggle-summary")]) {
    const details = doc.createElement("details");
    const summary = doc.createElement("summary");
    summary.innerHTML = title.innerHTML;
    const content = doc.createElement("div");
    content.setAttribute("data-type", "detailsContent");
    let next = title.nextElementSibling;
    while (next?.matches("p.toggle-content")) {
      const after = next.nextElementSibling;
      next.removeAttribute("class");
      content.append(next);
      next = after;
    }
    if (!content.children.length) content.append(doc.createElement("p"));
    details.append(summary, content);
    title.replaceWith(details);
  }
  // To-dos: paragraphs that start with a box, ☐ or ☒.
  const box = /^\s*([☐☒])\s?/;
  wrapRuns(
    (el) => el.tagName === "P" && box.test(el.textContent ?? ""),
    (run) => {
      const list = doc.createElement("ul");
      list.setAttribute("data-type", "taskList");
      for (const p of run) {
        const li = doc.createElement("li");
        li.setAttribute("data-type", "taskItem");
        li.setAttribute("data-checked", String(box.exec(p.textContent ?? "")?.[1] === "☒"));
        // Drop the box from the first text node it's in.
        const walker = doc.createTreeWalker(p, NodeFilter.SHOW_TEXT);
        const first = walker.nextNode();
        if (first) first.textContent = (first.textContent ?? "").replace(box, "");
        li.append(p);
        list.append(li);
      }
      return list;
    },
  );
  return body.innerHTML;
}

/** The editor's document as a Word file. */
export async function docToDocx(doc: JSONContent): Promise<Blob> {
  const d = await import("docx");
  type Run = InstanceType<typeof d.TextRun> | InstanceType<typeof d.ExternalHyperlink>;
  type Para = InstanceType<typeof d.Paragraph> | InstanceType<typeof d.Table>;
  type Ctx = { list?: { ordered: boolean; ref: string }; level?: number; quote?: boolean; style?: string; check?: boolean | null };
  /** "#d9730d" or "rgba(217,115,13,0.2)" as Word's hex; a translucent tint is mixed with white. */
  const hex = (css: string | undefined) => {
    if (!css) return undefined;
    if (css.startsWith("#")) return css.slice(1, 7).toUpperCase();
    const m = /rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?/.exec(css);
    if (!m) return undefined;
    const a = m[4] === undefined ? 1 : Number(m[4]);
    return [m[1], m[2], m[3]].map((c) => Math.round(Number(c) * a + 255 * (1 - a)).toString(16).padStart(2, "0")).join("").toUpperCase();
  };
  const ALIGN = { center: d.AlignmentType.CENTER, right: d.AlignmentType.RIGHT, justify: d.AlignmentType.JUSTIFIED } as Record<string, (typeof d.AlignmentType)[keyof typeof d.AlignmentType]>;
  const align = (n: JSONContent) => ALIGN[(n.attrs?.textAlign as string) ?? ""];
  // Top-level numbered lists met so far, each with its own numbering.
  let lists = 0;
  const HEADINGS = { 1: d.HeadingLevel.HEADING_1, 2: d.HeadingLevel.HEADING_2, 3: d.HeadingLevel.HEADING_3 } as const;

  /** The text of a block, its marks as run properties; a link wraps its runs. */
  const runs = (nodes: JSONContent[] = [], quote = false): Run[] =>
    nodes.flatMap((n): Run[] => {
      if (n.type === "hardBreak") return [new d.TextRun({ text: "", break: 1 })];
      if (n.type !== "text" || !n.text) return [];
      const has = (type: string) => n.marks?.some((m) => m.type === type);
      const attr = (type: string, key: string) => n.marks?.find((m) => m.type === type)?.attrs?.[key] as string | undefined;
      const tint = has("highlight") ? (hex(attr("highlight", "color")) ?? "FFF3A3") : undefined;
      const run = new d.TextRun({
        color: hex(attr("textStyle", "color")),
        shading: tint ? { type: d.ShadingType.CLEAR, fill: tint, color: "auto" } : undefined,
        text: n.text,
        bold: has("bold"),
        italics: has("italic") || quote,
        underline: has("underline") || has("link") ? {} : undefined,
        strike: has("strike"),
        font: has("code") ? "Courier New" : undefined,
        style: has("link") ? "Hyperlink" : undefined,
      });
      const href = n.marks?.find((m) => m.type === "link")?.attrs?.href as string | undefined;
      return [href ? new d.ExternalHyperlink({ link: href, children: [run] }) : run];
    });

  const blocks = (nodes: JSONContent[] = [], ctx: Ctx = {}): Para[] =>
    nodes.flatMap((n): Para[] => {
      switch (n.type) {
        case "heading":
          return [new d.Paragraph({ heading: HEADINGS[(n.attrs?.level ?? 1) as 1 | 2 | 3] ?? d.HeadingLevel.HEADING_3, alignment: align(n), children: runs(n.content) })];
        case "paragraph":
          return [
            new d.Paragraph({
              alignment: align(n),
              // A to-do: its box as a character, Word has no live checkbox to write.
              children: ctx.check != null ? [new d.TextRun({ text: ctx.check ? "☒ " : "☐ " }), ...runs(n.content, ctx.quote)] : runs(n.content, ctx.quote),
              ...(ctx.style && { style: ctx.style }),
              ...(ctx.list && (ctx.list.ordered ? { numbering: { reference: ctx.list.ref, level: ctx.level ?? 0 } } : { bullet: { level: ctx.level ?? 0 } })),
              ...(ctx.quote && { indent: { left: 720 } }),
            }),
          ];
        case "bulletList":
        case "orderedList": {
          const ordered = n.type === "orderedList";
          const level = ctx.list ? (ctx.level ?? 0) + 1 : 0;
          const ref = ordered && !ctx.list ? `numbers-${++lists}` : (ctx.list?.ref ?? "numbers-0");
          return (n.content ?? []).flatMap((item) => blocks(item.content, { ...ctx, check: undefined, list: { ordered, ref }, level }));
        }
        case "taskList":
          return (n.content ?? []).flatMap((item) =>
            blocks(item.content, { ...ctx, list: undefined, level: undefined, check: !!item.attrs?.checked }),
          );
        case "callout":
          return blocks(n.content, { ...ctx, style: "Callout" });
        case "details": {
          const [summary, content] = n.content ?? [];
          return [new d.Paragraph({ style: "ToggleSummary", children: runs(summary?.content) }), ...blocks(content?.content, { ...ctx, style: "ToggleContent" })];
        }
        case "table":
          return [
            new d.Table({
              width: { size: 100, type: d.WidthType.PERCENTAGE },
              rows: (n.content ?? []).map(
                (row) =>
                  new d.TableRow({
                    tableHeader: row.content?.every((c) => c.type === "tableHeader"),
                    children: (row.content ?? []).map(
                      (cell) =>
                        new d.TableCell({
                          columnSpan: (cell.attrs?.colspan as number) ?? 1,
                          rowSpan: (cell.attrs?.rowspan as number) ?? 1,
                          shading: cell.type === "tableHeader" ? { type: d.ShadingType.CLEAR, fill: "F1F1EF", color: "auto" } : undefined,
                          children: (() => {
                            const inner = blocks(cell.content, { check: null }).filter((p): p is InstanceType<typeof d.Paragraph> => p instanceof d.Paragraph);
                            return inner.length ? inner : [new d.Paragraph({ children: [] })];
                          })(),
                        }),
                    ),
                  }),
              ),
            }),
          ];
        case "blockquote":
          return blocks(n.content, { ...ctx, quote: true });
        case "codeBlock":
          return (n.content?.map((c) => c.text ?? "").join("") ?? "")
            .split("\n")
            .map((line) => new d.Paragraph({ children: [new d.TextRun({ text: line, font: "Courier New" })] }));
        case "horizontalRule":
          return [new d.Paragraph({ border: { bottom: { style: d.BorderStyle.SINGLE, size: 6, color: "999999", space: 1 } }, children: [] })];
        default:
          return n.content ? blocks(n.content, ctx) : [];
      }
    });

  const children = blocks(doc.content);
  // Each numbered list restarts at 1: one numbering definition per top-level list.
  const numbering = Array.from({ length: lists + 1 }, (_, i) => ({
    reference: `numbers-${i}`,
    levels: [0, 1, 2, 3, 4, 5].map((level) => ({
      level,
      format: [d.LevelFormat.DECIMAL, d.LevelFormat.LOWER_LETTER, d.LevelFormat.LOWER_ROMAN][level % 3],
      text: `%${level + 1}.`,
      alignment: d.AlignmentType.START,
      style: { paragraph: { indent: { left: 720 * (level + 1), hanging: 360 } } },
    })),
  }));
  const file = new d.Document({
    numbering: { config: numbering },
    styles: {
      paragraphStyles: [
        { id: "Callout", name: STYLE.callout, basedOn: "Normal", paragraph: { shading: { type: d.ShadingType.CLEAR, fill: "F1F1EF", color: "auto" }, indent: { left: 240, right: 240 }, spacing: { before: 60, after: 60 } } },
        { id: "ToggleSummary", name: STYLE.summary, basedOn: "Normal", run: { bold: true } },
        { id: "ToggleContent", name: STYLE.toggled, basedOn: "Normal", paragraph: { indent: { left: 360 } } },
      ],
    }, sections: [{ children: children.length ? children : [new d.Paragraph({ children: [] })] }] });
  return d.Packer.toBlob(file);
}
