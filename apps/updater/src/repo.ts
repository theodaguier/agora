import { stat } from "node:fs/promises";
import { dirname } from "node:path";
import { UpdaterError } from "./coded";
import { config } from "./config";
import { must, run } from "./exec";

/**
 * Keeps the server's checkout on the tag of the running version: compose reads
 * docker-compose.yml, the api image's Dockerfile and the Hermes plugins from
 * it, and `agora backup-offsite` runs from it, while the images alone follow
 * the updates. Skipped when the install isn't a git checkout.
 *
 * git runs as the checkout's owner (su-exec), so that no file becomes root's
 * and the admin's own git commands keep working.
 */
export async function checkoutVersion(version: string) {
  const root = dirname(config.projectDir);
  const { uid, gid } = await stat(root);
  const git = (...args: string[]) => ["su-exec", `${uid}:${gid}`, "env", "HOME=/tmp", "git", "-C", root, ...args];

  if ((await run(git("rev-parse", "--is-inside-work-tree"))).code !== 0) return;
  const tag = `v${version}`;
  // Offline or without a remote: the tag may already be there.
  await run(git("fetch", "--quiet", "--tags", "origin"), { timeoutMs: 2 * 60_000 });
  if ((await run(git("rev-parse", "--verify", "--quiet", `refs/tags/${tag}`))).code !== 0) {
    throw new UpdaterError(`tag ${tag} introuvable dans le dépôt du serveur`, "repo_tag_missing", { tag });
  }
  // Fails on local changes to tracked files rather than overwriting them.
  await must(git("checkout", "--quiet", tag));
}
