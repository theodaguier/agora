import { expect, test } from "bun:test";
import { webSecurityFindings } from "./audit-web";

const finding = (paths: string[]) => ({ module_name: "zod", severity: "high", url: "advisory", findings: [{ version: "3", paths }] });
test("a mixed mobile and API advisory still blocks the web gate", () => {
  expect(webSecurityFindings([finding(["apps__mobile>expo>zod", "apps__api>zod"])] )).toHaveLength(1);
  expect(webSecurityFindings([finding(["apps__web>zod"])] )).toHaveLength(1);
});
test("mobile-only findings are separate while missing ownership still fails", () => {
  expect(webSecurityFindings([finding(["apps__mobile>expo>zod"])] )).toEqual([]);
  expect(webSecurityFindings([finding([])] )).toHaveLength(1);
});
