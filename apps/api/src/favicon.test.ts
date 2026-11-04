import { describe, expect, test } from "bun:test";
import { privateAddress } from "./brand-logos";

describe("favicon fetches stay on public sites", () => {
  test("private, loopback, link-local and mapped addresses are refused", () => {
    for (const ip of ["127.0.0.1", "10.0.0.5", "172.16.3.4", "192.168.1.20", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:192.168.1.1"]) expect(privateAddress(ip)).toBe(true);
  });
  test("public addresses pass", () => {
    for (const ip of ["93.184.216.34", "1.1.1.1", "2606:4700:4700::1111"]) expect(privateAddress(ip)).toBe(false);
  });
});
