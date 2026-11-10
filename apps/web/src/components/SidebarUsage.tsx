import { CODE_ENGINE_NAMES, type CodeSession } from "@agora/core";
import { useQuery } from "@tanstack/react-query";
import { ModelLogo } from "@/components/ProviderLogo";
import { Progress } from "@/components/ui/progress";
import { defineMessages, useT } from "@/i18n";
import { api } from "@/lib/api";
import { allCodeSessionsQuery } from "@/lib/code-sessions";
import { providerName } from "@/lib/providers";
import { openSettings } from "@/lib/settings";
import { useFormat } from "@/lib/usage-format";

const messages = defineMessages({
  en: {
    title: "Provider usage",
    today: "Today",
    quotas: "Subscriptions",
    windows: { five_hour: "5 h", seven_day: "7 days", seven_day_opus: "7 days, Opus" } as Record<string, string>,
    open: "Open usage",
  },
  fr: {
    title: "Consommation des fournisseurs",
    today: "Aujourd’hui",
    quotas: "Abonnements",
    windows: { five_hour: "5 h", seven_day: "7 jours", seven_day_opus: "7 jours, Opus" } as Record<string, string>,
    open: "Ouvrir la consommation",
  },
});

type Report = { totals: { cost: number }; byModel: { provider: string; model: string; cost: number }[] };

/** Today's cost, per provider: the same report as Settings › Usage, over the last 24 hours. */
const todayUsageQuery = {
  queryKey: ["usage", "range=24h"],
  queryFn: () => api<Report>("/usage?range=24h"),
  staleTime: 60_000,
  refetchInterval: 60_000,
};

/** The latest subscription limit each engine reported, as a share used (only once one was reported). */
function engineLimits(sessions: CodeSession[]) {
  const latest = new Map<string, CodeSession>();
  for (const s of sessions) {
    if (s.limit?.utilization === undefined) continue;
    const seen = latest.get(s.engine);
    if (!seen || seen.updatedAt < s.updatedAt) latest.set(s.engine, s);
  }
  return [...latest.values()].map((s) => ({ engine: s.engine, window: s.limit!.window, used: s.limit!.utilization! }));
}

/**
 * Figma « Barre latérale sombre », its foot: what the bots cost today, provider by provider (a click
 * opens Settings › Usage), then the share of each code engine's subscription used, when one reported it.
 */
export function SidebarUsage() {
  const t = useT(messages);
  const f = useFormat();
  const { data } = useQuery(todayUsageQuery);
  const { data: limits = [] } = useQuery({ ...allCodeSessionsQuery, select: engineLimits });
  if (!data) return null;
  const providers = [...data.byModel.reduce((m, r) => m.set(r.provider, (m.get(r.provider) ?? 0) + r.cost), new Map<string, number>())].sort((a, b) => b[1] - a[1]).slice(0, 4);
  return (
    <div className="flex flex-col gap-2 border-t px-2 pt-3">
      <button type="button" onClick={() => openSettings("usage")} aria-label={t.open} className="flex flex-col gap-1 rounded-md px-1 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
        <span className="text-xs text-muted-foreground">{t.title}</span>
        <span className="flex items-baseline justify-between gap-2">
          <span className="text-xs text-muted-foreground">{t.today}</span>
          <span className="text-xl font-semibold tabular-nums">{f.cost(data.totals.cost)}</span>
        </span>
      </button>
      {providers.length > 0 && (
        <ul className="flex flex-col gap-1.5 px-1">
          {providers.map(([provider, cost]) => (
            <li key={provider} className="flex items-center gap-2 text-sm">
              <ModelLogo provider={provider} className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{providerName(provider)}</span>
              <span className="shrink-0 text-muted-foreground tabular-nums">{f.cost(cost)}</span>
            </li>
          ))}
        </ul>
      )}
      {limits.length > 0 && (
        <div className="flex flex-col gap-2 px-1 pt-1">
          <span className="text-xs text-muted-foreground">{t.quotas}</span>
          {limits.map((l) => (
            <div key={l.engine} className="flex flex-col gap-1">
              <span className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate">
                  {CODE_ENGINE_NAMES[l.engine]}, {t.windows[l.window] ?? l.window}
                </span>
                <span className="shrink-0 tabular-nums">{f.percent(l.used)}</span>
              </span>
              <Progress value={Math.round(l.used * 100)} aria-label={CODE_ENGINE_NAMES[l.engine]} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
