import { statfs } from "node:fs/promises";
import { config } from "./config";
import { readEnv } from "./envfile";
import { run } from "./exec";
import { loadState } from "./state";

/** Share of the disk used beyond which the hourly round also drops the whole build cache. */
export const DISK_ALERT = 0.85;

/** Used share of the host disk (the checkout is a bind mount of it). */
export async function diskUsage() {
  const s = await statfs(config.projectDir);
  return 1 - s.bavail / s.blocks;
}

/**
 * Every update leaves the replaced version's images behind (three pulled, the api
 * rebuilt on the server) and adds the api build to Docker's build cache: a few GB
 * each time, until the disk is full and Postgres can no longer write (2026-10-01:
 * the whole API answering 500). Removes the images of every version but the
 * running one and the one before it (kept for a rollback by hand), then the build
 * cache unused for 3 days: the layers on the current Hermes (Claude Code, Playwright)
 * stay, so the next app update still rebuilds in seconds.
 * Never during an update: the version being installed isn't in .env yet.
 */
export async function reclaimDisk({ allBuildCache = false } = {}) {
  const env = await readEnv();
  const { history } = await loadState();
  const previous = (target: "app" | "hermes") => history.findLast((r) => r.target === target && r.status === "succeeded")?.from;
  const apps = [env.APP_VERSION, previous("app")].filter((v): v is string => !!v);
  const hermes = [env.HERMES_VERSION, previous("hermes")].filter((v): v is string => !!v);

  const keep: Record<string, string[]> = {
    [`${config.imagePrefix}-app`]: apps,
    [`${config.imagePrefix}-web`]: apps,
    [`${config.imagePrefix}-updater`]: apps,
    [config.hermesRepo]: hermes,
    // Name fixed in docker-compose.yml: agora-api:<app>-<hermes>.
    "agora-api": apps.flatMap((a) => hermes.map((h) => `${a}-${h}`)),
  };
  const removed: string[] = [];
  for (const [repo, tags] of Object.entries(keep)) {
    // Without a version to keep (.env unreadable…), touch nothing.
    if (!tags.length) continue;
    const r = await run(["docker", "image", "ls", repo, "--format", "{{.Tag}}"]);
    for (const tag of r.stdout.split("\n").filter((t) => t && t !== "<none>" && !tags.includes(t))) {
      // No -f: an image a container still uses stays.
      if ((await run(["docker", "image", "rm", `${repo}:${tag}`])).code === 0) removed.push(`${repo}:${tag}`);
    }
  }
  await run(["docker", "image", "prune", "-f"]);
  await run(["docker", "builder", "prune", "-a", "-f", ...(allBuildCache ? [] : ["--filter", "until=72h"])], { timeoutMs: 10 * 60_000 });
  console.log(`disk: ${removed.length ? `removed ${removed.join(", ")}` : "no old image"}; ${Math.round((await diskUsage()) * 100)}% used`);
}
