import { eq } from "drizzle-orm";
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
