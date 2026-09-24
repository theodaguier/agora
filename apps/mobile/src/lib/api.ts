import * as Device from "expo-device";
import { File } from "expo-file-system";
import { auth, common } from "@agora/core/i18n";
import { defineMessages, locale } from "./i18n";
import { type Server } from "./servers";
import { serverToken } from "@/lib/server-tokens";
import { DemoError, demoRequest, isDemo } from "./demo";
import type { Attachment, Invocation, Message, PinTarget } from "./types";

const messages = defineMessages({
  en: {
    notAgoraQr: "This isn't an Agora QR code. Show it from Settings › Mobile app on the web.",
    unreachable: "Couldn't reach the server. Check the address and your connection.",
    notAgora: "No Agora space at this address.",
    invalidAddress: "Enter the address of your Agora space, e.g. agora.example.com.",
    invalid: auth.en.invalid,
    tooMany: auth.en.tooMany,
    invalidCode: auth.en.invalidCode,
    expiredChallenge: auth.en.expiredChallenge,
    unknown: common.en.unknownError,
  },
  fr: {
    notAgoraQr: "Ce n'est pas un QR code Agora. Affiche-le depuis Paramètres › App mobile sur le web.",
    unreachable: "Impossible de joindre le serveur. Vérifie l'adresse et ta connexion.",
    notAgora: "Aucun espace Agora à cette adresse.",
    invalidAddress: "Saisis l'adresse de ton espace Agora, par exemple agora.exemple.com.",
    invalid: auth.fr.invalid,
    tooMany: auth.fr.tooMany,
    invalidCode: auth.fr.invalidCode,
    expiredChallenge: auth.fr.expiredChallenge,
    unknown: common.fr.unknownError,
  },
});

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init: RequestInit & { token?: string | null } = {}): Promise<T> {
  const { token, ...rest } = init;
  if (isDemo(url))
    return demoRequest<T>(url, rest).catch((err) => {
      throw err instanceof DemoError ? new ApiError(err.status, err.message) : err;
    });
  let res: Response;
  try {
    res = await fetch(url, {
      ...rest,
      headers: {
        "Content-Type": "application/json",
        "X-Agora-Locale": locale,
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...rest.headers,
      },
    });
  } catch {
    throw new ApiError(0, messages.unreachable);
  }
  const text = await res.text();
  if (!res.ok) {
    let message = messages.unknown;
    try {
      message = JSON.parse(text).error ?? message;
    } catch {}
    throw new ApiError(res.status, message);
  }
  return (text ? JSON.parse(text) : undefined) as T;
}

/**
 * The instance the signed-in screens talk to (set by ServerScope before they render),
 * so `api("/conversations")` reads like the web's relative calls.
 */
let active: Server | null = null;

export const setActiveServer = (server: Server | null) => {
  active = server;
};

/** Absolute URL of an API path on the active instance (images, attachments). */
export const apiUrl = (path: string) => `${active?.url ?? ""}/api${path}`;

