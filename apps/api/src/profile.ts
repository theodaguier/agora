import { z } from "zod";
import { defineMessages, tr } from "./i18n";

const required = (max: number) => z.string().trim().min(1).max(max);

/**
 * Profile: first name, last name, role in context (spouse, developer…) and username
 * are required; only the bio is optional.
 */
export const profileInput = z.object({
  firstName: required(60),
  lastName: required(60),
  title: required(60),
  username: z.string().trim().toLowerCase().regex(/^[a-z0-9._]{2,30}$/, "username_invalid"),
  bio: z.string().trim().max(500).optional(),
});

export const fullName = (p: { firstName: string; lastName: string }) => `${p.firstName} ${p.lastName}`.trim();

/** Accepted photos: the app crops them to a square WebP before upload; the rest is just a safety net. */
export const AVATAR_TYPES = ["image/webp", "image/png", "image/jpeg"];
export const AVATAR_MAX = 512 * 1024;

const messages = defineMessages({
  en: { imageFormat: "Unsupported image format.", imageTooLarge: "Image too large (512 KB max)." },
  fr: { imageFormat: "Format d'image non pris en charge.", imageTooLarge: "Image trop lourde (512 Ko max.)." },
});

/** Uploaded photo (raw body, already cropped by the app), or the error to send back. */
export async function readAvatar(req: { header: (name: string) => string | undefined; arrayBuffer: () => Promise<ArrayBuffer> }) {
  const mime = req.header("content-type")?.split(";")[0]?.trim() ?? "";
  if (!AVATAR_TYPES.includes(mime)) return { error: tr(messages).imageFormat, status: 415 as const };
  const data = Buffer.from(await req.arrayBuffer());
  if (!data.length || data.length > AVATAR_MAX) return { error: tr(messages).imageTooLarge, status: 413 as const };
  return { mime, data };
}

export const avatarUrl = (userId: string, at: Date) => `/api/users/${encodeURIComponent(userId)}/avatar?v=${at.getTime()}`;
