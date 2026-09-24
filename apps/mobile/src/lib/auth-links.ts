import * as Linking from "expo-linking";
import { common } from "@agora/core/i18n";
import { ApiError, normalizeServer } from "./api";
import { defineMessages, locale } from "./i18n";

/*
 * The links an instance emails (apps/api/src/invitations.ts invitationLink, auth.ts sendResetPassword):
 * `https://<host>/invite/<token>` and `https://<host>/reset-password/<token>`. They open the web app;
 * on the phone they come pasted, or as `agora://invite?server=…&token=…` (same for reset-password).
 */

export type AuthLinkKind = "invite" | "reset-password";
export type AuthLink = { kind: AuthLinkKind; server: string; token: string };

const messages = defineMessages({
  en: { unreachable: "Couldn't reach the server. Check your connection.", unknown: common.en.unknownError },
  fr: { unreachable: "Impossible de joindre le serveur. Vérifie ta connexion.", unknown: common.fr.unknownError },
});

/** The route params of /invite and /reset-password: an instance (with its scheme) and a token. */
export function readAuthParams(params: { server?: unknown; token?: unknown }): { server: string; token: string } | null {
  const server = typeof params.server === "string" && /^https?:\/\//i.test(params.server) ? normalizeServer(params.server) : null;
  const token = typeof params.token === "string" && params.token.trim() ? params.token.trim() : null;
  return server && token ? { server, token } : null;
}

/** A pasted link: the web one received by email, or the app's `agora://` one. */
export function parseAuthLink(value: string): AuthLink | null {
  const input = value.trim();
  const web = /^(https?:\/\/[^/?#\s]+)\/(invite|reset-password)\/([^/?#\s]+)\/?(?:[?#].*)?$/i.exec(input);
  if (web) {
    const server = normalizeServer(web[1]!);
    return server ? { kind: web[2]!.toLowerCase() as AuthLinkKind, server, token: decodeURIComponent(web[3]!) } : null;
  }
  const { scheme, hostname, path, queryParams } = Linking.parse(input);
  const kind = hostname ?? path;
  if (scheme !== "agora" || (kind !== "invite" && kind !== "reset-password") || !queryParams) return null;
  const read = readAuthParams(queryParams);
  return read ? { kind, ...read } : null;
}

/** A public call to an instance (no session): its `{ error }` message, status 0 when unreachable. */
export async function publicRequest<T>(server: string, path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${server}/api${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", "X-Agora-Locale": locale, ...init.headers },
    });
  } catch {
    throw new ApiError(0, messages.unreachable);
  }
  const text = await res.text();
  let body: { error?: unknown; code?: unknown } | null = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {}
  if (!res.ok) {
    const error = new ApiError(res.status, typeof body?.error === "string" ? body.error : messages.unknown);
    // Better Auth's errors carry a code (INVALID_TOKEN, PASSWORD_TOO_SHORT…).
    if (typeof body?.code === "string") Object.assign(error, { code: body.code });
    throw error;
  }
  return body as T;
}

export const errorCode = (err: unknown) => (err as { code?: unknown } | null)?.code;
