import { confirmAction } from "@/lib/confirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WarningIcon, CheckCircleIcon, ChevronDownIcon, LoaderIcon, UndoIcon, CloseCircleIcon } from "@/components/icons";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { OptionSelect } from "@/components/Pickers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { intlLocale, useLocale, useT } from "@/i18n";
import { dateFormat } from "@/lib/intl";
import { common } from "@agora/core/i18n";
import { api } from "@/lib/api";
import { cn, contentKeys } from "@/lib/utils";
import { messages, type ErrorParams, type StepParams } from "./Updates.messages";
import { ErrorText, Loading, SectionHeader } from "./ui";

/** Error surfaced by the update service (see apps/updater/src/coded.ts). */
type ErrorInfo = { message: string; code?: string; params?: Record<string, unknown> };
/** `code` + `params` are translated; `message` (French) is the fallback for runs stored before codes existed. */
type Step = { at: string; message: string; ok?: boolean; code?: string; params?: Record<string, unknown> & { error?: ErrorInfo } };
type Run = {
  id: string;
  target: "hermes" | "app";
  from: string;
  to: string;
  trigger: "auto" | "manual";
  startedAt: string;
  endedAt?: string;
  status: "running" | "succeeded" | "rolled_back" | "failed";
  steps: Step[];
  backup?: string;
  contract?: { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] };
};
type Status = {
  /** Version of the responding API. */
  server: { app: string; hermes: string; commit: string | null; builtAt: string | null };
  running?: { target: string; to: string } | null;
  unavailable?: string;
  current?: { app: string; hermes: string };
  available?: { app: string[]; hermes: string[] };
  rejected?: { app: string[]; hermes: string[] };
  settings?: { autoApp: boolean; autoHermes: boolean; windowStart: number; windowEnd: number };
  lastCheck?: string | null;
  inWindow?: boolean;
  history?: Run[];
  backups?: string[];
  registry?: string;
};

const key = ["admin", "updates"];
const isMajor = (from: string, to: string) => from.split(".")[0] !== to.split(".")[0];

type T = (typeof messages)["en"];

const useDateTime = () => dateFormat({ dateStyle: "short", timeStyle: "short" }, intlLocale(useLocale()));

function errorText(t: T, e: ErrorInfo) {
  const format = e.code ? t.errors[e.code as keyof T["errors"]] : undefined;
  return format ? format(e.params as ErrorParams) : e.message;
}

function stepText(t: T, s: Step) {
  const format = s.code ? t.steps[s.code as keyof T["steps"]] : undefined;
  if (!format) return s.message;
  const { error, ...rest } = s.params ?? {};
  return format({ ...rest, error: error ? errorText(t, error) : "" } as StepParams);
}

