import { isLocale, type Locale } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAdminToast } from "@/components/admin/ui";
import { useMeProfile } from "@/components/profile/me";
import { api } from "@/lib/api";
import { sessionQuery } from "@/lib/queries";

/** apps/web/src/lib/languages.ts: language names only, in their own language (a flag stands for a country). */
export const LANGUAGES: Record<Locale, string> = { fr: "Français", en: "English" };

const orgQuery = { queryKey: ["org"], queryFn: () => api<{ name: string; locale: Locale; image: string | null }>("/org"), staleTime: 5 * 60_000 };

/**
 * The language agents reply in (PUT /me/locale): yours, or the organization's (`org`). Shared by the
 * Appearance screen and the simple interface's settings.
 */
export function useLanguageChoice(orgLabel: (language: string | null) => string) {
  const me = useMeProfile();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const org = useQuery(orgQuery);
  const save = useMutation({
    mutationFn: (locale: Locale | null) => api("/me/locale", { method: "PUT", body: JSON.stringify({ locale }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: sessionQuery.queryKey }),
    onError: (e) => toast.failed(e),
  });
  const current: Locale | "org" = save.isPending ? (save.variables ?? "org") : isLocale(me.locale) ? me.locale : "org";
  const languages: { value: Locale | "org"; label: string }[] = [
    { value: "org", label: orgLabel(org.data ? LANGUAGES[org.data.locale] : null) },
    ...(Object.keys(LANGUAGES) as Locale[]).map((l) => ({ value: l, label: LANGUAGES[l] })),
  ];
  const choose = (value: Locale | "org") => !save.isPending && save.mutate(isLocale(value) ? value : null);
  return { current, languages, choose, label: languages.find((l) => l.value === current)?.label ?? "" };
}
