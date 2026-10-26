import { expect, test } from "bun:test";
import { previousMcpSecrets, redactMcpError } from "./mcp-secrets";

test("resolve stored values before Hermes deletes their references", () => {
  expect(previousMcpSecrets({ cfg: { env: { KEY: "${STORED}", SITE: "sc-domain:example.com", MISSING: "${ABSENT}" }, headers: { Authorization: "Bearer ${BEARER}" }, oauth: { client_id: "client", client_secret: "${CLIENT}" } }, env: { STORED: "previous-value", BEARER: "previous-bearer", CLIENT: "previous-client-secret" } })).toEqual({
    env: { KEY: "previous-value", SITE: "sc-domain:example.com" }, bearer: "previous-bearer", client: { client_id: "client", client_secret: "previous-client-secret", scope: undefined },
  });
});
test("missing references are not treated as configured credentials", () => {
  expect(previousMcpSecrets({ cfg: { env: { KEY: "${ABSENT}" } }, env: {} }).env).toEqual({});
});
test("stderr redacts raw, escaped and base64 JSON credentials", () => {
  const secret = { private_key: "-----BEGIN PRIVATE KEY-----\nprivate-material\n-----END PRIVATE KEY-----", private_key_id: "private-id-123", client_email: "private@example.invalid" };
  const json = JSON.stringify(secret);
  const encoded = Buffer.from(json).toString("base64");
  const result = redactMcpError(`Invalid credentials: ${json}\n${secret.private_key}\n${secret.client_email}\n${encoded}`, [encoded]);
  for (const value of [secret.private_key, "private-material", secret.private_key_id, secret.client_email, encoded]) expect(result).not.toContain(value);
  expect(result).toContain("Invalid credentials");
});
test("bearer tokens and signed URL parameters are removed even if not supplied", () => {
  const result = redactMcpError("Bearer hidden-token-123 https://user:password@example.com/token?secret=hidden", []);
  expect(result).not.toContain("hidden-token");
  expect(result).not.toContain("password");
  expect(result).not.toContain("secret=hidden");
});
