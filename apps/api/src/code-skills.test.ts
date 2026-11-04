import { describe, expect, test } from "bun:test";
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { excludePaths, withExcludes } from "./code-git";
import { linkSkills, MANIFEST, scanSkills, teamOrder, unionSkills, type TeamSkill } from "./code-skills";

const root = mkdtempSync(join(tmpdir(), "agora-code-skills-"));

const sh = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1" } });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
};

/** A skill directory of a bot, outside the session. */
function skill(base: string, name: string, description = `${name} skill`): TeamSkill {
  const dir = join(root, base, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "SKILL.md"), `---\nname: ${name}\ndescription: ${description}\n---\nbody\n`);
  return { name, description, dir };
}

describe("teamOrder", () => {
  const agents = [
    { id: "a", profile: "alice", name: "Alice" },
    { id: "b", profile: "bob", name: "Bob" },
    { id: "c", profile: "carl", name: "Carl" },
  ];

  test("only the bots the person may use, the session's bot first", () => {
    expect(teamOrder(agents, { role: "user", access: new Set(["a", "c"]) }, "c")).toEqual(["carl", "alice"]);
  });

  test("the session's bot even without access, and nothing else without access", () => {
    expect(teamOrder(agents, { role: "user", access: new Set() }, "b")).toEqual(["bob"]);
    expect(teamOrder(agents, { role: "user", access: new Set() }, null)).toEqual([]);
  });

  test("every bot for an admin, by name", () => {
    expect(teamOrder(agents, { role: "admin", access: new Set() }, null)).toEqual(["alice", "bob", "carl"]);
  });
});

describe("unionSkills", () => {
  const s = (name: string, dir: string): TeamSkill => ({ name, description: "", dir });

  test("the first of a name wins", () => {
    const out = unionSkills([[s("deploy", "/alice/deploy"), s("review", "/alice/review")], [s("deploy", "/bob/deploy"), s("lint", "/bob/lint")]]);
    expect(out.map((x) => x.dir)).toEqual(["/alice/deploy", "/alice/review", "/bob/lint"]);
  });

  test("a name the repository has never comes, nor an unsafe one", () => {
    const out = unionSkills([[s("deploy", "/a"), s("../escape", "/b"), s("ok", "/c")]], new Set(["deploy"]));
    expect(out.map((x) => x.name)).toEqual(["ok"]);
  });
});

describe("scanSkills", () => {
  test("finds nested skills, leaves Hermes's hub out", async () => {
    const base = join(root, "scan");
    for (const rel of ["devops/deploy", ".hub/cache/ghost", "writing/notes"]) {
      mkdirSync(join(base, rel), { recursive: true });
      writeFileSync(join(base, rel, "SKILL.md"), "---\nname: x\n---\n");
    }
    const found = await scanSkills(base);
    expect([...found.keys()].sort()).toEqual(["deploy", "notes"]);
    expect(found.get("deploy")).toBe(join(base, "devops/deploy"));
  });
});

describe("withExcludes", () => {
  test("adds what is missing, once", () => {
    const first = withExcludes("# git ls-files --others --exclude-from=.git/info/exclude\n/.env", ["/.claude/skills/a", "/.claude/skills/a", "/.env"]);
    expect(first).toBe("# git ls-files --others --exclude-from=.git/info/exclude\n/.env\n/.claude/skills/a\n");
    expect(withExcludes(first!, ["/.claude/skills/a", "/.env"])).toBeNull();
  });
});

describe("linkSkills", () => {
  const repo = join(root, "repo");
  mkdirSync(join(repo, ".claude/skills/deploy"), { recursive: true });
  writeFileSync(join(repo, ".claude/skills/deploy/SKILL.md"), "---\nname: deploy\n---\nthe repo's own\n");
  sh(repo, "init", "-q");
  sh(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "add", ".");
  sh(repo, "-c", "user.name=t", "-c", "user.email=t@example.com", "commit", "-qm", "init");
  const exclude = () => readFileSync(join(repo, ".git/info/exclude"), "utf8");

  const deploy = skill("alice", "deploy");
  const review = skill("alice", "review");
  const lint = skill("bob", "lint");

  test("links the team's skills, the repository's own wins, nothing shows in git", async () => {
    const linked = await linkSkills(repo, ".claude/skills", [deploy, review, lint]);
    expect(linked.map((s) => s.name)).toEqual(["review", "lint"]);
    expect(readFileSync(join(repo, ".claude/skills/deploy/SKILL.md"), "utf8")).toContain("the repo's own");
    expect(lstatSync(join(repo, ".claude/skills/review")).isSymbolicLink()).toBe(true);
    expect(readlinkSync(join(repo, ".claude/skills/lint"))).toBe(lint.dir);
    expect(JSON.parse(readFileSync(join(repo, ".claude/skills", MANIFEST), "utf8"))).toEqual(["review", "lint"]);
    expect(sh(repo, "status", "--porcelain")).toBe("");
  });

  test("again: idempotent, no duplicate exclude line", async () => {
    const before = exclude();
    await linkSkills(repo, ".claude/skills", [deploy, review, lint]);
    expect(exclude()).toBe(before);
    for (const line of ["/.claude/skills/review", "/.claude/skills/lint", `/.claude/skills/${MANIFEST}`]) {
      expect(exclude().split("\n").filter((l) => l === line)).toHaveLength(1);
    }
  });

  test("a skill gone loses its link, the repository's skill stays", async () => {
    const linked = await linkSkills(repo, ".claude/skills", [review]);
    expect(linked.map((s) => s.name)).toEqual(["review"]);
    expect(existsSync(join(repo, ".claude/skills/lint"))).toBe(false);
    expect(existsSync(join(repo, ".claude/skills/deploy/SKILL.md"))).toBe(true);
    expect(sh(repo, "status", "--porcelain")).toBe("");
  });

  test("a worktree writes its clone's exclude file", async () => {
    const wt = join(root, "wt");
    sh(repo, "worktree", "add", "-q", wt);
    await excludePaths(wt, [".agents/skills/x"]);
    expect(exclude().split("\n")).toContain("/.agents/skills/x");
    await excludePaths(wt, [".agents/skills/x"]);
    expect(exclude().split("\n").filter((l) => l === "/.agents/skills/x")).toHaveLength(1);
  });

  test("outside a repository: links, no exclude", async () => {
    const dir = join(root, "plain");
    mkdirSync(dir);
    expect((await linkSkills(dir, ".agents/skills", [lint])).map((s) => s.name)).toEqual(["lint"]);
  });
});
