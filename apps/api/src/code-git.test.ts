import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// A HERMES_HOME without a GitHub token, and github.com served by local bare repositories.
const root = mkdtempSync(join(tmpdir(), "agora-code-git-"));
process.env.HERMES_HOME = join(root, "hermes");
mkdirSync(process.env.HERMES_HOME);
writeFileSync(join(process.env.HERMES_HOME, ".env"), "");
const remotes = join(root, "remotes");
writeFileSync(join(root, "gitconfig"), `[url "file://${remotes}/"]\n\tinsteadOf = https://github.com/\n[init]\n\tdefaultBranch = main\n`);
process.env.GIT_CONFIG_GLOBAL = join(root, "gitconfig");
process.env.GIT_CONFIG_NOSYSTEM = "1";

const { commit, commitMaterial, parseRepo, prepareWorktree, pullRequestLinks, push, readGit, removeWorktree, sessionBranch, writeCredentials } = await import("./code-git");

const sh = (cwd: string, ...args: string[]) => {
  const r = Bun.spawnSync(["git", ...args], { cwd, env: process.env });
  if (r.exitCode !== 0) throw new Error(r.stderr.toString());
  return r.stdout.toString().trim();
};
const author = { name: "Théo", email: "theo@example.com" };

beforeAll(() => {
  // acme/app on GitHub: a main branch with one commit, and an existing feature branch.
  const seed = join(root, "seed");
  mkdirSync(seed);
  sh(seed, "init", "-q");
  writeFileSync(join(seed, "README.md"), "hello\n");
  sh(seed, "add", ".");
  sh(seed, "-c", "user.name=x", "-c", "user.email=x@x", "commit", "-qm", "init");
  sh(seed, "branch", "feature/existing");
  mkdirSync(join(remotes, "acme"), { recursive: true });
  sh(root, "clone", "-q", "--bare", seed, join(remotes, "acme", "app.git"));
});

describe("parseRepo", () => {
  test("owner/name and its URLs", () => {
    expect(parseRepo("E-Do-Studio/e-do.studio-4.0")).toBe("E-Do-Studio/e-do.studio-4.0");
    expect(parseRepo("https://github.com/acme/app.git")).toBe("acme/app");
    expect(parseRepo("https://github.com/acme/app/")).toBe("acme/app");
    expect(parseRepo("git@github.com:acme/app.git")).toBe("acme/app");
  });
  test("anything else", () => {
    expect(parseRepo("app")).toBeNull();
    expect(parseRepo("https://gitlab.com/acme/app")).toBeNull();
    expect(parseRepo("acme/..")).toBeNull();
    expect(parseRepo("acme/app; rm -rf /")).toBeNull();
  });
});

test("pullRequestLinks: the pull requests Claude Code printed, the last one last", () => {
  expect(
    pullRequestLinks([
      "https://github.com/acme/app/pull/12\n",
      "Created https://github.com/E-Do-Studio/e-do.studio-4.0/pull/420 and see https://github.com/acme/app/pull/12",
      "https://github.com/acme/app/issues/3",
    ]),
  ).toEqual([
    { repo: "E-Do-Studio/e-do.studio-4.0", number: 420 },
    { repo: "acme/app", number: 12 },
  ]);
});

test("sessionBranch: the title, unique to the session", () => {
  expect(sessionBranch("#402 Schéma.org JSON-LD", "c90ba065-ffd0")).toBe("claude/402-schema-org-json-ld-c90b");
  expect(sessionBranch("!!!", "abcd1234")).toBe("claude/session-abcd");
});

