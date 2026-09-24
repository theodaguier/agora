/* apps/web/src/lib/digest.ts, with the recap's types and query (apps/web/src/lib/api.ts, queries.ts). */
import { queryOptions } from "@tanstack/react-query";
import { api } from "./api";
import type { AgentAvatarSpec, AgentSummary } from "./types";

export type DigestStats = {
  tasks: { done: number; created: number; open: number; overdue: number };
  messages: number;
  conversations: number;
  agents: number;
  /** Null when usage is shown to admins only. */
  usage: {
    tokens: number;
    cost: number;
    byAgent: { id: string; name: string; avatar: AgentAvatarSpec; tokens: number; cost: number }[];
    byModel: { provider: string; model: string; tokens: number; cost: number }[];
  } | null;
  /** Local hours ("00"–"23") when the period is one day, days (YYYY-MM-DD) otherwise. */
  series: { t: string; messages: number; tokens: number; tasksDone: number }[];
  /** Most active members (team part). */
  people?: { id: string; name: string; image: string | null; tasksDone: number; messages: number }[];
};

/** Morning recap: the previous day, or the previous week on Mondays. Texts mention people as @handle and bots as @Name. */
export type Digest = {
  id: string;
  /** Day it was written (YYYY-MM-DD). */
  day: string;
  kind: "daily" | "weekly";
  /** Days covered, inclusive (YYYY-MM-DD). */
  periodStart: string;
  periodEnd: string;
  team: { headline: string; done: string[]; inProgress: string[]; next: string[] };
  /** Addressed to the signed-in account; null when they had nothing going on. */
  personal: { headline: string; done: string[]; next: string[]; attention: string[]; stats: DigestStats | null } | null;
  stats: DigestStats | null;
  /** Every bot, so their mentions show with their avatar. */
  agents: AgentSummary[];
  createdAt: string;
  seen: boolean;
};

export const digestQuery = queryOptions({
  queryKey: ["digest"],
  queryFn: () => api<Digest | null>("/digest"),
  staleTime: 10 * 60_000,
});

/** Remembered on the account, so the same recap isn't announced again on another device. */
export const markDigestSeen = (id: string) => api("/digest/seen", { method: "PUT", body: JSON.stringify({ id }) }).catch(() => {});
