import { and, eq } from "drizzle-orm";
import { db, schema } from "./db";
import { webhookPrompt } from "./webhook-payload";

/** The prompt of a delivery's turn; null once its webhook was deleted. */
export async function webhookTurnPrompt(deliveryId: string) {
  const [row] = await db
    .select({ name: schema.botWebhook.name, instructions: schema.botWebhook.instructions, payload: schema.botWebhookDelivery.payload })
    .from(schema.botWebhookDelivery)
    .innerJoin(schema.botWebhook, eq(schema.botWebhook.id, schema.botWebhookDelivery.webhookId))
    .where(eq(schema.botWebhookDelivery.id, deliveryId));
  return row ? webhookPrompt(row, row.payload) : null;
}

/** The webhook a delivery came from (null once deleted). */
export async function webhookOfDelivery(deliveryId: string) {
  const [row] = await db.select({ id: schema.botWebhookDelivery.webhookId }).from(schema.botWebhookDelivery).where(eq(schema.botWebhookDelivery.id, deliveryId));
  return row?.id ?? null;
}

/** A session's webhook when it still exists, is on and lets its pull requests merge alone. */
export async function autoMergeWebhook(sessionId: string) {
  const [row] = await db
    .select({ id: schema.botWebhook.id, name: schema.botWebhook.name })
    .from(schema.codeSession)
    .innerJoin(schema.botWebhook, eq(schema.botWebhook.id, schema.codeSession.webhookId))
    .where(and(eq(schema.codeSession.id, sessionId), eq(schema.botWebhook.enabled, true), eq(schema.botWebhook.autoMerge, true)));
  return row ?? null;
}
