/**
 * How a connector's configuration field is entered. The bot declares it
 * (`input`); when it doesn't, the form infers a control from the name and
 * the description so a JSON key is a file, a token is masked, and a site
 * URL stays visible.
 */

export const MCP_ENV_INPUTS = ["text", "secret", "textarea", "file", "select"] as const;
export type McpEnvInput = (typeof MCP_ENV_INPUTS)[number];

/** Hermes receives the value as one env string; a service-account JSON fits, a document doesn't. */
export const MCP_ENV_VALUE_MAX = 32_000;

export type McpEnvField = {
  name: string;
  description?: string;
  required: boolean;
  /** The value is a credential. The form masks it unless the field is a file or a public identifier. */
  secret: boolean;
  input?: McpEnvInput;
  /** Choices when `input` is `select`. */
  options?: string[];
  /** File picker filter, e.g. `.json,application/json`. */
  accept?: string;
  placeholder?: string;
};

const isInput = (value: string): value is McpEnvInput => (MCP_ENV_INPUTS as readonly string[]).includes(value);

const CREDENTIAL_NAME = /(SECRET|TOKEN|PASSWORD|PASSWD|CREDENTIAL|PRIVATE_KEY|_KEY)$/;
const PUBLIC_NAME = /_(URL|URI|HOST|DOMAIN|EMAIL|SITE|ID)$/;
const CREDENTIAL_HINT = /\b(secrets?|tokens?|passwords?|credentials?)\b|mot de passe|jeton|clef|\bcl[eé]s?\b|connection string|cha[iî]ne de connexion/i;

const looksLikeFile = (field: { name: string; description?: string }) => {
  const text = `${field.name} ${field.description ?? ""}`;
  if (/_(JSON|PEM|CERT|P12|PFX|FILE)$/.test(field.name)) return true;
  if (/\.(json|pem|p12|pfx|key)\b/i.test(field.description ?? "")) return true;
  if (/\b(fichier|file)\b/i.test(field.description ?? "")) return true;
  return /\bjson\b/i.test(text) && /\b(cl[eé]|key|compte de service|service account)\b/i.test(text);
};

const shouldMask = (field: { name: string; description?: string; secret?: boolean }) => {
  const credentialName = CREDENTIAL_NAME.test(field.name);
  const hint = CREDENTIAL_HINT.test(field.description ?? "");
  if (PUBLIC_NAME.test(field.name) && !credentialName && !hint) return false;
  if (field.secret) return true;
  return credentialName || hint;
};

/** The control to render for a connector field. An explicit `input` wins. */
export function mcpEnvInput(field: {
  name: string;
  description?: string;
  secret?: boolean;
  input?: string | null;
  options?: string[];
}): McpEnvInput {
  if (field.input && isInput(field.input)) return field.input;
  if (field.options?.length) return "select";
  if (looksLikeFile(field)) return "file";
  if (shouldMask(field)) return "secret";
  return "text";
}

/** Accept filter for a file field: the one declared, else one guessed from the description. */
export function mcpEnvAccept(field: {
  name: string;
  description?: string;
  secret?: boolean;
  input?: string | null;
  options?: string[];
  accept?: string;
}): string | undefined {
  if (mcpEnvInput(field) !== "file") return undefined;
  if (field.accept) return field.accept;
  const text = `${field.name} ${field.description ?? ""}`;
  if (/json/i.test(text)) return ".json,application/json";
  if (/pem|certificat|certificate|\.crt|\.key/i.test(text)) return ".pem,.crt,.cer,.key";
  return undefined;
}

/**
 * Value stored from a picked file. JSON is compacted to one line so a key
 * survives an env file; anything else is kept, without surrounding blank lines.
 */
export function envFileValue(text: string): string {
  const trimmed = text.trim();
  try {
    return JSON.stringify(JSON.parse(trimmed));
  } catch {
    return trimmed;
  }
}

/** Whether a picked file matches an accept list (extensions and MIME types). No list accepts anything. */
export function fileMatchesAccept(name: string, mime: string, accept?: string): boolean {
  if (!accept) return true;
  const parts = accept.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const ext = name.includes(".") ? `.${name.split(".").pop()!.toLowerCase()}` : "";
  const type = mime.toLowerCase();
  return parts.some((p) => p === ext || p === type || (p.endsWith("/*") && type.startsWith(p.slice(0, -1))));
}
