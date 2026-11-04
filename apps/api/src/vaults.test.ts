import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { eq, inArray, sql } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import { db, schema } from "./db";
import {
  answerLoginRequest,
  askLogin,
  botContact,
  botRequestStatus,
  botSearch,
  cardBrand,
  createItem,
  createSharedVault,
  decideVaultRequest,
  getVaultRequest,
  listItems,
  listVaults,
  mergeSecret,
  personalVault,
  publicFields,
  REQUEST_TTL_MS,
  requestLogin,
  revealItem,
  updateItem,
  updateVault,
  vaultTurn,
  type VaultTurn,
} from "./vaults";

describe("vault items", () => {
  test("a card keeps only its brand and last 4 digits in its public fields", () => {
    const secret = mergeSecret("card", { number: "4242 4242 4242 4242", cvc: "123" });
    expect(secret).toEqual({ number: "4242424242424242", cvc: "123" });
    const fields = publicFields("card", { holder: "Théo", expiry: "04/29", number: "4242424242424242", last4: "0000" }, secret.number);
    expect(fields).toEqual({ holder: "Théo", expiry: "04/29", brand: "Visa", last4: "4242" });
  });
  test("brands", () => {
    expect(cardBrand("5555555555554444")).toBe("Mastercard");
    expect(cardBrand("378282246310005")).toBe("American Express");
    expect(cardBrand("9999999999999")).toBe("");
  });
  test("an empty secret keeps its value, null clears it, other kinds' secrets are dropped", () => {
    const before = { password: "old", notes: "n" };
    expect(mergeSecret("login", { password: "", notes: null, number: "4242424242424242" }, before)).toEqual({ password: "old" });
  });
  test("invalid card details are refused", () => {
    expect(() => mergeSecret("card", { number: "12" })).toThrow();
    expect(() => mergeSecret("card", { cvc: "12a" })).toThrow();
    expect(() => publicFields("card", { expiry: "13/30" })).toThrow();
  });
  test("a turn nobody started can't use the vault", () => {
    expect(vaultTurn(null)).toHaveProperty("error", "no_turn");
    expect(vaultTurn({ conversationId: "c", agentId: "a", requestedBy: null })).toHaveProperty("error", "no_turn");
    expect(vaultTurn({ conversationId: "c", agentId: "a", requestedBy: "u" })).toEqual({ conversationId: "c", agentId: "a", requestedBy: "u" });
  });
});

