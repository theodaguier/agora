import { describe, expect, test } from "bun:test";
import { previewTitle, readPreviews, withoutPreviews } from "@agora/core";
import { parseReply } from "./onboarding";

const page = `<!doctype html><html><head><title>Accueil &amp; tarifs</title><style>code::after { content: "\`\`\`"; }</style></head><body><h1>E-Do</h1></body></html>`;

describe("preview block", () => {
  test("the page leaves the text and keeps its title", () => {
    const r = parseReply(`Voici la maquette.\n\n\`\`\`preview\n${page}\n\`\`\`\n\nDis-moi ce que tu en penses.`);
    expect(r.text).toBe("Voici la maquette.\n\nDis-moi ce que tu en penses.");
    expect(r.previews).toEqual([{ title: "Accueil & tarifs", html: page, done: true }]);
  });

  test("backticks inside a line don't end the page", () => {
    expect(readPreviews(`\`\`\`preview\n${page}\n\`\`\``)[0]!.html).toBe(page);
  });

  test("a page being written is read up to where it is, without a fence starting to close it", () => {
    const [live] = readPreviews(`Je la construis.\n\`\`\`preview\n<html><body><h1>Studio</h1>\n\`\``);
    expect(live).toEqual({ title: "Studio", html: "<html><body><h1>Studio</h1>", done: false });
    expect(withoutPreviews(`Je la construis.\n\`\`\`preview\n<html><body>`)).toBe("Je la construis.\n");
  });

  test("several pages, in order, and the other blocks still parsed", () => {
    const reply = `Deux pages.\n\`\`\`preview\n<title>A</title>\n\`\`\`\n\`\`\`preview\n<title>B</title>\n\`\`\`\n\`\`\`choices\n{"question": "On garde ?", "options": [{"label": "Valider"}]}\n\`\`\``;
    const r = parseReply(reply);
    expect(r.previews?.map((p) => p.title)).toEqual(["A", "B"]);
    expect(r.text).toBe("Deux pages.");
  });

  test("no block, no previews", () => {
    expect(parseReply("Bonjour.").previews).toBeUndefined();
  });

  test("the title falls back on the first heading", () => {
    expect(previewTitle("<body><h1>Réserver <em>un studio</em></h1>")).toBe("Réserver un studio");
    expect(previewTitle("<body><p>rien</p>")).toBe("");
  });
});
