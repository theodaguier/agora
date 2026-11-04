import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { MoreIcon, RefreshIcon } from "@/components/icons";
import { confirmAction } from "@/lib/confirm";
import { LoadError, LoadFailed, Loading, SectionHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { Card, CardAction, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { defineMessages, intlLocale, useLocale, useT } from "@/i18n";
import { dateFormat } from "@/lib/intl";
import { api } from "@/lib/api";

type CheckState = "ok" | "warn" | "down" | "off";
type Restart = "process" | "container" | "curator";
type Check = { id: string; state: CheckState; detail?: string; latencyMs?: number; restart?: Restart };
type Report = { checkedAt: string; checks: Check[] };

/** Time to wait before checking again; a local process is already back when the request returns. */
const settleMs: Record<Restart, number> = { process: 0, container: 45_000, curator: 1_000 };

const messages = defineMessages({
  en: {
    title: "Status",
    components: "Components",
    intro: "Checks every component of the instance. Refreshed every 30 seconds.",
    refresh: "Check now",
    checking: "Checking…",
    checkedAt: (time: string) => `Checked at ${time}`,
    restart: "Restart",
    actions: "Actions",
    restarting: "Restarting…",
    restartingName: (name: string) => `Restarting ${name}…`,
    restarted: (name: string) => `${name} restarted.`,
    confirm: {
      process: {
        title: (name: string) => `Restart ${name}?`,
        description: "It is stopped then started again, which takes a few seconds. Replies in progress finish first.",
      },
      container: {
        title: (_: string) => "Restart Hermes?",
        description: "The Hermes container and the app server restart: replies in progress are cut off and the app is unavailable for about a minute.",
      },
    },
    summary: { ok: "Everything is running.", warn: "Running, with warnings.", down: "Something is down." } as Record<Exclude<CheckState, "off">, string>,
    states: { ok: "Running", warn: "Degraded", down: "Down", off: "Off" } as Record<CheckState, string>,
    names: {
      database: "Database",
      gateway: "Hermes gateway",
      bots: "Bots",
      dashboard: "Hermes dashboard",
      memory: "Company memory",
      updater: "Update service",
      mail: "Email",
      claudeCode: "Claude Code",
      codex: "Codex",
    } as Record<string, string>,
  },
  fr: {
    title: "Statut",
    components: "Composants",
    intro: "Vérifie chaque composant de l'instance. Actualisé toutes les 30 secondes.",
    refresh: "Vérifier",
    checking: "Vérification…",
    checkedAt: (time: string) => `Vérifié à ${time}`,
    restart: "Relancer",
    actions: "Actions",
    restarting: "Relance…",
    restartingName: (name: string) => `Relance de ${name}…`,
    restarted: (name: string) => `${name} relancé.`,
    confirm: {
      process: {
        title: (name: string) => `Relancer ${name} ?`,
        description: "Il est arrêté puis redémarré, ce qui prend quelques secondes. Les réponses en cours se terminent d'abord.",
      },
      container: {
        title: (_: string) => "Relancer Hermes ?",
        description: "Le conteneur Hermes et le serveur de l'app redémarrent : les réponses en cours sont coupées et l'app est indisponible environ une minute.",
      },
    },
    summary: { ok: "Tout tourne.", warn: "Ça tourne, avec des alertes.", down: "Quelque chose est en panne." },
    states: { ok: "Opérationnel", warn: "Dégradé", down: "En panne", off: "Inactif" },
    names: {
      database: "Base de données",
      gateway: "Gateway Hermes",
      bots: "Bots",
      dashboard: "Dashboard Hermes",
      memory: "Mémoire de l'organisation",
      updater: "Service de mise à jour",
      mail: "Email",
      claudeCode: "Claude Code",
      codex: "Codex",
    },
  },
});

/** Status badge: colour only where it means something (red = down, orange = degraded), neutral otherwise. */
function StateBadge({ state, children }: { state: CheckState; children: React.ReactNode }) {
  const variant = ({ down: "destructive", warn: "outline", off: "ghost", ok: "secondary" } as const)[state];
  return <Badge variant={variant}>{children}</Badge>;
}

export function Status() {
  const t = useT(messages);
  const time = dateFormat({ timeStyle: "medium" }, intlLocale(useLocale()));
  const qc = useQueryClient();
  const { data, isPending, isFetching, error, refetch } = useQuery({
    queryKey: ["admin", "status"],
    queryFn: () => api<Report>("/admin/status"),
    refetchInterval: 30_000,
  });
  const [restarting, setRestarting] = useState<string | null>(null);
  const restart = useMutation({
    mutationFn: (check: Check) => api(`/admin/status/${check.id}/restart`, { method: "POST" }),
    onMutate: (check) => setRestarting(check.id),
    onSuccess: async (_, check) => {
      await new Promise((r) => setTimeout(r, settleMs[check.restart!]));
      await qc.invalidateQueries({ queryKey: ["admin", "status"] });
    },
    onSettled: () => setRestarting(null),
    meta: { loading: (check: Check) => t.restartingName(t.names[check.id] ?? check.id), success: (_: unknown, check: Check) => t.restarted(t.names[check.id] ?? check.id) },
  });

  const onRestart = async (check: Check) => {
    if (check.restart !== "curator") {
      const copy = t.confirm[check.restart!];
      const name = t.names[check.id === "bots" ? "gateway" : check.id];
      if (!(await confirmAction({ title: copy.title(name), description: copy.description, action: t.restart }))) return;
    }
    restart.mutate(check);
  };

  if (!data)
    return (
      <>
        <SectionHeader title={t.title} text={t.intro} />
        {isPending ? <Loading /> : <LoadFailed error={error} onRetry={() => void refetch()} />}
      </>
    );

  const overall: Exclude<CheckState, "off"> = data.checks.some((c) => c.state === "down")
    ? "down"
    : data.checks.some((c) => c.state === "warn")
      ? "warn"
      : "ok";

  return (
    <>
      <SectionHeader title={t.title} text={t.intro} />

      <Card>
        <CardHeader>
          <CardTitle>{t.summary[overall]}</CardTitle>
          <CardDescription>{t.checkedAt(time.format(new Date(data.checkedAt)))}</CardDescription>
          <CardAction>
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
              {isFetching ? t.checking : t.refresh}
            </Button>
          </CardAction>
        </CardHeader>
      </Card>

      <ListCard>
        <ListCardHeader>
          <CardTitle>{t.components}</CardTitle>
        </ListCardHeader>
        <ListCardRows>
          {data.checks.map((check) => (
            <Item size="xs" key={check.id} role="listitem">
              <ItemContent>
                <ItemTitle>{t.names[check.id] ?? check.id}</ItemTitle>
                {/* Server-written: an error message can be long or technical, the whole of it stays in the tooltip. */}
                {check.detail && <ItemDescription title={check.detail}>{check.detail}</ItemDescription>}
              </ItemContent>
              <ItemActions>
                {check.state !== "off" && check.latencyMs !== undefined && (
                  <span className="text-sm text-muted-foreground tabular-nums">{check.latencyMs} ms</span>
                )}
                <StateBadge state={check.state}>{restarting === check.id ? t.restarting : t.states[check.state]}</StateBadge>
                {check.restart ? (
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} disabled={restarting !== null} />}
                    >
                      <MoreIcon />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onRestart(check)}>
                        <RefreshIcon />
                        {t.restart}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                ) : (
                  // Keeps the badges of every row lined up.
                  <span aria-hidden className="size-7 shrink-0" />
                )}
              </ItemActions>
            </Item>
          ))}
        </ListCardRows>
      </ListCard>
      {error && <LoadError error={error} />}
    </>
  );
}
