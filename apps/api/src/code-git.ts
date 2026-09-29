import { readdir } from "node:fs/promises";
import type { CodeGit, CodeGitFile, CodePullRequest, CodeRepo } from "@agora/core";
import { childEnv } from "./harden";
import { defineMessages, tr } from "./i18n";
import { instanceSecret } from "./vault";

/**
 * GitHub for the Claude Code sessions (code-sessions.ts): the clone a session
 * starts on, the state of its branch, and the actions its owner runs from the
 * panel (commit, push, pull request, merge).
 *
 * Access comes from a token of the vault (instance .env): GH_TOKEN or
 * GITHUB_TOKEN, else the GitHub connector's. It is handed to git and gh through
 * the environment only: the clone's credential helper reads it from there, so
 * it is never written to disk nor put in a URL.
 */

const messages = defineMessages({
  en: {
    noToken: "No GitHub access: add GH_TOKEN (a token with Contents and Pull requests) to the vault, or install the GitHub connector.",
    badRepo: (repo: string) => `“${repo}” is not a GitHub repository (expected owner/name or its URL).`,
    otherClone: (dir: string, repo: string) => `${dir} already holds a clone of ${repo}: pick another project.`,
    notEmpty: (dir: string) => `${dir} already holds files that are not a git clone: pick another project.`,
    badBranch: (branch: string) => `“${branch}” is not a valid branch name.`,
    notRepo: "The session's directory is not a git repository.",
    detached: "No branch is checked out.",
    noRemote: "The clone has no GitHub remote.",
    nothing: "Nothing to commit.",
    onBase: (base: string) => `The session is on ${base}: pull requests and pushes go through a branch of their own.`,
    noPr: "This branch has no open pull request.",
    cloned: (repo: string, branch: string, from: string | null) => `Cloned ${repo}, on branch ${branch}${from ? ` (from ${from})` : ""}.`,
    fetched: (repo: string, branch: string) => `${repo} updated, on branch ${branch}.`,
    committed: (sha: string, subject: string) => `Commit ${sha}: ${subject}`,
    pushed: (branch: string) => `Branch ${branch} pushed to GitHub.`,
    opened: (n: number, title: string) => `Pull request #${n} opened: ${title}`,
    existing: (n: number) => `Pull request #${n} was already open.`,
    found: (n: number, title: string, state: string) => `Pull request #${n} ${state} by Claude Code: ${title}`,
    states: { open: "opened", closed: "closed", merged: "merged" } as Record<"open" | "closed" | "merged", string>,
    merged: (n: number, base: string, method: string) => `Pull request #${n} merged into ${base} (${method}).`,
    pulled: (branch: string) => `Branch ${branch} updated from GitHub.`,
    failed: (what: string) => `Git failed: ${what}`,
  },
  fr: {
    noToken: "Pas d'accès GitHub : ajoute GH_TOKEN (un jeton avec Contents et Pull requests) au coffre, ou installe le connecteur GitHub.",
    badRepo: (repo: string) => `« ${repo} » n'est pas un dépôt GitHub (owner/nom ou son URL attendu).`,
    otherClone: (dir: string, repo: string) => `${dir} contient déjà un clone de ${repo} : choisis un autre projet.`,
    notEmpty: (dir: string) => `${dir} contient déjà des fichiers qui ne sont pas un clone git : choisis un autre projet.`,
    badBranch: (branch: string) => `« ${branch} » n'est pas un nom de branche valide.`,
    notRepo: "Le répertoire de la session n'est pas un dépôt git.",
    detached: "Aucune branche n'est active.",
    noRemote: "Le clone n'a pas de dépôt GitHub d'origine.",
    nothing: "Rien à committer.",
    onBase: (base: string) => `La session est sur ${base} : les push et les PR passent par une branche à part.`,
    noPr: "Cette branche n'a pas de PR ouverte.",
    cloned: (repo: string, branch: string, from: string | null) => `Clone de ${repo}, sur la branche ${branch}${from ? ` (depuis ${from})` : ""}.`,
    fetched: (repo: string, branch: string) => `${repo} mis à jour, sur la branche ${branch}.`,
    committed: (sha: string, subject: string) => `Commit ${sha} : ${subject}`,
    pushed: (branch: string) => `Branche ${branch} poussée sur GitHub.`,
    opened: (n: number, title: string) => `PR #${n} ouverte : ${title}`,
    existing: (n: number) => `La PR #${n} était déjà ouverte.`,
    found: (n: number, title: string, state: string) => `PR #${n} ${state} par Claude Code : ${title}`,
    states: { open: "ouverte", closed: "fermée", merged: "mergée" },
    merged: (n: number, base: string, method: string) => `PR #${n} mergée dans ${base} (${method}).`,
    pulled: (branch: string) => `Branche ${branch} mise à jour depuis GitHub.`,
    failed: (what: string) => `Échec de git : ${what}`,
  },
});

