import { Hono } from "hono";
import { z } from "zod";
import { CLI_IDS, HostError, hostClis, localRuntimes, updateCli } from "../host";
import { defineMessages, tr } from "../i18n";
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
  });
