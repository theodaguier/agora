import { readFileSync } from "node:fs";
import rootPkg from "../../../package.json";

/** Metadata frozen when the app image is built (absent in dev). */
function buildInfo(): { app?: string; commit?: string; builtAt?: string } {
  try {
    return JSON.parse(readFileSync("/app/build.json", "utf8"));
  } catch {
    return {};
  }
}

const build = buildInfo();

/** Version of the product (app) and of the Hermes core the API runs on. */
export const version = {
  app: build.app || process.env.APP_VERSION || rootPkg.version,
  hermes: process.env.HERMES_VERSION || "dev",
  commit: build.commit || null,
  builtAt: build.builtAt || null,
};
