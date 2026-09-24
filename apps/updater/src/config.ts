/** Update service configuration (container environment variables). */
export const config = {
  port: Number(process.env.PORT ?? 8787),
  token: process.env.UPDATER_TOKEN ?? "",
  /** infra/ directory mounted at the SAME path as on the host (compose bind mounts resolve against it). */
  projectDir: process.env.PROJECT_DIR ?? process.cwd(),
  project: process.env.COMPOSE_PROJECT_NAME ?? "agora",
  stateFile: process.env.STATE_FILE ?? "/state/updates.json",
  backupsVolume: process.env.BACKUPS_VOLUME ?? "agora_backups",
  backupsDir: process.env.BACKUPS_DIR ?? "/backups",
  keepBackups: Number(process.env.KEEP_BACKUPS ?? 7),
  hermesRepo: process.env.HERMES_REPO ?? "nousresearch/hermes-agent",
  /** Registry for the app images (e.g. ghcr.io/<user>/agora); empty = locally built images. */
  imagePrefix: process.env.AGORA_IMAGE_PREFIX ?? "agora",
  registryToken: process.env.REGISTRY_TOKEN ?? "",
  registryUser: process.env.REGISTRY_USER ?? "",
  checkEveryMinutes: Number(process.env.CHECK_EVERY_MINUTES ?? 60),
  tz: process.env.TZ ?? "Europe/Paris",
};

export const hermesImage = (version: string) => `${config.hermesRepo}:${version}`;
export const appImage = (kind: "app" | "web" | "updater", version: string) => `${config.imagePrefix}-${kind}:${version}`;
export const usesRegistry = () => /^[a-z0-9.-]+\.[a-z]{2,}(:\d+)?\//.test(config.imagePrefix);