export function Updates() {
  const t = useT(messages);
  const c = useT(common);
  const time = useDateTime();
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: key,
    queryFn: () => api<Status>("/admin/updates"),
    // Refreshes during an update.
    refetchInterval: (q) => ((q.state.data?.history?.[0] as Run | undefined)?.status === "running" ? 2000 : 30_000),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const check = useMutation({ mutationFn: () => api("/admin/updates/check", { method: "POST" }), onSettled: refresh });
  const apply = useMutation({
    mutationFn: (b: { target: "hermes" | "app"; version: string }) => api("/admin/updates/apply", { method: "POST", body: JSON.stringify(b) }),
    onSettled: refresh,
  });
  const settings = useMutation({
    mutationFn: (b: Partial<NonNullable<Status["settings"]>>) => api("/admin/updates/settings", { method: "PUT", body: JSON.stringify(b) }),
    onSettled: refresh,
  });
  const unreject = useMutation({
    mutationFn: (b: { target: string; version: string }) => api(`/admin/updates/rejected/${b.target}/${b.version}`, { method: "DELETE" }),
    onSettled: refresh,
  });

  if (isPending) return <Loading />;
  if (!data) return <ErrorText error={error} />;
  const busy = !!data.running || data.history?.[0]?.status === "running";

  return (
    <>
      <SectionHeader title={t.title} text={t.intro} />

      <FieldGroup>
        <FieldSet>
          <FieldLegend>{t.versions}</FieldLegend>
          <ItemGroup className="gap-2">
            <VersionCard
              title="Agora"
              current={data.server.app}
              detail={data.server.commit ? t.commit(data.server.commit) : undefined}
              available={data.available?.app ?? []}
              rejected={data.rejected?.app ?? []}
              disabled={busy || !!data.unavailable}
              onApply={async (v) =>
                (await confirmAction({ title: t.confirmApp(v), action: t.updateAction, destructive: false })) && apply.mutate({ target: "app", version: v })
              }
              onRetry={(v) => unreject.mutate({ target: "app", version: v })}
              note={(v) => (isMajor(data.server.app, v) ? t.majorNote : undefined)}
            />
            <VersionCard
              title={t.hermesCore}
              current={data.current?.hermes ?? data.server.hermes}
              available={data.available?.hermes ?? []}
              rejected={data.rejected?.hermes ?? []}
              disabled={busy || !!data.unavailable}
              onApply={async (v) =>
                (await confirmAction({ title: t.confirmHermes(v), action: t.updateAction, destructive: false })) &&
                apply.mutate({ target: "hermes", version: v })
              }
              onRetry={(v) => unreject.mutate({ target: "hermes", version: v })}
            />
          </ItemGroup>
          {data.unavailable && <FieldDescription>{data.unavailable}</FieldDescription>}
        </FieldSet>

        {!data.unavailable && (
          <>
            <FieldSeparator />
            <FieldSet>
              <FieldLegend>{t.autoUpdates}</FieldLegend>
              <FieldDescription>
                {t.parisTime}
                {data.lastCheck && t.lastCheck(time.format(new Date(data.lastCheck)))}
              </FieldDescription>
              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="auto-hermes">{t.autoHermes}</FieldLabel>
                  <Switch id="auto-hermes" checked={!!data.settings?.autoHermes} onCheckedChange={(autoHermes) => settings.mutate({ autoHermes })} />
                </Field>
                <Field orientation="horizontal">
                  <FieldLabel htmlFor="auto-app">{t.autoApp}</FieldLabel>
                  <Switch id="auto-app" checked={!!data.settings?.autoApp} onCheckedChange={(autoApp) => settings.mutate({ autoApp })} />
                </Field>
                <Field orientation="responsive">
                  <FieldContent>
                    <FieldLabel>{t.window}</FieldLabel>
                  </FieldContent>
                  <div className="flex items-center gap-2">
                    <HourSelect label={t.windowStart} value={data.settings?.windowStart ?? 3} onChange={(h) => settings.mutate({ windowStart: h })} />
                    <span className="text-muted-foreground">–</span>
                    <HourSelect label={t.windowEnd} value={data.settings?.windowEnd ?? 5} onChange={(h) => settings.mutate({ windowEnd: h })} />
                  </div>
                </Field>
                <Field orientation="horizontal">
                  <Button variant="outline" disabled={check.isPending || busy} onClick={() => check.mutate()}>
                    {check.isPending ? c.inProgress : t.checkNow}
                  </Button>
                  <ErrorText error={apply.error ?? settings.error ?? check.error} />
                </Field>
              </FieldGroup>
            </FieldSet>

            <FieldSeparator />
            <FieldSet>
              <FieldLegend>{t.history}</FieldLegend>
              {data.history?.length ? (
                <div className="flex flex-col gap-2">
                  {data.history.map((run) => (
                    <RunRow key={run.id} run={run} />
                  ))}
                </div>
              ) : (
                <FieldDescription>{t.noHistory}</FieldDescription>
              )}
            </FieldSet>
          </>
        )}
      </FieldGroup>
    </>
  );
}

