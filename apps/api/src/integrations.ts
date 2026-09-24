/**
 * Integration type of each MCP server (mail, calendar…). It picks the
 * connector's icon, and which view formats a bot is taught (views.ts): only
 * those of the types it's actually connected to.
 */
import { type IntegrationType } from "@agora/core";
import { eq } from "drizzle-orm";
import { db, schema } from "./db";
import { agentMcpServers } from "./hermes-admin";

const { mcpIntegration } = schema;

export async function getTypes(): Promise<Record<string, IntegrationType>> {
  const rows = await db.select().from(mcpIntegration);
  return Object.fromEntries(rows.map((r) => [r.server, r.type]));
}

export async function setType(server: string, type: IntegrationType) {
  await db
    .insert(mcpIntegration)
    .values({ server, type })
    .onConflictDoUpdate({ target: mcpIntegration.server, set: { type, updatedAt: new Date() } });
}

export async function clearType(server: string) {
  await db.delete(mcpIntegration).where(eq(mcpIntegration.server, server));
}

/** Types of the servers enabled for a profile (the default profile sees them all). */
export async function typesForProfile(profile: string): Promise<IntegrationType[]> {
  const [servers, types] = await Promise.all([agentMcpServers(profile).catch(() => []), getTypes()]);
  return [...new Set(servers.filter((s) => s.enabled && types[s.name]).map((s) => types[s.name]!))];
}
