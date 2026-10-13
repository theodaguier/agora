import { readFile } from "node:fs/promises";
import { env } from "./env";
import { hermesEnv } from "./harden";

/**
 * Access tokens of the instance's OAuth connectors, for the MCP gateway (mcp-gateway.ts).
 *
 * The tokens are Hermes's (`mcp-tokens/<server>.json`), and so is their refresh: a refresh token
 * is often single-use, and Hermes holds a file lock across the token request so two processes never
 * spend the same one (tools/mcp_oauth.py, acquire_refresh_fence). Rather than redo that, a short
 * Python run with Hermes's own interpreter builds Hermes's OAuth provider and lets it hand over a
 * valid token, refreshing it under that lock when it is due. The MCP server itself is never called:
 * the request the provider signs is answered locally.
 */

const HELPER = String.raw`
import asyncio, json, sys
try:
    import httpx2 as httpx
except ImportError:
    import httpx
from tools.mcp_oauth_manager import get_manager

PROBE = "x-agora-token-probe"

async def main():
    req = json.loads(sys.stdin.read())
    name, url, failed = req["name"], req["url"], req.get("failed")
    provider = get_manager().get_or_build_provider(name, url, req.get("oauth") or {})
    if provider is None:
        raise SystemExit("MCP OAuth support is unavailable in Hermes")
    real = httpx.AsyncHTTPTransport()
    seen = {}

    class Transport(httpx.AsyncBaseTransport):
        async def handle_async_request(self, request):
            # The request to the MCP server: answered here, its Authorization header is the token.
            if request.headers.get(PROBE):
                seen["auth"] = request.headers.get("authorization")
                return httpx.Response(200, json={}, request=request)
            # Metadata discovery and the token endpoint go out for real.
            return await real.handle_async_request(request)

    async def token():
        seen.clear()
        async with httpx.AsyncClient(auth=provider, transport=Transport(), timeout=30) as client:
            await client.post(url, json={}, headers={PROBE: "1"})
        auth = seen.get("auth") or ""
        return auth[7:] if auth.lower().startswith("bearer ") else None

    current = await token()
    # The server refused this token although it isn't due: refresh it now, unless a peer already has.
    if failed and current == failed:
        provider.context.token_expiry_time = 1
        current = await token()
    if not current or current == failed:
        raise SystemExit("no valid token: the connector needs to be authorized again")
    print(json.dumps({"access_token": current, "expires_at": provider.context.token_expiry_time}))

asyncio.run(main())
`;

let python: Promise<string> | null = null;

/**
 * Hermes's interpreter: HERMES_PYTHON, else the one HERMES_BIN runs (a console script's shebang,
 * or the `exec "<python>"` line of the installer's wrapper).
 */
export function hermesPython() {
  return (python ??= (async () => {
    if (env.HERMES_PYTHON) return env.HERMES_PYTHON;
    const bin = Bun.which(env.HERMES_BIN) ?? env.HERMES_BIN;
    const text = await readFile(bin, "utf8").catch(() => "");
    const shebang = text.match(/^#!\s*(\S*python[\w.]*)\s*$/m)?.[1];
    if (shebang && text.startsWith("#!")) return shebang;
    const wrapped = text.match(/exec\s+"?([^"\s]*python[\w.]*)"?/)?.[1];
    if (wrapped) return wrapped;
    throw new Error(`Hermes's Python not found from ${bin}: set HERMES_PYTHON`);
  })().catch((err) => {
    python = null;
    throw err;
  }));
}

type Token = { accessToken: string; expiresAt: number | null };

/** Per server: the token handed out last, and the run fetching the next one. */
const cache = new Map<string, Token>();
const inflight = new Map<string, Promise<Token>>();

/** Seconds before expiry when a token is no longer handed out. */
const MARGIN = 60;

async function fetchToken(name: string, url: string, oauth: Record<string, unknown>, failed?: string): Promise<Token> {
  const proc = Bun.spawn([await hermesPython(), "-c", HELPER], {
    // Instance home: every profile's mcp-tokens/ points there.
    env: hermesEnv(),
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
    timeout: 60_000,
  });
  proc.stdin.write(JSON.stringify({ name, url, oauth, failed }));
  proc.stdin.end();
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  if (code !== 0) {
    const reason = err.trim().split("\n").at(-1) || `exit ${code}`;
    throw new Error(`OAuth ${name}: ${reason}`);
  }
  const parsed = JSON.parse(out.trim().split("\n").at(-1)!) as { access_token: string; expires_at: number | null };
  return { accessToken: parsed.access_token, expiresAt: parsed.expires_at };
}

const fresh = (t: Token | undefined) => !!t && (t.expiresAt === null || t.expiresAt - MARGIN > Date.now() / 1000);

/**
 * A valid access token for an instance connector. `failed`: the server just refused this one, so
 * Hermes refreshes it even though it isn't due.
 */
export async function oauthAccessToken(name: string, url: string, oauth: Record<string, unknown>, failed?: string): Promise<string> {
  const cached = cache.get(name);
  if (!failed && fresh(cached)) return cached!.accessToken;
  // Another call already replaced the refused token.
  if (failed && cached && cached.accessToken !== failed && fresh(cached)) return cached.accessToken;
  const key = `${name}\0${failed ?? ""}`;
  let run = inflight.get(key);
  if (!run) {
    run = fetchToken(name, url, oauth, failed).finally(() => inflight.delete(key));
    inflight.set(key, run);
  }
  const token = await run;
  cache.set(name, token);
  return token.accessToken;
}

/** Forgets a server's token (reconfigured, removed). */
export const forgetOAuthToken = (name: string) => void cache.delete(name);