function VersionCard(props: {
  title: string;
  current: string;
  detail?: string;
  available: string[];
  rejected: string[];
  disabled: boolean;
  onApply: (v: string) => void;
  onRetry: (v: string) => void;
  note?: (v: string) => string | undefined;
}) {
  const t = useT(messages);
  const latest = props.available.at(-1);
  const rejected = !!latest && props.rejected.includes(latest);
  return (
    <Item variant="outline">
      <ItemContent>
        <ItemTitle>
          {props.title} {props.current}
        </ItemTitle>
        <ItemDescription>
          {latest ? (
            <>
              {t.available}
              {latest}
              {props.available.length > 1 && t.others(props.available.length - 1)}
              {props.note?.(latest) && ` · ${props.note(latest)}`}
              {rejected && ` · ${t.rejected}`}
            </>
          ) : (
            t.upToDate
          )}
          {props.detail && ` · ${props.detail}`}
        </ItemDescription>
      </ItemContent>
      {latest && (
        <ItemActions>
          {rejected ? (
            <Button variant="outline" size="sm" onClick={() => props.onRetry(latest)}>
              {t.allowRetry}
            </Button>
          ) : (
            <Button size="sm" disabled={props.disabled} onClick={() => props.onApply(latest)}>
              {t.update}
            </Button>
          )}
        </ItemActions>
      )}
    </Item>
  );
}

function HourSelect({ label, value, onChange }: { label: string; value: number; onChange: (h: number) => void }) {
  const t = useT(messages);
  const hours = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: t.hour(h) }));
  return (
    <OptionSelect aria-label={label} options={hours} value={String(value)} onValueChange={(h) => onChange(Number(h))} className="w-24" />
  );
}

const statusMeta = {
  running: { icon: LoaderIcon, cls: "text-brand animate-spin" },
  succeeded: { icon: CheckCircleIcon, cls: "text-success" },
  rolled_back: { icon: UndoIcon, cls: "text-warning" },
  failed: { icon: CloseCircleIcon, cls: "text-destructive" },
};

function RunRow({ run }: { run: Run }) {
  const t = useT(messages);
  const locale = intlLocale(useLocale());
  const time = useDateTime();
  const [open, setOpen] = useState(run.status === "running");
  const M = statusMeta[run.status];
  const failed = run.contract?.checks.filter((c) => !c.ok) ?? [];
  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border">
      <CollapsibleTrigger className="group/run flex w-full items-center gap-3 px-4 py-3 text-left">
        <M.icon className={cn("size-4 shrink-0", M.cls)} />
        <span className="min-w-0 flex-1 text-sm">
          {run.target === "hermes" ? "Hermes" : "Agora"} {run.from} → {run.to}
          <span className="text-muted-foreground"> · {t.status[run.status]} · {t.trigger[run.trigger]} · {time.format(new Date(run.startedAt))}</span>
        </span>
        <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-panel-open/run:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <Separator />
        <div className="px-4 py-3">
          <ol className="flex flex-col gap-1 text-[13px]">
            {contentKeys(run.steps, (s) => `${s.at}:${stepText(t, s)}`).map(([key, s]) => (
              <li key={key} className="flex gap-2">
                <span className="shrink-0 font-mono text-subtle">{new Date(s.at).toLocaleTimeString(locale)}</span>
                <span className={cn(s.ok === false && "text-destructive", s.ok === true && "text-foreground")}>{stepText(t, s)}</span>
              </li>
            ))}
          </ol>
          {failed.length > 0 && (
            <Alert className="mt-3">
              <WarningIcon />
              <AlertTitle>{t.failedChecks}</AlertTitle>
              <AlertDescription>
                {failed.map((c) => (
                  <div key={c.name}>{t.checkLine(c.name, c.detail ?? t.checkFailed)}</div>
                ))}
              </AlertDescription>
            </Alert>
          )}
          {run.backup && <p className="mt-2 text-xs text-subtle">{t.backup(run.backup)}</p>}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
