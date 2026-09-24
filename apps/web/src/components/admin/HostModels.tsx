import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { confirmAction } from "@/lib/confirm";
import { ModelLogo } from "@/components/ProviderLogo";
import { providerName } from "@/lib/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FieldDescription, FieldLegend, FieldSet } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { defineMessages, intlLocale, useLocale, useT } from "@/i18n";
import { numberFormat } from "@/lib/intl";
import { common } from "@agora/core/i18n";
import { api } from "@/lib/api";
import { ErrorText, Loading } from "./ui";

type LocalModel = { id: string; parameters?: string; quantization?: string; family?: string; size?: number; loaded: boolean };
type LocalRuntime = { id: "ollama" | "lmstudio"; url: string; running: boolean; models: LocalModel[] };
type Job = { startedAt: string; endedAt?: string; ok?: boolean; output?: string };
type HostCli = {
  id: string;
  name: string;
  installed: boolean;
  path: string | null;
  version: string | null;
  latest: string | null;
  outdated: boolean;
  update: "self" | "managed" | "manual";
  job: Job | null;
};

const messages = defineMessages({
  en: {
    localTitle: "Local models",
    localText: "Models installed on the machine that hosts Agora.",
    notDetected: (url: string) => `Not detected on ${url}`,
    noModels: "Running, no model installed",
    count: (n: number) => (n === 1 ? "Running · 1 model" : `Running · ${n} models`),
    loaded: "Loaded",
    clisTitle: "CLIs",
    clisText: "Agent command-line tools installed on the host machine.",
    checkNow: "Check for updates",
    notInstalled: "Not installed",
    upToDate: "Up to date",
    available: (v: string) => `${v} available`,
    unknownLatest: "Latest version unknown",
    managed: "Updated by the update service",
    manual: "Update it on the machine",
    updating: "Updating…",
    update: "Update",
    failed: "Update failed",
    confirm: (name: string, v: string) => `Update ${name} to ${v}?`,
  },
  fr: {
    localTitle: "Modèles locaux",
    localText: "Modèles installés sur la machine qui héberge Agora.",
    notDetected: (url: string) => `Non détecté sur ${url}`,
    noModels: "Actif, aucun modèle installé",
    count: (n: number) => `Actif · ${n} modèle${n > 1 ? "s" : ""}`,
    loaded: "Chargé",
    clisTitle: "CLI",
    clisText: "Outils en ligne de commande des agents, installés sur la machine hôte.",
    checkNow: "Vérifier les mises à jour",
    notInstalled: "Non installée",
    upToDate: "À jour",
    available: (v: string) => `${v} disponible`,
    unknownLatest: "Dernière version inconnue",
    managed: "Mise à jour par le service de mise à jour",
    manual: "À mettre à jour sur la machine",
    updating: "Mise à jour…",
    update: "Mettre à jour",
    failed: "Échec de la mise à jour",
    confirm: (name: string, v: string) => `Mettre à jour ${name} vers ${v} ?`,
  },
});

const modelsKey = ["admin", "host", "models"];
const clisKey = ["admin", "host", "clis"];

export function LocalModels() {
  const t = useT(messages);
  const locale = useLocale();
  const { data, isPending, error } = useQuery({
    queryKey: modelsKey,
    queryFn: () => api<{ runtimes: LocalRuntime[] }>("/admin/host/models"),
    refetchInterval: 30_000,
  });
  const bytes = numberFormat({ style: "unit", unit: "gigabyte", maximumFractionDigits: 1 }, intlLocale(locale));

  return (
    <FieldSet>
      <FieldLegend>{t.localTitle}</FieldLegend>
      <FieldDescription>{t.localText}</FieldDescription>
      {isPending ? (
        <Loading />
      ) : !data ? (
        <ErrorText error={error} />
      ) : (
        <ItemGroup className="gap-2">
          {data.runtimes.map((r) => (
            <div key={r.id} className="flex flex-col gap-2">
              <Item variant="outline">
                <ItemMedia>
                  <ModelLogo provider={r.id} className="size-5" />
                </ItemMedia>
                <ItemContent className="min-w-0">
                  <ItemTitle>{providerName(r.id)}</ItemTitle>
                  <ItemDescription className="truncate">
                    {!r.running ? t.notDetected(r.url) : r.models.length ? t.count(r.models.length) : t.noModels}
                  </ItemDescription>
                </ItemContent>
              </Item>
              {r.models.map((m) => (
                <Item key={m.id} variant="muted" size="xs" className="ml-6 w-auto">
                  <ItemMedia>
                    <ModelLogo model={m.family ? `${m.family} ${m.id}` : m.id} provider={r.id} />
                  </ItemMedia>
                  <ItemContent className="min-w-0">
                    <ItemTitle className="w-full truncate">{m.id}</ItemTitle>
                    <ItemDescription className="truncate">
                      {[m.parameters, m.quantization, m.size ? bytes.format(m.size / 1e9) : undefined].filter(Boolean).join(" · ")}
                    </ItemDescription>
                  </ItemContent>
                  {m.loaded && (
                    <ItemActions>
                      <Badge variant="secondary">{t.loaded}</Badge>
                    </ItemActions>
                  )}
                </Item>
              ))}
            </div>
          ))}
        </ItemGroup>
      )}
    </FieldSet>
  );
}

