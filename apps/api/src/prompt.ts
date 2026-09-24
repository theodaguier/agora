import { dirname } from "node:path";
import { schema } from "./db";
import { skillFile, skills } from "./hermes";
import { agentMcpServers } from "./hermes-admin";
import { listRoutines, routineBrief } from "./routines";

/** The Hermes API server caps a request at 10 MB: beyond that, the image is passed by its path. */
const MAX_INLINE_IMAGES = 6 * 1024 * 1024;
const INLINE_IMAGE = /^image\/(png|jpe?g|webp|gif)$/;

export type AttachmentRow = typeof schema.attachment.$inferSelect;

/**
 * A routine is designated by its Hermes job id; its name is only for display.
 * In a group, `agentId` is the bot whose skill was picked.
 */
export type Invocation = { kind: "skill" | "mcp"; name: string; agentId?: string } | { kind: "routine"; id: string; name: string };

/**
 * Keeps only the skills and MCP servers the admin left enabled for this agent,
 * and the routines of this conversation (under their current name).
 */
export async function allowedInvocations(profile: string, conversationId: string, invocations: Invocation[]) {
  if (!invocations.length) return [];
  const [allowedSkills, mcp, routines] = await Promise.all([skills(profile), agentMcpServers(profile), listRoutines(profile, conversationId)]);
  const allowed = new Set([
    ...allowedSkills.map((s) => `skill:${s.name}`),
    ...mcp.filter((m) => m.enabled).map((m) => `mcp:${m.name}`),
  ]);
  return invocations.flatMap((inv): Invocation[] => {
    if (inv.kind !== "routine") return allowed.has(`${inv.kind}:${inv.name}`) ? [inv] : [];
    const r = routines.find((x) => x.id === inv.id);
    return r ? [{ kind: "routine", id: r.id, name: r.name }] : [];
  });
}

/**
 * Reproduces Hermes's `/skill` invocation (agent/skill_commands.py), which the
 * API server doesn't do: the skill content is loaded into the message with the
 * same activation instruction. For an MCP server, the agent is pointed at
 * that server's tools.
 */
export async function withInvocations(profile: string, text: string, invocations: Invocation[]) {
  if (!invocations.length) return text;
  const blocks: string[] = [];
  for (const inv of invocations) {
    if (inv.kind === "routine") {
      const r = await routineBrief(profile, inv.id);
      if (!r) continue;
      blocks.push(
        `[The user is referring to their routine "${r.name}" (cron job_id ${r.id}, schedule: ${r.cron ?? r.schedule}, ` +
          `${r.enabled ? `next run: ${r.nextRunAt ?? "unknown"}` : "paused"}). Its instruction:\n${r.prompt}\n` +
          `To act on it, use the cronjob tool with job_id ${r.id}.]`,
      );
    } else if (inv.kind === "skill") {
      const path = await skillFile(profile, inv.name);
      if (!path) continue;
      const content = await Bun.file(path).text();
      blocks.push(
        `[IMPORTANT: The user has invoked the "${inv.name}" skill, indicating they want you to follow its instructions. The full skill content is loaded below.]\n` +
          `[Skill directory: ${dirname(path)}]\n\n${content}`,
      );
    } else {
      blocks.push(
        `[IMPORTANT: The user wants this request handled with the "${inv.name}" MCP server. Use its tools (mcp__${inv.name}__*).]`,
      );
    }
  }
  if (!blocks.length) return text;
  return `${blocks.join("\n\n---\n\n")}\n\n---\n\nUser request: ${text || "(aucune instruction supplémentaire)"}`;
}

/**
 * Prepares the message for Hermes: images inline (data URL) while they fit,
 * other files (and large images) referenced by their absolute path, which the
 * agent reads with read_attachment (agora_files plugin) / vision_analyze.
 */
export async function withAttachments(text: string, files: AttachmentRow[]) {
  const images: string[] = [];
  const byPath: AttachmentRow[] = [];
  let budget = MAX_INLINE_IMAGES;
  for (const f of files) {
    if (INLINE_IMAGE.test(f.mime) && f.size <= budget) {
      budget -= f.size;
      const bytes = Buffer.from(await Bun.file(f.path).arrayBuffer());
      images.push(`data:${f.mime};base64,${bytes.toString("base64")}`);
    } else {
      byPath.push(f);
    }
  }
  if (!byPath.length) return { text, images };
  const list = byPath.map((f) => `- ${f.name} (${f.mime}, ${Math.ceil(f.size / 1024)} Ko) : ${f.path}`).join("\n");
  const note = `[Fichiers joints par l'utilisateur. Lis-les avec read_attachment (vision_analyze pour les images) avant de répondre.]\n${list}`;
  return { text: text ? `${text}\n\n${note}` : note, images };
}
