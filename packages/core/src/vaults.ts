/**
 * Coffre-fort: logins, payment cards and contact details kept for people and the bots they allow.
 * A person has one personal vault and may share others; each vault lists the bots that may read it.
 * Bots never see a card's number or security code, and use a login's password only once the person agrees.
 */
export type VaultKind = "personal" | "shared";
export type VaultItemKind = "login" | "card" | "contact";
export const VAULT_ITEM_KINDS: VaultItemKind[] = ["login", "card", "contact"];

export type VaultSummary = {
  id: string;
  name: string;
  kind: VaultKind;
  counts: Record<VaultItemKind, number>;
  agentIds: string[];
  memberIds: string[];
  canManage: boolean;
};

/** An item without its secrets: login {username}, card {holder, brand, last4, expiry}, contact {name, email, phone, address, company}. */
export type VaultItem = {
  id: string;
  vaultId: string;
  kind: VaultItemKind;
  title: string;
  website: string | null;
  fields: Record<string, string>;
  /** A note is sealed with the secrets: this only says there is one to reveal. */
  hasNotes: boolean;
  updatedAt: string;
};

export type VaultItemSecret = { password?: string; number?: string; cvc?: string; notes?: string };

export type VaultItemInput = {
  kind: VaultItemKind;
  title: string;
  website?: string | null;
  fields: Record<string, string>;
  secret: VaultItemSecret;
};

export type VaultRequestStatus = "pending" | "approved" | "denied" | "expired";
/** `use`: a login already in the vault. `ask`: one the bot doesn't have, the person types it on the card. */
export type VaultRequestKind = "use" | "ask";

/** A bot asking for a login, shown as a card in the conversation. */
export type VaultRequestDto = {
  id: string;
  kind: VaultRequestKind;
  status: VaultRequestStatus;
  agentId: string;
  agentName: string;
  /** `ask`: no item (`id` null) until the person saved the login; its title is then the site's name. */
  item: { id: string | null; title: string; website: string | null; username?: string };
  vaultName: string;
  /** `ask`, pending, for its requester: the vaults the login can be saved in (those the bot may read). */
  vaults?: { id: string; name: string; kind: VaultKind }[];
  reason: string;
  /** The person who started the turn: the only one who can answer. */
  requestedBy: string | null;
  createdAt: string;
};
