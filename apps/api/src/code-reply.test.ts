import { expect, test } from "bun:test";
import { placeCodeSessions } from "@agora/core";

const ref = (after: string, id = "s1") => ({ id, title: "Script hello.py", after });
const shape = (parts: ReturnType<typeof placeCodeSessions>) => parts.map((p) => (p.kind === "text" ? p.text : `[${p.session.id}]`));

test("the card goes between what the bot wrote before and after starting the session", () => {
  const text = "Je relance le test.\n\nBonne nouvelle : cette fois ça avance.";
  expect(shape(placeCodeSessions(text, [ref("Je relance le test.")]))).toEqual(["Je relance le test.", "[s1]", "Bonne nouvelle : cette fois ça avance."]);
});

test("nothing written before the start: the card comes first", () => {
  expect(shape(placeCodeSessions("Done.", [ref("")]))).toEqual(["[s1]", "Done."]);
});

test("a mark no longer in the text, or inside a code block, puts the card before the text", () => {
  expect(shape(placeCodeSessions("Hello", [ref("vanished")]))).toEqual(["[s1]", "Hello"]);
  expect(shape(placeCodeSessions("```\nabc\nmore\n```\nend", [ref("abc")]))).toEqual(["[s1]", "```\nabc\nmore\n```\nend"]);
});

test("several sessions keep their order; the last card can end the reply", () => {
  expect(shape(placeCodeSessions("A first.\n\nB second.", [ref("A first.", "1"), ref("B second.", "2")]))).toEqual(["A first.", "[1]", "B second.", "[2]"]);
});