export class GitError extends Error {}

/** GitHub access of the sessions, from the vault. */
export const githubToken = () => instanceSecret("GH_TOKEN", "GITHUB_TOKEN", "MCP_GITHUB_API_KEY");

/**
 * Credential helper of the clones: answers git with the token of its environment.
 * Git runs it through the shell, which expands $GH_TOKEN when it asks.
 */
const HELPER = `!f() { test "$1" = get && test -n "$GH_TOKEN" && printf 'username=x-access-token\\npassword=%s\\n' "$GH_TOKEN"; }; f`;

/** Environment of git, gh and Claude Code for a session: the token, and never a prompt for credentials. */
export const githubEnv = (token: string | null): Record<string, string> => ({
  GIT_TERMINAL_PROMPT: "0",
  GCM_INTERACTIVE: "never",
  GH_PROMPT_DISABLED: "1",
  ...(token && { GH_TOKEN: token, GITHUB_TOKEN: token }),
});

/** `raw`: stdout untouched (porcelain formats start with a meaningful space). */
type Run = { ok: boolean; out: string; err: string; raw: string };

async function git(cwd: string, args: string[], token: string | null = null, timeoutMs = 60_000): Promise<Run> {
  // No optional locks: reading the state while Claude Code works in the clone must not get in its way.
  const proc = Bun.spawn(["git", ...args], { cwd, env: childEnv({ ...githubEnv(token), GIT_OPTIONAL_LOCKS: "0" }), stdin: "ignore", stdout: "pipe", stderr: "pipe", timeout: timeoutMs });
  const [out, err, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { ok: code === 0, out: out.trim(), err: err.trim(), raw: out };
}

/** Same, failing with git's own words. */
async function must(cwd: string, args: string[], token: string | null = null, timeoutMs?: number) {
  const r = await git(cwd, args, token, timeoutMs);
  if (!r.ok) throw new GitError(tr(messages).failed((r.err || r.out).split("\n").filter(Boolean).slice(-3).join(" ").slice(0, 500) || args[0]!));
  return r.out;
}

/** owner/name of a GitHub repository, from that form or its URL (https, ssh). */
export function parseRepo(input: string): string | null {
  const s = input.trim().replace(/\/+$/, "").replace(/\.git$/, "");
  const m = /^(?:https?:\/\/(?:www\.)?github\.com\/|git@github\.com:|github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/.exec(s);
  if (!m || m[2] === "." || m[2] === "..") return null;
  return `${m[1]}/${m[2]}`;
}

/** The branch a session works on when it is not given one: named after its title, unique to it. */
export function sessionBranch(title: string, id: string) {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/, "");
  return `claude/${slug || "session"}-${id.slice(0, 4)}`;
}

const isClone = async (cwd: string) => (await git(cwd, ["rev-parse", "--is-inside-work-tree"])).out === "true";

async function originRepo(cwd: string) {
  // As written, before any url.insteadOf rewriting.
  const r = await git(cwd, ["config", "--get", "remote.origin.url"]);
  return r.ok ? parseRepo(r.out) : null;
}

async function defaultBranch(cwd: string) {
  const r = await git(cwd, ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"]);
  return r.ok ? r.out.replace(/^origin\//, "") : null;
}

const hasRef = async (cwd: string, ref: string) => (await git(cwd, ["rev-parse", "--verify", "--quiet", ref])).ok;

/** The clone's own settings: who commits (the owner), and the token for github.com, read from the environment. */
async function configure(cwd: string, author: { name: string; email: string }) {
  await must(cwd, ["config", "user.name", author.name]);
  await must(cwd, ["config", "user.email", author.email]);
  // An empty value first: helpers of the machine's config do not apply to github.com.
  await git(cwd, ["config", "--unset-all", "credential.https://github.com.helper"]);
  await must(cwd, ["config", "--add", "credential.https://github.com.helper", ""]);
  await must(cwd, ["config", "--add", "credential.https://github.com.helper", HELPER]);
}

/**
 * The session's directory as a clone of `repo` on its working branch: cloned when empty, fetched
 * when it already is that clone. The branch is `branch` (checked out from GitHub when it exists
 * there, created from the default branch otherwise). Returns the step's text.
 */
export async function prepareRepo(cwd: string, repo: string, opts: { branch: string; author: { name: string; email: string } }) {
  const t = tr(messages);
  const token = await githubToken();
  const dir = cwd.split("/").filter(Boolean).at(-1) ?? cwd;
  let cloned = false;
  if (await isClone(cwd)) {
    const origin = await originRepo(cwd);
    if (origin?.toLowerCase() !== repo.toLowerCase()) throw new GitError(t.otherClone(dir, origin ?? "?"));
    await must(cwd, ["fetch", "origin", "--prune"], token, 5 * 60_000);
  } else {
    if ((await readdir(cwd).catch(() => [])).length) throw new GitError(t.notEmpty(dir));
    // Clone first, settings after: the helper passed for this one command.
    await must(cwd, ["-c", "credential.https://github.com.helper=", "-c", `credential.https://github.com.helper=${HELPER}`, "clone", `https://github.com/${repo}.git`, "."], token, 10 * 60_000);
    cloned = true;
  }
  await configure(cwd, opts.author);

  const branch = opts.branch;
  if (!(await git(cwd, ["check-ref-format", "--branch", branch])).ok) throw new GitError(t.badBranch(branch));
  const base = await defaultBranch(cwd);
  const current = (await git(cwd, ["branch", "--show-current"])).out;
  let from: string | null = null;
  if (current !== branch) {
    if (await hasRef(cwd, `refs/heads/${branch}`)) await must(cwd, ["checkout", branch]);
    else if (await hasRef(cwd, `refs/remotes/origin/${branch}`)) await must(cwd, ["checkout", "-b", branch, "--track", `origin/${branch}`]);
    else {
      from = base;
      await must(cwd, ["checkout", "-b", branch, ...(base ? [`origin/${base}`] : [])]);
      // Not tracking the base: the first push creates the branch on GitHub.
      await git(cwd, ["branch", "--unset-upstream"]);
    }
  }
  return cloned ? t.cloned(repo, branch, from) : t.fetched(repo, branch);
}

/* ---------- GitHub's API ---------- */

async function github<T>(token: string, method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "agora",
      ...(body !== undefined && { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  const data = (await res.json().catch(() => ({}))) as any;
  if (!res.ok) {
    const detail = [data?.message, ...(Array.isArray(data?.errors) ? data.errors.map((e: any) => e?.message).filter(Boolean) : [])].filter(Boolean).join(" · ");
    throw new GitError(`GitHub ${res.status}${detail ? ` : ${detail}` : ""}`);
  }
  return data as T;
}

const REPOS_TTL_MS = 5 * 60_000;
let reposCache: { token: string; at: number; repos: CodeRepo[] } | null = null;

/** The repositories the instance's token reaches, the latest pushed first; empty without a token. Cached a few minutes. */
export async function listRepos(): Promise<CodeRepo[]> {
  const token = await githubToken();
  if (!token) return [];
  if (reposCache?.token === token && Date.now() - reposCache.at < REPOS_TTL_MS) return reposCache.repos;
  const list = await github<{ full_name: string; private: boolean; pushed_at: string | null; archived?: boolean }[]>(
    token,
    "GET",
    "/user/repos?sort=pushed&per_page=100&affiliation=owner,collaborator,organization_member",
  );
  const repos = list.filter((r) => !r.archived).map((r) => ({ repo: r.full_name, private: r.private, pushedAt: r.pushed_at }));
  reposCache = { token, at: Date.now(), repos };
  return repos;
}

type ApiPull = { number: number; html_url: string; title: string; state: "open" | "closed"; merged_at: string | null; draft?: boolean; base: { ref: string } };

const toPull = (p: ApiPull): CodePullRequest => ({
  number: p.number,
  url: p.html_url,
  title: p.title,
  state: p.merged_at ? "merged" : p.state,
  draft: !!p.draft,
  base: p.base.ref,
});

/** The branch's latest pull request (open first). */
async function pullOf(token: string, repo: string, branch: string): Promise<CodePullRequest | null> {
  const owner = repo.split("/")[0]!;
  const pulls = await github<ApiPull[]>(token, "GET", `/repos/${repo}/pulls?head=${encodeURIComponent(`${owner}:${branch}`)}&state=all&per_page=10`);
  const pick = pulls.find((p) => p.state === "open") ?? pulls[0];
  return pick ? toPull(pick) : null;
}

const PR_URL = /https:\/\/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)\/pull\/(\d+)/g;

/**
 * Pull requests Claude Code opened itself (`gh pr create` prints their link): the last one quoted
 * wins. Its branch may not be the one checked out, nor its repository the clone's origin.
 */
export function pullRequestLinks(texts: string[]): { repo: string; number: number }[] {
  const seen = new Map<string, { repo: string; number: number }>();
  for (const text of texts) {
    for (const m of text.matchAll(PR_URL)) {
      const key = `${m[1]!.toLowerCase()}#${m[2]}`;
      seen.delete(key);
      seen.set(key, { repo: m[1]!, number: Number(m[2]) });
    }
  }
  return [...seen.values()];
}

/** The step of a pull request Claude Code opened on its own, found after its run. */
export const prFoundText = (pr: CodePullRequest) => {
  const t = tr(messages);
  return t.found(pr.number, pr.title, t.states[pr.state]);
};

/* ---------- state ---------- */

/** The branch its pushes go to on the remote, when it tracks one (`fix/x` for `origin/fix/x`). */
async function upstreamBranch(cwd: string) {
  const r = await git(cwd, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"]);
  return r.ok && r.out.includes("/") ? r.out.slice(r.out.indexOf("/") + 1) : null;
}

/** GitHub repository of any other remote, when origin is missing or elsewhere. */
async function anyGithubRemote(cwd: string) {
  const r = await git(cwd, ["config", "--get-regexp", "^remote\\..*\\.url$"]);
  for (const line of r.ok ? r.out.split("\n") : []) {
    const repo = parseRepo(line.split(/\s+/)[1] ?? "");
    if (repo) return repo;
  }
  return null;
}

const MAX_FILES = 200;

/** Files changed and not committed, with their lines added and removed (null for binaries). */
async function changedFiles(cwd: string, hasHead: boolean): Promise<CodeGitFile[]> {
  const [status, numstat] = await Promise.all([
    git(cwd, ["status", "--porcelain=v1", "-z", "--untracked-files=all"]),
    hasHead ? git(cwd, ["diff", "HEAD", "--numstat", "-z", "-M"]) : Promise.resolve({ ok: false, out: "", err: "", raw: "" }),
  ]);
  const counts = new Map<string, [number | null, number | null]>();
  // -z: "added\tremoved\tpath\0", or "added\tremoved\t\0from\0to\0" for a rename.
  const parts = numstat.raw.split("\0");
  for (let i = 0; i < parts.length; i++) {
    const [a, d, path] = parts[i]!.split("\t");
    if (a === undefined || d === undefined) continue;
    const n = (v: string) => (v === "-" ? null : Number(v));
    if (path) counts.set(path, [n(a), n(d)]);
    else {
      counts.set(parts[i + 2] ?? "", [n(a), n(d)]);
      i += 2;
    }
  }
  const files: CodeGitFile[] = [];
  const entries = status.raw.split("\0");
  for (let i = 0; i < entries.length && files.length < MAX_FILES; i++) {
    const e = entries[i]!;
    if (e.length < 4) continue;
    const code = e.slice(0, 2);
    const path = e.slice(3);
    // A rename or copy carries its old path next.
    if (code[0] === "R" || code[0] === "C") i++;
    const state: CodeGitFile["state"] =
      code === "??" ? "added" : code.includes("D") ? "deleted" : code.includes("A") ? "added" : code[0] === "R" ? "renamed" : "modified";
    const [added, removed] = counts.get(path) ?? [null, null];
    files.push({ path, state, added, removed });
  }
  // Untracked files are not in the diff: all their lines are new.
  await Promise.all(
    files
      .filter((f) => f.state === "added" && f.added === null)
      .map(async (f) => {
        const text = await Bun.file(`${cwd}/${f.path}`).text().catch(() => null);
        if (text !== null && !text.includes("\0")) {
          f.added = text ? text.split("\n").length - (text.endsWith("\n") ? 1 : 0) : 0;
          f.removed = 0;
        }
      }),
  );
  return files;
}

/**
 * Where the clone stands; null when the directory is not a git repository. `hints`: what the
 * session knows besides the clone, the repository it was started on and the links of the pull
 * requests Claude Code opened itself (pullRequestLinks).
 */
export async function readGit(cwd: string, hints: { repo?: string | null; pulls?: { repo: string; number: number }[] } = {}): Promise<CodeGit | null> {
  if (!(await isClone(cwd))) return null;
  const token = await githubToken();
  const [branchRun, origin, base, last, upstream] = await Promise.all([
    git(cwd, ["branch", "--show-current"]),
    originRepo(cwd),
    defaultBranch(cwd),
    git(cwd, ["log", "-1", "--format=%h%x00%s"]),
    upstreamBranch(cwd),
  ]);
  const repo = origin ?? (await anyGithubRemote(cwd)) ?? hints.repo ?? hints.pulls?.at(-1)?.repo ?? null;
  const branch = branchRun.out || null;
  const files = await changedFiles(cwd, last.ok && !!last.out);
  const pushed = !!branch && ((await hasRef(cwd, `refs/remotes/origin/${branch}`)) || !!upstream);
  const remoteRef = upstream ? (await git(cwd, ["rev-parse", "--abbrev-ref", "@{upstream}"])).out : `origin/${branch}`;
  let ahead = 0;
  let behind = 0;
  if (branch && pushed) {
    const [a, b] = (await git(cwd, ["rev-list", "--left-right", "--count", `HEAD...${remoteRef}`])).out.split(/\s+/).map(Number);
    ahead = a || 0;
    behind = b || 0;
  } else if (branch && base && (await hasRef(cwd, `refs/remotes/origin/${base}`))) {
    ahead = Number((await git(cwd, ["rev-list", "--count", `origin/${base}..HEAD`])).out) || 0;
  }
  const [sha, subject] = last.ok && last.out ? last.out.split("\0") : [];
  return {
    repo,
    branch,
    base,
    changes: files.length,
    files,
    ahead,
    behind,
    pushed,
    lastCommit: sha ? { sha, subject: subject ?? "" } : null,
    pr: token && repo ? await findPull(token, repo, [branch, upstream], hints.pulls ?? []).catch(() => null) : null,
    github: !!token,
  };
}

/** The pull request of the branch (under its own name or its upstream's), else the last one Claude Code opened. */
async function findPull(token: string, repo: string, branches: (string | null)[], links: { repo: string; number: number }[]) {
  for (const b of new Set(branches.filter((b): b is string => !!b))) {
    const pr = await pullOf(token, repo, b);
    if (pr) return pr;
  }
  const link = links.at(-1);
  return link ? toPull(await github<ApiPull>(token, "GET", `/repos/${link.repo}/pulls/${link.number}`)) : null;
}

/* ---------- commit message ---------- */

const MAX_DIFF = 40_000;

/** What a commit of every change would hold, for its message to be written: the diff (clipped), new files, the repository's recent subjects. */
export async function commitMaterial(cwd: string) {
  const t = tr(messages);
  if (!(await isClone(cwd))) throw new GitError(t.notRepo);
  const hasHead = (await git(cwd, ["rev-parse", "--verify", "--quiet", "HEAD"])).ok;
  const [stat, diff, untracked, log] = await Promise.all([
    hasHead ? git(cwd, ["diff", "HEAD", "--stat"]) : Promise.resolve({ ok: true, out: "", err: "", raw: "" }),
    hasHead ? git(cwd, ["diff", "HEAD", "-M", "--no-color"]) : Promise.resolve({ ok: true, out: "", err: "", raw: "" }),
    git(cwd, ["ls-files", "--others", "--exclude-standard"]),
    hasHead ? git(cwd, ["log", "-12", "--format=%s"]) : Promise.resolve({ ok: true, out: "", err: "", raw: "" }),
  ]);
  if (!stat.out && !untracked.out) throw new GitError(t.nothing);
  return {
    stat: stat.out,
    diff: diff.out.length > MAX_DIFF ? `${diff.out.slice(0, MAX_DIFF)}\n[…]` : diff.out,
    untracked: untracked.out.split("\n").filter(Boolean).slice(0, 100),
    recent: log.out.split("\n").filter(Boolean),
  };
}

/* ---------- actions ---------- */

export type GitOutcome = { text: string; pr?: CodePullRequest; opened?: boolean };

async function context(cwd: string, needToken: boolean) {
  const t = tr(messages);
  if (!(await isClone(cwd))) throw new GitError(t.notRepo);
  const branch = (await git(cwd, ["branch", "--show-current"])).out;
  if (!branch) throw new GitError(t.detached);
  const token = await githubToken();
  if (needToken && !token) throw new GitError(t.noToken);
  const repo = await originRepo(cwd);
  if (needToken && !repo) throw new GitError(t.noRemote);
  return { t, branch, token: token!, repo: repo!, base: await defaultBranch(cwd) };
}

export async function commit(cwd: string, message: string): Promise<GitOutcome> {
  const { t } = await context(cwd, false);
  await must(cwd, ["add", "-A"]);
  if ((await git(cwd, ["diff", "--cached", "--quiet"])).ok) throw new GitError(t.nothing);
  await must(cwd, ["commit", "-m", message]);
  const sha = await must(cwd, ["rev-parse", "--short", "HEAD"]);
  return { text: t.committed(sha, message.split("\n")[0]!) };
}

export async function push(cwd: string): Promise<GitOutcome> {
  const { t, branch, token, base } = await context(cwd, true);
  if (branch === base) throw new GitError(t.onBase(base));
  await must(cwd, ["push", "-u", "origin", `HEAD:refs/heads/${branch}`], token, 5 * 60_000);
  return { text: t.pushed(branch) };
}

export async function pull(cwd: string): Promise<GitOutcome> {
  const { t, branch, token } = await context(cwd, false);
  await must(cwd, ["fetch", "origin", "--prune"], token || null, 5 * 60_000);
  if (await hasRef(cwd, `refs/remotes/origin/${branch}`)) await must(cwd, ["merge", "--ff-only", `origin/${branch}`]);
  return { text: t.pulled(branch) };
}

/** Pushes what is not on GitHub yet, then opens the branch's pull request (or finds the one already open). */
export async function openPullRequest(cwd: string, input: { title: string; body: string; draft: boolean }): Promise<GitOutcome> {
  const { t, branch, token, repo, base } = await context(cwd, true);
  if (!base || branch === base) throw new GitError(t.onBase(base ?? branch));
  await must(cwd, ["push", "-u", "origin", `HEAD:refs/heads/${branch}`], token, 5 * 60_000);
  const existing = await pullOf(token, repo, branch);
  if (existing?.state === "open") return { text: t.existing(existing.number), pr: existing };
  const pr = toPull(await github<ApiPull>(token, "POST", `/repos/${repo}/pulls`, { title: input.title, body: input.body, head: branch, base, draft: input.draft }));
  return { text: t.opened(pr.number, pr.title), pr, opened: true };
}

export async function mergePullRequest(cwd: string, method: "squash" | "merge" | "rebase"): Promise<GitOutcome> {
  const { t, branch, token, repo } = await context(cwd, true);
  const pr = await pullOf(token, repo, branch);
  if (!pr || pr.state !== "open") throw new GitError(t.noPr);
  await github(token, "PUT", `/repos/${repo}/pulls/${pr.number}/merge`, { merge_method: method });
  await git(cwd, ["fetch", "origin", "--prune"], token, 5 * 60_000);
  return { text: t.merged(pr.number, pr.base, method), pr: { ...pr, state: "merged" } };
}