export function HostClis() {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: clisKey,
    queryFn: () => api<{ clis: HostCli[] }>("/admin/host/clis"),
    // Follows an update in progress.
    refetchInterval: (q) => (q.state.data?.clis.some((cli) => cli.job && !cli.job.endedAt) ? 2000 : false),
  });
  const check = useMutation({
    mutationFn: () => api<{ clis: HostCli[] }>("/admin/host/clis/check", { method: "POST" }),
    onSuccess: (d) => qc.setQueryData(clisKey, d),
  });
  const update = useMutation({
    mutationFn: (id: string) => api(`/admin/host/clis/${id}/update`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: clisKey }),
  });

  return (
    <FieldSet>
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5">
          <FieldLegend>{t.clisTitle}</FieldLegend>
          <FieldDescription>{t.clisText}</FieldDescription>
        </div>
        <Button variant="outline" size="sm" disabled={check.isPending} onClick={() => check.mutate()}>
          {check.isPending ? c.inProgress : t.checkNow}
        </Button>
      </div>
      {isPending ? (
        <Loading />
      ) : !data ? (
        <ErrorText error={error} />
      ) : (
        <>
          <ItemGroup className="gap-2">
            {data.clis.map((cli) => (
              <CliRow
                key={cli.id}
                cli={cli}
                onUpdate={async () =>
                  (await confirmAction({ title: t.confirm(cli.name, cli.latest!), action: t.update, destructive: false })) && update.mutate(cli.id)
                }
              />
            ))}
          </ItemGroup>
          <ErrorText error={update.error ?? check.error} />
        </>
      )}
    </FieldSet>
  );
}

function CliRow({ cli, onUpdate }: { cli: HostCli; onUpdate: () => void }) {
  const t = useT(messages);
  const running = !!cli.job && !cli.job.endedAt;
  const failed = cli.job?.endedAt && !cli.job.ok;
  const status = !cli.installed
    ? t.notInstalled
    : running
      ? t.updating
      : failed
        ? t.failed
        : !cli.latest
          ? t.unknownLatest
          : cli.outdated
            ? [t.available(cli.latest), cli.update === "managed" ? t.managed : cli.update === "manual" ? t.manual : null].filter(Boolean).join(" · ")
            : t.upToDate;

  return (
    <Item variant="outline">
      <ItemMedia>
        {/* "ollama" would match the Llama (Meta) vendor. */}
        <ModelLogo model={cli.id === "ollama" ? undefined : cli.id} provider={cli.id} className="size-5" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>
          {cli.name}
          {cli.version && <span className="font-normal text-muted-foreground">{cli.version}</span>}
        </ItemTitle>
        <ItemDescription className={failed ? "truncate text-destructive" : "truncate"} title={failed ? cli.job?.output : (cli.path ?? undefined)}>
          {status}
        </ItemDescription>
      </ItemContent>
      {cli.installed && cli.outdated && cli.update === "self" && (
        <ItemActions>
          <Button size="sm" disabled={running} onClick={onUpdate}>
            {running ? t.updating : t.update}
          </Button>
        </ItemActions>
      )}
    </Item>
  );
}
