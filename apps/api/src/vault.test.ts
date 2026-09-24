import { describe, expect, test } from "bun:test";
import { parseEnv } from "./vault";

describe("parseEnv", () => {
  test("names, quotes, export and comments", () => {
    const { entries, errors } = parseEnv(
      ['# comment', "", "A=1", "export B = two", 'C="with space # not a comment"', "D='single'", "E=x # inline", 'F="a\\"b"'].join("\n"),
    );
    expect(errors).toEqual([]);
    expect(entries.map((e) => [e.key, e.value])).toEqual([
      ["A", "1"],
      ["B", "two"],
      ["C", "with space # not a comment"],
      ["D", "single"],
      ["E", "x"],
      ["F", 'a"b'],
    ]);
  });

  test("keeps = inside values and reports bad lines", () => {
    const { entries, errors } = parseEnv("URL=https://x.io/?a=b\nnot a line\n1BAD=x");
    expect(entries).toEqual([{ line: 1, key: "URL", value: "https://x.io/?a=b" }]);
    expect(errors.map((e) => e.line)).toEqual([2, 3]);
  });
});