describe("a session's worktree", () => {
  const clone = join(root, "repos", "acme", "app");
  const dir = join(root, "worktrees", "app-1");

  test("a worktree of the shared clone, on a new branch from the default one", async () => {
    expect(await prepareWorktree(clone, dir, "acme/app", { branch: "claude/fix-1", author })).toContain("claude/fix-1");
    const git = await readGit(dir);
    expect(git).toMatchObject({ repo: "acme/app", branch: "claude/fix-1", base: "main", changes: 0, ahead: 0, pushed: false, pr: null, github: false });
    expect(sh(dir, "config", "user.email")).toBe("theo@example.com");
    // The token is never written: the helper reads it from the environment.
    expect(sh(dir, "config", "--get-all", "credential.https://github.com.helper")).toContain("$GH_TOKEN");
    // The clone keeps no checkout of its own: every branch is free for a worktree.
    expect(sh(clone, "branch", "--show-current")).toBe("");
    expect(existsSync(join(clone, "README.md"))).toBe(false);
  });

  test("git gets the token from the environment, for github.com only", () => {
    const fill = (host: string, token?: string) =>
      Bun.spawnSync(["git", "credential", "fill"], {
        cwd: dir,
        env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...(token && { GH_TOKEN: token }) },
        stdin: new TextEncoder().encode(`protocol=https\nhost=${host}\n\n`),
      });
    const ok = fill("github.com", "tok_123");
    expect(ok.stdout.toString()).toContain("username=x-access-token\npassword=tok_123");
    // No token, or another host: no answer (and no prompt).
    expect(fill("github.com").exitCode).not.toBe(0);
    expect(fill("gitlab.com", "tok_123").stdout.toString()).not.toContain("tok_123");
  });

  test("the project's credentials, in a file git ignores", async () => {
    expect(await writeCredentials(dir, "")).toBeNull();
    expect(await writeCredentials(dir, "API_KEY=secret\n")).toContain(".env");
    expect(readFileSync(join(dir, ".env"), "utf8")).toContain("API_KEY=secret");
    expect(statSync(join(dir, ".env")).mode & 0o777).toBe(0o600);
    expect((await readGit(dir))?.changes).toBe(0);
    // Written again: excluded once.
    await writeCredentials(dir, "API_KEY=other\n");
    expect(readFileSync(join(clone, ".git", "info", "exclude"), "utf8").match(/^\/\.env$/gm)).toHaveLength(1);
  });

  test("a commit of every change", async () => {
    writeFileSync(join(dir, "new.txt"), "x\n");
    expect((await readGit(dir))?.changes).toBe(1);
    expect((await commit(dir, "feat: new file")).text).toContain("feat: new file");
    expect(await readGit(dir)).toMatchObject({ changes: 0, ahead: 1, lastCommit: { subject: "feat: new file" } });
    await expect(commit(dir, "again")).rejects.toThrow();
  });

  test("the files changed, with their lines", async () => {
    writeFileSync(join(dir, "README.md"), "hello\nworld\n");
    writeFileSync(join(dir, "notes.md"), "a\nb\nc\n");
    const git = await readGit(dir);
    expect(git?.changes).toBe(2);
    expect(git?.files).toEqual([
      { path: "README.md", state: "modified", added: 1, removed: 0 },
      { path: "notes.md", state: "added", added: 3, removed: 0 },
    ]);
    const material = await commitMaterial(dir);
    expect(material.diff).toContain("+world");
    expect(material.untracked).toEqual(["notes.md"]);
    expect(material.recent).toEqual(["feat: new file", "init"]);
    await commit(dir, "docs: notes");
    await expect(commitMaterial(dir)).rejects.toThrow();
  });

  test("pushing needs GitHub access", async () => {
    await expect(push(dir)).rejects.toThrow(/GH_TOKEN/);
  });

  test("prepared again, it stays as it is; another repository or stray files are refused", async () => {
    expect(await prepareWorktree(clone, dir, "acme/app", { branch: "claude/fix-1", author })).toContain("claude/fix-1");
    expect((await readGit(dir))?.ahead).toBe(2);
    await expect(prepareWorktree(clone, join(root, "worktrees", "x"), "acme/other", { branch: "x", author })).rejects.toThrow(/acme\/app/);
    const stray = join(root, "worktrees", "stray");
    mkdirSync(stray, { recursive: true });
    writeFileSync(join(stray, "file"), "");
    await expect(prepareWorktree(clone, stray, "acme/app", { branch: "x", author })).rejects.toThrow(/stray/);
  });

  test("an existing branch on GitHub is checked out, in a worktree of the same clone", async () => {
    const other = join(root, "worktrees", "app-2");
    await prepareWorktree(clone, other, "acme/app", { branch: "feature/existing", author });
    expect(await readGit(other)).toMatchObject({ branch: "feature/existing", pushed: true, ahead: 0, behind: 0 });
    expect(sh(clone, "worktree", "list")).toContain(other);
  });

  test("deleted, its branch stays in the clone and a new worktree picks it up", async () => {
    writeFileSync(join(dir, "draft.txt"), "not committed\n");
    expect(await removeWorktree(clone, dir)).toMatchObject({ branch: "claude/fix-1" });
    expect(existsSync(dir)).toBe(false);
    expect(sh(clone, "worktree", "list")).not.toContain(dir);
    expect(await readGit(dir)).toBeNull();
    await prepareWorktree(clone, dir, "acme/app", { branch: "claude/fix-1", author });
    expect(await readGit(dir)).toMatchObject({ branch: "claude/fix-1", ahead: 2, changes: 0 });
  });

  test("deleted though its directory is already gone", async () => {
    const gone = join(root, "worktrees", "app-2");
    Bun.spawnSync(["rm", "-rf", gone]);
    expect(await removeWorktree(clone, gone)).toMatchObject({ branch: null });
    expect(sh(clone, "worktree", "list")).not.toContain(gone);
  });
});