/** Authorization header of the active instance, for requests made outside `api` (images). */
export const authHeaders = (): Record<string, string> => {
  const token = active && serverToken(active.url);
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/** Call to the API of the active instance, with this phone's session. A 401 means it was signed out. */
export function api<T>(path: string, init?: RequestInit): Promise<T> {
  if (!active) return Promise.reject(new ApiError(401, messages.unknown));
  return request<T>(apiUrl(path), { ...init, token: serverToken(active.url) });
}

/** Call to a given instance, outside the signed-in screens (sign-out from the account list). */
export const apiOn = <T,>(server: Server, path: string, init?: RequestInit) =>
  request<T>(`${server.url}/api${path}`, { ...init, token: serverToken(server.url) });

const deviceName = () => Device.deviceName ?? Device.modelName ?? "";

/* ---------- Instance ---------- */

export type Org = { url: string; name: string; image: string | null };

/**
 * "agora.acme.com", "https://agora.acme.com/", "http://192.168.1.20:3001" → origin.
 * Without a scheme, https: a self-hosted instance is served over HTTPS (Caddy).
 */
export function normalizeServer(value: string) {
  const input = value.trim().replace(/\/+$/, "");
  const withScheme = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const match = /^(https?:\/\/[a-z0-9.-]+(?::\d+)?)$/i.exec(withScheme);
  return match ? match[1]!.toLowerCase() : null;
}

/** Checks that an Agora instance answers at this address, and reads its name and logo. */
export async function findOrg(address: string): Promise<Org> {
  const url = normalizeServer(address);
  if (!url) throw new ApiError(400, messages.invalidAddress);
  let org: { name?: unknown; image?: unknown };
  try {
    org = await request(`${url}/api/org`);
  } catch (err) {
    throw err instanceof ApiError && err.status === 0 ? err : new ApiError(404, messages.notAgora);
  }
  if (typeof org?.name !== "string") throw new ApiError(404, messages.notAgora);
  return { url, name: org.name, image: typeof org.image === "string" ? org.image : null };
}

type SignedIn = { token: string; user: Server["user"] };

const toServer = (org: Org, res: SignedIn): { server: Server; token: string } => ({
  server: { url: org.url, orgName: org.name, orgImage: org.image, user: res.user },
  token: res.token,
});

/** Second step asked by the server: the account has two-step verification on. */
export type TwoFactorChallenge = { twoFactor: true; challenge: string };

/**
 * Email and password, like the web login; errors mapped the same way.
 * With two-step verification on, returns the challenge to answer with `verifyTwoFactor`.
 */
export async function signIn(org: Org, email: string, password: string): Promise<ReturnType<typeof toServer> | TwoFactorChallenge> {
  try {
    const res = await request<SignedIn | TwoFactorChallenge>(`${org.url}/api/mobile/sign-in`, {
      method: "POST",
      body: JSON.stringify({ email: email.trim(), password, deviceName: deviceName() }),
    });
    return "twoFactor" in res ? res : toServer(org, res);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status === 0) throw err;
    throw new ApiError(err.status, err.status === 429 ? messages.tooMany : err.status >= 500 ? messages.unknown : messages.invalid);
  }
}

/** Code from the authenticator app, or a backup code, against the challenge of `signIn`. */
export async function verifyTwoFactor(org: Org, challenge: string, code: string, backupCode: boolean) {
  try {
    const res = await request<SignedIn>(`${org.url}/api/mobile/two-factor`, {
      method: "POST",
      body: JSON.stringify({ challenge, code, backupCode, deviceName: deviceName() }),
    });
    return toServer(org, res);
  } catch (err) {
    if (!(err instanceof ApiError) || err.status === 0) throw err;
    const expired = err.message === "INVALID_TWO_FACTOR_COOKIE" || err.message === "TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE";
    throw new ApiError(
      err.status,
      err.status === 429 ? messages.tooMany : expired ? messages.expiredChallenge : err.status >= 500 ? messages.unknown : messages.invalidCode,
    );
  }
}

/* ---------- QR pairing ---------- */

export type Pairing = { server: string; code: string };

/** Reads `agora://connect?server=…&code=…`, from the in-app scanner or a deep link. */
export function readPairing(params: { server?: unknown; code?: unknown }): Pairing | null {
  const server = typeof params.server === "string" && /^https?:\/\//i.test(params.server) ? normalizeServer(params.server) : null;
  const code = typeof params.code === "string" ? params.code : null;
  return server && code ? { server, code } : null;
}

/**
 * Parsed by hand: Linking.parse relies on React Native's URL polyfill, whose hostname and
 * pathname only understand http(s) — `agora://connect` came back with neither, so every scan was refused.
 */
