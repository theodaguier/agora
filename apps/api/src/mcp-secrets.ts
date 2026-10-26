import type { McpSnapshot } from "./hermes-admin";

/** Resolve references before deleting a declaration: Hermes deletes its referenced secrets too. */
export function previousMcpSecrets(snapshot: McpSnapshot | null) {
  const resolve = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    let missing = false;
    const resolved = value.replace(/\$\{([A-Z][A-Z0-9_]*)\}/g, (_, key: string) => {
      if (snapshot?.env[key] === undefined) missing = true;
      return snapshot?.env[key] ?? "";
    });
    return !missing && resolved ? resolved : undefined;
  };
  const cfg = snapshot?.cfg ?? {};
  const values = (cfg.env ?? {}) as Record<string, unknown>;
  const headers = (cfg.headers ?? {}) as Record<string, unknown>;
  const oauth = (cfg.oauth ?? {}) as Record<string, unknown>;
  const authorization = resolve(Object.entries(headers).find(([name]) => name.toLowerCase() === "authorization")?.[1]);
  const client_id = resolve(oauth.client_id);
  return {
    env: Object.fromEntries(Object.entries(values).flatMap(([key, value]) => {
      const resolved = resolve(value);
      return resolved ? [[key, resolved]] : [];
    })),
    bearer: authorization?.match(/^Bearer\s+(.+)$/i)?.[1],
    client: client_id ? { client_id, client_secret: resolve(oauth.client_secret), scope: resolve(oauth.scope) } : undefined,
  };
}

/** Connector processes are untrusted: redact provided secrets before exposing stderr in the UI. */
export function redactMcpError(message: string, secrets: string[]) {
  const values = new Set<string>();
  const collect = (value: unknown, depth = 0) => {
    if (depth > 6) return;
    if (typeof value === "string" && value.length >= 4) values.add(value);
    else if (value && typeof value === "object") for (const child of Object.values(value)) collect(child, depth + 1);
  };
  for (const value of secrets) {
    collect(value);
    try { collect(JSON.parse(value)); } catch {}
    if (/^[A-Za-z0-9+/=]+$/.test(value) && value.length > 20) {
      try { collect(JSON.parse(Buffer.from(value, "base64").toString())); } catch {}
    }
  }
  let result = message;
  for (const value of [...values].sort((a, b) => b.length - a.length)) {
    result = result.split(value).join("[redacted]").split(JSON.stringify(value).slice(1, -1)).join("[redacted]");
  }
  return result.replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, "[redacted key]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [redacted]")
    .replace(/https?:\/\/[^\s"']+/g, (value) => {
      try { const url = new URL(value); return `${url.origin}${url.pathname}${url.search ? "?[redacted]" : ""}`; } catch { return "[redacted URL]"; }
    })
    .replace(/\x1b\[[0-9;]*m/g, "").replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "").slice(-2000);
}
