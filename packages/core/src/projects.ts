/**
 * A project's page (Figma « Proposition — Page projet », section 11): its status, lead, repository and
 * due date, the context its bots read with every message, its links, and what its bots may do in it.
 */

export type ProjectStatus = "planned" | "in_progress" | "paused" | "done" | "cancelled";

export const PROJECT_STATUSES: ProjectStatus[] = ["planned", "in_progress", "paused", "done", "cancelled"];

/** A link of the project (its repository on GitHub, its Figma file, production…), shown with its site's logo. */
export type ProjectResource = { url: string; label: string };

export const MAX_PROJECT_RESOURCES = 20;
export const MAX_PROJECT_CONTEXT = 20_000;

/** What the bots of a project may do with it. */
export type ProjectBotAccess = {
  /** The context: not given to them, read with every message, or also rewritten by them. */
  context: "none" | "read" | "write";
  /** The project's files and pages: hidden, listed to them, or also added by them. */
  data: "none" | "read" | "add";
  /** Discussions: they may name the ones still untitled (and rename them), or not. */
  discussions: "none" | "rename";
  /** Code sessions: started on the project's repository by default, or not. */
  sessions: "none" | "repo";
};

export const PROJECT_BOT_ACCESS_OPTIONS: { [K in keyof ProjectBotAccess]: ProjectBotAccess[K][] } = {
  context: ["none", "read", "write"],
  data: ["none", "read", "add"],
  discussions: ["none", "rename"],
  sessions: ["none", "repo"],
};

export const DEFAULT_PROJECT_BOT_ACCESS: ProjectBotAccess = { context: "write", data: "add", discussions: "rename", sessions: "repo" };

export const projectBotAccess = (stored: Partial<ProjectBotAccess> | null | undefined): ProjectBotAccess => ({ ...DEFAULT_PROJECT_BOT_ACCESS, ...stored });

/** Who last changed the context: a member or a bot, by name (kept if they leave). */
export type ProjectContextAuthor = { kind: "user" | "agent"; id: string; name: string };

/** The project's properties, as the API returns them on a project (null on other conversations). */
export type ProjectInfo = {
  status: ProjectStatus;
  leadId: string | null;
  repo: string | null;
  dueOn: string | null;
  context: string;
  contextUpdatedAt: string | null;
  contextAuthor: ProjectContextAuthor | null;
  resources: ProjectResource[];
  botAccess: ProjectBotAccess;
};

/** The hostname a link's logo is looked up by (github.com, figma.com…), or null for a malformed URL. */
export function resourceDomain(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}
