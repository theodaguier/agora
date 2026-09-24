
/** SecureStore keys only allow letters, digits, ".", "-" and "_". */
export const tokenKey = (url: string) => `agora.token.${url.replace(/[^A-Za-z0-9._-]/g, "_")}`;

/** Session tokens, read once at startup; the source of truth stays in the keychain. */
export const tokens = new Map<string, string>();

export const serverToken = (url: string) => tokens.get(url) ?? null;
