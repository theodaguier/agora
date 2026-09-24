import { config, usesRegistry } from "./config";
import { run } from "./exec";
import { parseVersion } from "./versions";

/** Published Hermes versions (vYYYY.M.D[.N] tags of the official image). */
export async function hermesVersions(): Promise<string[]> {
  const tags: string[] = [];
  let url: string | null = `https://hub.docker.com/v2/repositories/${config.hermesRepo}/tags?page_size=100&ordering=last_updated`;
  for (let page = 0; url && page < 3; page++) {
    const res: Response = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`Docker Hub : HTTP ${res.status}`);
    const body = (await res.json()) as { results: { name: string }[]; next: string | null };
    tags.push(...body.results.map((r) => r.name).filter((n) => /^v\d{4}\.\d+\.\d+(\.\d+)?$/.test(n)));
    url = body.next;
  }
  return tags;
}

/**
 * Published app versions. With a registry (ghcr.io/…), read its tags;
 * without one, look at locally built images (`./agora build`).
 */
export async function appVersions(): Promise<string[]> {
  if (!usesRegistry()) {
    const r = await run(["docker", "image", "ls", `${config.imagePrefix}-app`, "--format", "{{.Tag}}"]);
    return r.stdout.split("\n").filter((t) => parseVersion(t));
  }
  const [host, ...rest] = config.imagePrefix.split("/");
  const repo = `${rest.join("/")}-app`;
  const basic = config.registryToken ? `Basic ${btoa(`${config.registryUser || "token"}:${config.registryToken}`)}` : undefined;
  const tokenRes = await fetch(`https://${host}/token?scope=repository:${repo}:pull`, {
    headers: basic ? { Authorization: basic } : {},
    signal: AbortSignal.timeout(20_000),
  });
  if (!tokenRes.ok) throw new Error(`Registre : jeton refusé (HTTP ${tokenRes.status})`);
  const { token } = (await tokenRes.json()) as { token: string };
  const res = await fetch(`https://${host}/v2/${repo}/tags/list`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`Registre : HTTP ${res.status}`);
  const { tags } = (await res.json()) as { tags: string[] | null };
  return (tags ?? []).map((t) => t.replace(/^v/, "")).filter((t) => parseVersion(t));
}