export function parsePairingUrl(data: string): Pairing | null {
  const match = /^agora:\/\/connect\/?\?([^#]*)/i.exec(data.trim());
  if (!match) return null;
  const params: Record<string, string> = {};
  for (const pair of match[1]!.split("&")) {
    const at = pair.indexOf("=");
    if (at <= 0) continue;
    try {
      params[decodeURIComponent(pair.slice(0, at))] = decodeURIComponent(pair.slice(at + 1).replace(/\+/g, " "));
    } catch {
      return null;
    }
  }
  return readPairing(params);
}

export const notAgoraQr = messages.notAgoraQr;

/** Exchanges the QR code for a session of this phone on the instance. */
export async function pair({ server, code }: Pairing) {
  // In turn, not in parallel: the code is single-use, so it is only spent once the instance answers as an Agora space.
  const org = await findOrg(server);
  const res = await request<SignedIn>(`${server}/api/mobile/exchange`, {
    method: "POST",
    body: JSON.stringify({ code, deviceName: deviceName() }),
  });
  return toServer(org, res);
}

/* ---------- Conversations (same helpers as apps/web/src/lib/api.ts) ---------- */

export const conversationPath = (id: string, rest = "") => `/conversations/${encodeURIComponent(id)}${rest}`;

/** Sends a message; bot replies then arrive through the realtime stream. */
export const sendMessage = (
  conversationId: string,
  input: { text: string; attachmentIds: string[]; invocations: Invocation[]; mentions: string[]; replyTo?: string; viewAction?: import("@agora/core").ViewAction },
) => api<Message>(conversationPath(conversationId, "/messages"), { method: "POST", body: JSON.stringify(input) });

/** /new and /compact: the bot starts over on a new Hermes session (with a summary for /compact). */
export const sessionCommand = (conversationId: string, action: "new" | "compact") =>
  api<void>(conversationPath(conversationId, "/session"), { method: "POST", body: JSON.stringify({ action }) });

/** /retry: the bot answers the employee's last message again. */
export const retryLast = (conversationId: string) => api<{ turnId: string }>(conversationPath(conversationId, "/retry"), { method: "POST" });

export const setPinned = (conversationId: string, target: PinTarget, pinned: boolean) =>
  api<void>(conversationPath(conversationId, "/pins"), { method: pinned ? "POST" : "DELETE", body: JSON.stringify(target) });

/** Forwards a message to other conversations; its files are copied. */
export const forwardMessage = (conversationId: string, messageId: string, conversationIds: string[]) =>
  api<{ ids: string[] }>(conversationPath(conversationId, `/messages/${encodeURIComponent(messageId)}/forward`), {
    method: "POST",
    body: JSON.stringify({ conversationIds }),
  });

/** URL of a file on the active instance; load it with `authHeaders()` (expo-image `source.headers`). */
export const attachmentUrl = (id: string, download = false) => apiUrl(`/attachments/${encodeURIComponent(id)}${download ? "?download" : ""}`);

/** A file picked on the phone (image picker, document picker). */
export type LocalFile = { uri: string; name: string; mime: string };

export async function uploadAttachment(conversationId: string, file: LocalFile) {
  const form = new FormData();
  // The global fetch is expo/fetch (Expo 57): it rejects React Native's { uri } parts and encodes a
  // part that has `bytes()`, read here from the file on disk.
  form.append("file", { name: file.name, type: file.mime, bytes: () => new File(file.uri).bytes() } as unknown as Blob);
  let res: Response;
  try {
    res = await fetch(apiUrl(conversationPath(conversationId, "/attachments")), {
      method: "POST",
      headers: { "X-Agora-Locale": locale, ...authHeaders() },
      body: form,
    });
  } catch {
    throw new ApiError(0, messages.unreachable);
  }
  if (!res.ok) {
    const body = await res.text();
    let message = body;
    try {
      message = JSON.parse(body).error ?? body;
    } catch {}
    throw new ApiError(res.status, message);
  }
  return (await res.json()) as Attachment;
}
