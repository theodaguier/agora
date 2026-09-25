import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useState } from "react";
import { MoreIcon } from "@/components/icons";
import { confirmAction } from "@/lib/confirm";
import { ErrorText, Loading, SectionHeader } from "@/components/admin/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemSeparator, ItemTitle } from "@/components/ui/item";
import { cn } from "@/lib/utils";
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

/** Status dot: the only color on the page, and it carries meaning. */
const dot: Record<CheckState, string> = {
  ok: "bg-success",
  warn: "bg-warning",
  down: "bg-destructive",
  off: "bg-muted-foreground/40",
};

function Dot({ state, className }: { state: CheckState; className?: string }) {
  return <span aria-hidden className={cn("size-2 shrink-0 rounded-full", dot[state], className)} />;
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

  if (isPending) return <Loading />;
  if (!data) return <ErrorText error={error} />;

  const overall: Exclude<CheckState, "off"> = data.checks.some((c) => c.state === "down")
    ? "down"
    : data.checks.some((c) => c.state === "warn")
      ? "warn"
      : "ok";

  return (
    <>
      <SectionHeader title={t.title} text={t.intro} />

      <FieldGroup>
        <Item variant="outline">
          <ItemMedia>
            <Dot state={overall} className="size-2.5" />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{t.summary[overall]}</ItemTitle>
            <ItemDescription>{t.checkedAt(time.format(new Date(data.checkedAt)))}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Button variant="outline" size="sm" disabled={isFetching} onClick={() => refetch()}>
              {isFetching ? t.checking : t.refresh}
            </Button>
          </ItemActions>
        </Item>

        <FieldSet>
          <FieldLegend>{t.components}</FieldLegend>
          <ItemGroup className="gap-0 rounded-lg border">
            {data.checks.map((check, i) => (
              <Fragment key={check.id}>
                {i > 0 && <ItemSeparator className="my-0" />}
                <Item role="listitem">
                  <ItemContent>
                    <ItemTitle>{t.names[check.id] ?? check.id}</ItemTitle>
                    {check.detail && <ItemDescription>{check.detail}</ItemDescription>}
                  </ItemContent>
                  <ItemActions>
                    {check.state !== "off" && check.latencyMs !== undefined && (
                      <span className="text-sm tabular-nums text-muted-foreground">{check.latencyMs} ms</span>
                    )}
                    <Badge variant="outline">
                      <Dot state={check.state} />
                      {restarting === check.id ? t.restarting : t.states[check.state]}
                    </Badge>
                    {check.restart ? (
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={<Button variant="ghost" size="icon-sm" aria-label={t.actions} className="text-muted-foreground" disabled={restarting !== null} />}
                        >
                          <MoreIcon />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => onRestart(check)}>{t.restart}</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    ) : (
                      <span aria-hidden className="size-7 shrink-0" />
                    )}
                  </ItemActions>
                </Item>
              </Fragment>
            ))}
          </ItemGroup>
        </FieldSet>
      </FieldGroup>
      <ErrorText error={error} />
    </>
  );
}
