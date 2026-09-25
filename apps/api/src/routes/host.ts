import { Hono } from "hono";
import { z } from "zod";
import { activateClaudeAccount, cancelClaudeLogin, ClaudeAccountError, finishClaudeLogin, listClaudeAccounts, removeClaudeAccount, startClaudeLogin } from "../claude-accounts";
import { canUseClaudeCode } from "../claude-code";
import { canUseCodex } from "../codex";
import { activateCodexAccount, cancelCodexLogin, CodexAccountError, codexLoginState, listCodexAccounts, removeCodexAccount, startCodexLogin } from "../codex-accounts";
import { CLI_IDS, HostError, hostClis, localRuntimes, updateCli } from "../host";
import { defineMessages, tr } from "../i18n";
import { createMiddleware } from "hono/factory";
import { requireAdmin, requireUser, type AppEnv } from "../middleware";

const messages = defineMessages({
  en: {
    not_installed: "This CLI isn't installed on the machine.",
    managed: "This CLI is updated by the update service (Settings › Updates).",
    manual: "This install can't be updated from here: update it on the machine.",
    running: "An update is already in progress.",
  },
  fr: {
    not_installed: "Cette CLI n'est pas installée sur la machine.",
    managed: "Cette CLI est mise à jour par le service de mise à jour (Réglages › Mises à jour).",
    manual: "Cette installation ne peut pas être mise à jour d'ici : mets-la à jour sur la machine.",
    running: "Une mise à jour est déjà en cours.",
  },
});

/** The Claude and ChatGPT accounts are their engine owner's subscriptions: only they see and manage them. */
const claudeOwner = createMiddleware<AppEnv>(async (c, next) => {
  if (!canUseClaudeCode(c.get("user"))) return c.json({ error: "forbidden" }, 403);
  await next();
});
const codexOwner = createMiddleware<AppEnv>(async (c, next) => {
  if (!canUseCodex(c.get("user"))) return c.json({ error: "forbidden" }, 403);
  await next();
});

/** The message of an expected failure (unknown account, refused sign-in); anything else goes up. */
const accountError = (err: unknown) => {
  if (err instanceof ClaudeAccountError || err instanceof CodexAccountError) return err.message;
  throw err;
};

/** The machine the API runs on: local models and agent CLIs. Admins only. */
export const host = new Hono<AppEnv>()
  .use(requireUser, requireAdmin)
  .get("/models", async (c) => c.json({ runtimes: await localRuntimes() }))
  .get("/clis", async (c) => c.json({ clis: await hostClis() }))
  /** Forces the latest versions to be fetched again. */
  .post("/clis/check", async (c) => c.json({ clis: await hostClis(true) }))
  .post("/clis/:id/update", async (c) => {
    const id = z.enum(CLI_IDS).safeParse(c.req.param("id"));
    if (!id.success) return c.json({ error: "not_found" }, 404);
    try {
      updateCli(id.data);
    } catch (err) {
      if (err instanceof HostError) return c.json({ error: tr(messages)[err.code] }, 409);
      throw err;
    }
    return c.body(null, 202);
  })

  .get("/claude/accounts", claudeOwner, async (c) => c.json(await listClaudeAccounts()))
  /** Starts signing an account in: the page to sign in on, then its code goes to `/claude/logins/:id`. */
  .post("/claude/logins", claudeOwner, async (c) => {
    try {
      return c.json(await startClaudeLogin(), 201);
    } catch (err) {
      return c.json({ error: accountError(err) }, 502);
    }
  })
  .post("/claude/logins/:id", claudeOwner, async (c) => {
    const body = z.object({ code: z.string().trim().min(1).max(2000) }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    try {
      await finishClaudeLogin(c.req.param("id"), body.data.code, c.get("user").id);
    } catch (err) {
      return c.json({ error: accountError(err) }, 400);
    }
    return c.json(await listClaudeAccounts(), 201);
  })
  .delete("/claude/logins/:id", claudeOwner, async (c) => {
    await cancelClaudeLogin(c.req.param("id"));
    return c.body(null, 204);
  })
  /** `id` null: back to the machine's login. */
  .put("/claude/active", claudeOwner, async (c) => {
    const body = z.object({ id: z.string().max(100).nullable() }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    try {
      await activateClaudeAccount(body.data.id, c.get("user").id);
    } catch (err) {
      return c.json({ error: accountError(err) }, 404);
    }
    return c.json(await listClaudeAccounts());
  })
  .delete("/claude/accounts/:id", claudeOwner, async (c) => {
    try {
      await removeClaudeAccount(c.req.param("id"), c.get("user").id);
    } catch (err) {
      return c.json({ error: accountError(err) }, 404);
    }
    return c.json(await listClaudeAccounts());
  })

  .get("/codex/accounts", codexOwner, async (c) => c.json(await listCodexAccounts()))
  /** Starts signing an account in: the page and the one-time code to enter there; the sign-in then ends by itself. */
  .post("/codex/logins", codexOwner, async (c) => {
    try {
      return c.json(await startCodexLogin(c.get("user").id), 201);
    } catch (err) {
      return c.json({ error: accountError(err) }, 502);
    }
  })
  /** Polled by the dialog: `done` comes with the accounts, `failed` with why. */
  .get("/codex/logins/:id", codexOwner, async (c) => {
    const login = codexLoginState(c.req.param("id"));
    return c.json(login.state === "done" ? { ...login, accounts: await listCodexAccounts() } : login);
  })
  .delete("/codex/logins/:id", codexOwner, async (c) => {
    await cancelCodexLogin(c.req.param("id"));
    return c.body(null, 204);
  })
  .put("/codex/active", codexOwner, async (c) => {
    const body = z.object({ id: z.string().max(100).nullable() }).safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "invalid_body" }, 400);
    try {
      await activateCodexAccount(body.data.id, c.get("user").id);
    } catch (err) {
      return c.json({ error: accountError(err) }, 404);
    }
    return c.json(await listCodexAccounts());
  })
  .delete("/codex/accounts/:id", codexOwner, async (c) => {
    try {
      await removeCodexAccount(c.req.param("id"), c.get("user").id);
    } catch (err) {
      return c.json({ error: accountError(err) }, 404);
    }
    return c.json(await listCodexAccounts());
  });
