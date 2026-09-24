/**
 * Agora release: computes the next version (semver) from the conventional
 * commits since the last tag, updates the package.json files, writes the
 * CHANGELOG, commits and creates the vX.Y.Z tag.
 *
 *   bun scripts/release.ts            version inferred from the commits
 *   bun scripts/release.ts minor      force patch | minor | major
 *   bun scripts/release.ts --dry-run  print without changing anything
 *
 * Conventions: feat: → minor, fix:/perf:/… → patch,
 * "feat!:" or "BREAKING CHANGE" in the body → major. Without a forced level, commits
 * that change nothing for users (docs, test, ci, chore, style) don't make a release.
 * Then: git push --follow-tags (CI publishes the images and the release).
 * The Release workflow runs it on every green push to main; in Actions, the tag goes to $GITHUB_OUTPUT.
 */
import { $ } from "bun";
import { appendFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url).pathname;
const ENV_EXAMPLE = "infra/.env.example";
const PACKAGES = ["package.json", "apps/api/package.json", "apps/web/package.json", "apps/updater/package.json", "packages/core/package.json"];
const args = process.argv.slice(2);
const dry = args.includes("--dry-run");
const forced = args.find((a) => ["patch", "minor", "major"].includes(a)) as "patch" | "minor" | "major" | undefined;

$.cwd(ROOT);
if ((await $`git rev-parse --verify HEAD`.nothrow().quiet()).exitCode !== 0) throw new Error("No commits: nothing to release.");
if (!dry && (await $`git status --porcelain`.text()).trim()) throw new Error("There are uncommitted changes.");

// Interpolated: written bare, Bun's shell expands v* as a file glob and no tag is ever found.
const lastTag = (await $`git describe --tags --abbrev=0 --match ${"v*"}`.nothrow().quiet().text()).trim() || null;
const range = lastTag ? `${lastTag}..HEAD` : "HEAD";
const raw = await $`git log ${range} --no-merges --format=%s%x1f%b%x1e`.text();
const commits = raw
  .split("\x1e")
  .map((c) => c.trim())
  .filter(Boolean)
  .map((c) => {
    const [subject = "", body = ""] = c.split("\x1f");
    const m = subject.match(/^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/);
    return { type: m?.[1] ?? "other", scope: m?.[2]?.slice(1, -1), breaking: !!m?.[3] || /BREAKING CHANGE/.test(body), text: m?.[4] ?? subject };
  })
  .filter((c) => !(c.type === "chore" && c.text.startsWith("release")));

const current = JSON.parse(await Bun.file(`${ROOT}package.json`).text()).version as string;
const level = forced ?? (commits.some((c) => c.breaking) ? "major" : commits.some((c) => c.type === "feat") ? "minor" : "patch");
const [maj = 0, min = 0, pat = 0] = current.split(".").map(Number);
const next = level === "major" ? `${maj + 1}.0.0` : level === "minor" ? `${maj}.${min + 1}.0` : `${maj}.${min}.${pat + 1}`;

const groups: [string, (c: (typeof commits)[number]) => boolean][] = [
  ["⚠️ Breaking changes", (c) => c.breaking],
  ["Features", (c) => !c.breaking && c.type === "feat"],
  ["Fixes", (c) => !c.breaking && c.type === "fix"],
  ["Other", (c) => !c.breaking && !["feat", "fix", "docs", "test", "ci", "chore", "style"].includes(c.type)],
];
const date = new Date().toISOString().slice(0, 10);
const section = [
  `## v${next} — ${date}`,
  ...groups.flatMap(([title, pick]) => {
    const items = commits.filter(pick);
    return items.length ? ["", `### ${title}`, ...items.map((c) => `- ${c.scope ? `**${c.scope}**: ` : ""}${c.text}`)] : [];
  }),
].join("\n");

if (!forced && !commits.some((c) => groups.some(([, pick]) => pick(c)))) {
  console.log(`Nothing to release since ${lastTag ?? "the beginning"}.`);
  process.exit(0);
}

console.log(`${current} → ${next} (${level}, ${commits.length} commits since ${lastTag ?? "the beginning"})\n\n${section}\n`);
if (dry) process.exit(0);

for (const p of PACKAGES) {
  const file = Bun.file(`${ROOT}${p}`);
  if (!(await file.exists())) continue;
  const json = JSON.parse(await file.text());
  json.version = next;
  await Bun.write(`${ROOT}${p}`, `${JSON.stringify(json, null, 2)}\n`);
}
const changelog = Bun.file(`${ROOT}CHANGELOG.md`);
const previous = (await changelog.exists()) ? (await changelog.text()).replace(/^# Changelog\n+/, "") : "";
await Bun.write(`${ROOT}CHANGELOG.md`, `# Changelog\n\n${section}\n\n${previous}`.trimEnd() + "\n");
const envExample = Bun.file(`${ROOT}${ENV_EXAMPLE}`);
await Bun.write(`${ROOT}${ENV_EXAMPLE}`, (await envExample.text()).replace(/^APP_VERSION=.*$/m, `APP_VERSION=${next}`));

await $`git add ${PACKAGES} CHANGELOG.md ${ENV_EXAMPLE}`;
await $`git commit -m ${`chore(release): v${next}`}`;
await $`git tag -a ${`v${next}`} -m ${section}`;
if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `tag=v${next}\n`);
console.log(`Tag v${next} created. To publish: git push --follow-tags`);
