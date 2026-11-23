import { expect, test } from "bun:test";
import { orgHandle } from "./github-app";

test("an organization's display name or link becomes its GitHub handle", () => {
  expect(orgHandle("E-Do Studio")).toBe("E-Do-Studio");
  expect(orgHandle(" https://github.com/E-Do-Studio/ ")).toBe("E-Do-Studio");
  expect(orgHandle("github.com/E-Do-Studio/prototyper")).toBe("E-Do-Studio");
  expect(orgHandle("@acme")).toBe("acme");
  expect(orgHandle("")).toBe("");
});
