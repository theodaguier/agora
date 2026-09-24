import { useQuery, type QueryClient } from "@tanstack/react-query";
import { useMe } from "@/components/server-scope";
import { api, ApiError, apiUrl, authHeaders } from "@/lib/api";
import { readLocalFile } from "@/lib/files";
import { defineMessages, locale } from "@/lib/i18n";
import { sessionQuery } from "@/lib/queries";
import type { SessionUser } from "@/lib/types";

const messages = defineMessages({
  en: { avatarUploadFailed: "The photo couldn't be uploaded." },
  fr: { avatarUploadFailed: "La photo n'a pas pu être envoyée." },
});

/**
 * The signed-in account with its profile, as `/auth/get-session` returns it (Better Auth's
 * additional fields, apps/api/src/auth.ts). The shared SessionUser only types what every screen needs.
 */
export type Me = SessionUser & {
  firstName?: string;
  lastName?: string;
  title?: string;
  username?: string | null;
  bio?: string;
  locale?: string | null;
  releaseNotesSeen?: string | null;
  createdAt?: string;
};

export function useMeProfile(): Me {
  const fallback = useMe();
  const session = useQuery(sessionQuery).data as Me | null | undefined;
  return session ?? fallback;
}

/** Profile editable by its owner (apps/web/src/lib/api.ts ProfileInput). */
export type ProfileInput = { firstName: string; lastName: string; title: string; username?: string; bio?: string };

export const saveProfile = (profile: ProfileInput) => api("/me", { method: "PATCH", body: JSON.stringify(profile) });

/** A photo picked and cropped on the phone: the raw file goes up as the body, like the web's uploadAvatar. */
export async function uploadAvatar(photo: { uri: string; mime: string }) {
  const body = await readLocalFile(photo.uri);
  let res: Response;
  try {
    res = await fetch(apiUrl("/me/avatar"), {
      method: "PUT",
      headers: { "Content-Type": photo.mime, "X-Agora-Locale": locale, ...authHeaders() },
      body,
    });
  } catch {
    throw new ApiError(0, messages.avatarUploadFailed);
  }
  if (!res.ok) throw new ApiError(res.status, ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? messages.avatarUploadFailed);
  return (await res.json()) as { image: string };
}

export const deleteAvatar = () => api("/me/avatar", { method: "DELETE" });

/** The session carries the profile; lists and conversations show the name and photo. */
export function refreshProfile(qc: QueryClient, userId: string) {
  qc.invalidateQueries({ queryKey: sessionQuery.queryKey });
  qc.invalidateQueries({ queryKey: ["users"] });
  qc.invalidateQueries({ queryKey: ["user", userId] });
  qc.invalidateQueries({ queryKey: ["conversations"] });
}
