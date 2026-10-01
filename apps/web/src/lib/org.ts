import { queryOptions, useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api";
import { useTabPlace } from "./workspace";
import { hasStoredLocale, isLocale, setLocale } from "@/i18n";

export type SetupStatus = { needed: boolean; completed: boolean; org: { name: string; locale: "fr" | "en"; timezone: string } };

export const setupQuery = queryOptions({
  queryKey: ["setup"],
  queryFn: () => api<SetupStatus>("/setup"),
  staleTime: 30_000,
});

export const orgQuery = queryOptions({
  queryKey: ["org"],
  queryFn: () => api<{ name: string; locale: "fr" | "en"; image: string | null; requireTwoFactor?: boolean }>("/org"),
  staleTime: 5 * 60_000,
});

/** Organization name, without touching the browser tab. */
export function useOrgName() {
  const { data } = useQuery(orgQuery);
  return data?.name ?? "Agora";
}

/** Browser tab: the page's name then the organization's ("Design · Acme"), or the organization alone. */
/** With several tabs mounted, only the one the URL shows names the window. */
export function useOrgTitle(page?: string) {
  const org = useOrgName();
  const { current } = useTabPlace();
  useEffect(() => {
    if (current) document.title = page ? `${page} · ${org}` : org;
  }, [page, org, current]);
  return org;
}

/** First visit in this browser: start in the organization's language. */
export function useOrgLocale() {
  const { data } = useQuery(orgQuery);
  useEffect(() => {
    if (data && !hasStoredLocale()) setLocale(data.locale);
  }, [data]);
}

/** Signed in: the account's language, otherwise the organization's. */
export function useAccountLocale(userLocale: string | null | undefined) {
  const { data } = useQuery(orgQuery);
  const locale = isLocale(userLocale) ? userLocale : data?.locale;
  useEffect(() => {
    if (locale) setLocale(locale);
  }, [locale]);
}