describe.skipIf(process.env.AGORA_DB_TESTS !== "1")("vault access against PostgreSQL", () => {
  const p = crypto.randomUUID();
  const me = `${p}-me`, colleague = `${p}-colleague`, outsider = `${p}-outsider`;
  const dev = `${p}-dev`, other = `${p}-other-bot`;
  const conv = `${p}-conv`;
  const users = [me, colleague, outsider];
  let migrated = false;
  const announced: unknown[] = [];
  const announce = async (_c: string, e: unknown) => void announced.push(e);
  let loginId = "", cardId = "", contactId = "", sharedId = "";

  beforeAll(async () => {
    const result = await db.execute<{ name: string }>(sql`select current_database() as name`);
    if (result[0]?.name !== "agora_test") throw new Error("Database tests require an isolated database named agora_test");
    await migrate(db, { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
    migrated = true;
    await db.insert(schema.user).values(users.map((id) => ({ id, name: id.slice(-5), email: `${id}@example.invalid` })));
    await db.insert(schema.agent).values([dev, other].map((id) => ({ id, name: id.endsWith("dev") ? "Dev" : "Other", hermesProfile: id, avatarShape: "circle" as never, avatarColor: "blue" })));
    await db.insert(schema.agentAccess).values([{ userId: me, agentId: dev }]);
    await db.insert(schema.conversation).values({ id: conv, kind: "direct", createdBy: me });
    await db.insert(schema.conversationMember).values({ conversationId: conv, userId: me });

    const own = await personalVault(me);
    await updateVault({ id: me }, own.id, { agentIds: [dev] });
    loginId = (await createItem(me, own.id, { kind: "login", title: "mon-marche.fr", website: "https://mon-marche.fr", fields: { username: "theo" }, secret: { password: "hunter2" } })).id;
    cardId = (await createItem(me, own.id, { kind: "card", title: "Carte pro", website: null, fields: { holder: "Théo", expiry: "04/29" }, secret: { number: "4242424242424242", cvc: "123" } })).id;
    const shared = await createSharedVault({ id: colleague, role: "admin" }, { name: "Compta", memberIds: [], agentIds: [dev] });
    sharedId = shared.id;
    contactId = (await createItem(colleague, sharedId, { kind: "contact", title: "Siège", website: null, fields: { name: "E-do", email: "a@b.c" }, secret: { notes: "private" } })).id;
  }, 60_000);

  // The connection is shared by every test file of the run: it isn't closed here.
  afterAll(async () => {
    if (!migrated) return;
    await db.delete(schema.vault).where(inArray(schema.vault.createdBy, users));
    await db.delete(schema.conversation).where(eq(schema.conversation.id, conv));
    await db.delete(schema.agent).where(inArray(schema.agent.id, [dev, other]));
    await db.delete(schema.user).where(inArray(schema.user.id, users));
  }, 30_000);

  const turn = (agentId = dev, requestedBy = me): VaultTurn => ({ conversationId: conv, agentId, requestedBy });

  test("a person sees their personal vault first, and only the shared vaults they belong to", async () => {
    const mine = await listVaults(me);
    expect(mine[0]!.kind).toBe("personal");
    expect(mine.map((v) => v.id)).not.toContain(sharedId);
    expect((await listVaults(colleague)).map((v) => v.id)).toContain(sharedId);
  });

  test("a non-member can't read a vault's items", async () => {
    await expect(listItems(outsider, sharedId)).rejects.toMatchObject({ status: 404 });
    await expect(listItems(me, sharedId)).rejects.toMatchObject({ status: 404 });
  });

  test("a bot not allowed in the vault sees nothing", async () => {
    expect(await botSearch(turn(other))).toEqual([]);
    await expect(requestLogin(turn(other), loginId, "x", announce)).rejects.toMatchObject({ status: 404 });
  });

  test("a bot reads a shared vault only for one of its members", async () => {
    expect((await botSearch(turn(dev, me))).map((i) => i.id)).not.toContain(contactId);
    await expect(botContact(turn(dev, me), contactId)).rejects.toMatchObject({ status: 404 });
    const contact = await botContact(turn(dev, colleague), contactId);
    expect(contact).toMatchObject({ name: "E-do", email: "a@b.c" });
    expect(JSON.stringify(contact)).not.toContain("private");
  });

  test("a card's number and security code never reach a bot", async () => {
    const items = await botSearch(turn(), undefined, "card");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ last4: "4242", brand: "Visa", holder: "Théo", expiry: "04/29" });
    const raw = JSON.stringify(await botSearch(turn()));
    expect(raw).not.toContain("4242424242424242");
    expect(raw).not.toMatch(/"(number|cvc|password|notes)"/);
    expect(raw).not.toContain("hunter2");
    await expect(requestLogin(turn(), cardId, "pay", announce)).rejects.toMatchObject({ status: 400 });
    await expect(botContact(turn(), cardId)).rejects.toMatchObject({ status: 400 });
    // The person sees them.
    expect(await revealItem(me, (await listVaults(me))[0]!.id, cardId)).toEqual({ number: "4242424242424242", cvc: "123" });
  });

  test("an update without a new number keeps the card's last 4 digits", async () => {
    const own = (await listVaults(me))[0]!.id;
    const next = await updateItem(me, own, cardId, { fields: { holder: "T. Daguier", expiry: "05/30" }, secret: { number: "", cvc: "" } });
    expect(next.fields).toEqual({ holder: "T. Daguier", expiry: "05/30", brand: "Visa", last4: "4242" });
    expect(await revealItem(me, own, cardId)).toEqual({ number: "4242424242424242", cvc: "123" });
  });

  test("using a login asks the person: approve", async () => {
    const req = await requestLogin(turn(), loginId, "Commander les courses", announce);
    expect(announced.at(-1)).toEqual({ type: "vault.request", bot: "Dev", item: "mon-marche.fr", requestId: req.id });
    expect(await botRequestStatus(turn(), req.id)).toEqual({ status: "pending" });
    // Asking again reuses the pending request.
    expect((await requestLogin(turn(), loginId, "again", announce)).id).toBe(req.id);
    const dto = await getVaultRequest({ id: me }, req.id);
    expect(dto).toMatchObject({ status: "pending", agentName: "Dev", item: { title: "mon-marche.fr", username: "theo" }, requestedBy: me });
    expect(JSON.stringify(dto)).not.toContain("hunter2");
    // Nobody else answers.
    await expect(decideVaultRequest({ id: outsider }, req.id, true)).rejects.toMatchObject({ status: 404 });
    await expect(decideVaultRequest({ id: outsider, role: "admin" }, req.id, true)).rejects.toMatchObject({ status: 403 });
    expect((await decideVaultRequest({ id: me }, req.id, true)).status).toBe("approved");
    expect(await botRequestStatus(turn(), req.id)).toEqual({ status: "approved", website: "https://mon-marche.fr", username: "theo", password: "hunter2" });
    // Another bot or conversation can't collect it.
    await expect(botRequestStatus(turn(other), req.id)).rejects.toMatchObject({ status: 404 });
    await expect(decideVaultRequest({ id: me }, req.id, false)).rejects.toMatchObject({ status: 409 });
  });

  test("using a login asks the person: deny", async () => {
    const req = await requestLogin(turn(), loginId, "x", announce);
    expect((await decideVaultRequest({ id: me }, req.id, false)).status).toBe("denied");
    expect(await botRequestStatus(turn(), req.id)).toEqual({ status: "denied" });
  });

  test("an unanswered request expires, and so does an answer the bot no longer waits for", async () => {
    const req = await requestLogin(turn(), loginId, "x", announce);
    await db.update(schema.vaultRequest).set({ createdAt: new Date(Date.now() - REQUEST_TTL_MS - 1000) }).where(eq(schema.vaultRequest.id, req.id));
    expect(await botRequestStatus(turn(), req.id)).toEqual({ status: "expired" });
    await expect(decideVaultRequest({ id: me }, req.id, true)).rejects.toMatchObject({ status: 409 });

    const gone = await requestLogin(turn(), loginId, "x", announce);
    await expect(decideVaultRequest({ id: me }, gone.id, true, () => false)).rejects.toMatchObject({ status: 409 });
    expect(await botRequestStatus(turn(), gone.id)).toEqual({ status: "expired" });
  });

  test("a login the bot doesn't have: the person types it on the card, it is saved and handed over", async () => {
    const own = (await listVaults(me))[0]!.id;
    await expect(askLogin(turn(), "pas une adresse", "x", announce)).rejects.toMatchObject({ status: 400 });
    // A bot that may read none of the person's vaults can't ask either.
    await expect(askLogin(turn(other), "https://impots.gouv.fr", "x", announce)).rejects.toMatchObject({ status: 403 });
    const req = await askLogin(turn(), "www.impots.gouv.fr/connexion", "Télécharger l'avis d'imposition", announce);
    expect(announced.at(-1)).toEqual({ type: "vault.request", bot: "Dev", item: "impots.gouv.fr", requestId: req.id, ask: true });
    // Asking again for the same site reuses it.
    expect((await askLogin(turn(), "https://www.impots.gouv.fr", "again", announce)).id).toBe(req.id);
    expect(await botRequestStatus(turn(), req.id)).toEqual({ status: "pending" });
    const dto = await getVaultRequest({ id: me }, req.id);
    expect(dto).toMatchObject({ kind: "ask", status: "pending", item: { id: null, title: "impots.gouv.fr", website: "https://www.impots.gouv.fr" } });
    expect(dto.vaults?.map((v) => v.id)).toEqual([own]);
    // Plain approval has nothing to give; only its person answers, in a vault the bot may read.
    await expect(decideVaultRequest({ id: me }, req.id, true)).rejects.toMatchObject({ status: 400 });
    await expect(answerLoginRequest({ id: outsider, role: "admin" }, req.id, { vaultId: own, username: "u", password: "p" })).rejects.toMatchObject({ status: 403 });
    await expect(answerLoginRequest({ id: me }, req.id, { vaultId: sharedId, username: "u", password: "p" })).rejects.toMatchObject({ status: 403 });
    const done = await answerLoginRequest({ id: me }, req.id, { vaultId: own, username: "theo.d", password: "s3cret" });
    expect(done).toMatchObject({ status: "approved", item: { title: "impots.gouv.fr", username: "theo.d" } });
    expect(JSON.stringify(done)).not.toContain("s3cret");
    expect(await botRequestStatus(turn(), req.id)).toEqual({ status: "approved", website: "https://www.impots.gouv.fr", username: "theo.d", password: "s3cret" });
    expect((await listItems(me, own)).map((i) => i.title)).toContain("impots.gouv.fr");
    await expect(answerLoginRequest({ id: me }, req.id, { vaultId: own, username: "u", password: "p" })).rejects.toMatchObject({ status: 409 });
  });

  test("a login typed after the bot gave up is kept, the request expires", async () => {
    const own = (await listVaults(me))[0]!.id;
    const req = await askLogin(turn(), "https://ameli.fr", "x", announce);
    expect((await answerLoginRequest({ id: me }, req.id, { vaultId: own, username: "u", password: "p" }, () => false)).status).toBe("expired");
    expect((await listItems(me, own)).map((i) => i.title)).toContain("ameli.fr");
    expect(await botRequestStatus(turn(), req.id)).toEqual({ status: "expired" });
  });

  test("only bots the person can talk to can be added to a vault", async () => {
    const own = (await listVaults(me))[0]!.id;
    await expect(updateVault({ id: me }, own, { agentIds: [dev, other] })).rejects.toMatchObject({ status: 403 });
  });
});
