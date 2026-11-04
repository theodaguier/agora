import { confirmAction } from "@/lib/confirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WarningIcon, CheckCircleIcon, ChevronDownIcon, ClockIcon, LoaderIcon, UndoIcon, CloseCircleIcon } from "@/components/icons";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { OptionSelect } from "@/components/Pickers";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Switch } from "@/components/ui/switch";
import { intlLocale, useLocale, useT } from "@/i18n";
import { dateFormat } from "@/lib/intl";
import { common } from "@agora/core/i18n";
import { api } from "@/lib/api";
import { cn, contentKeys } from "@/lib/utils";
import { messages, type ErrorParams, type StepParams } from "./Updates.messages";
import { LoadFailed, Loading, SectionHeader } from "./ui";

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
  const { data, isPending, error, refetch } = useQuery({
    queryKey: key,
    queryFn: () => api<Status>("/admin/updates"),
    // Refreshes during an update.
    refetchInterval: (q) => ((q.state.data?.history?.[0] as Run | undefined)?.status === "running" ? 2000 : 30_000),
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const check = useMutation({ mutationFn: () => api("/admin/updates/check", { method: "POST" }), onSettled: refresh, meta: { loading: t.checking, success: t.checked } });
  const apply = useMutation({
    mutationFn: (b: { target: "hermes" | "app"; version: string }) => api("/admin/updates/apply", { method: "POST", body: JSON.stringify(b) }),
    onSettled: refresh,
    meta: { success: t.started },
  });
  const settings = useMutation({
    mutationFn: (b: Partial<NonNullable<Status["settings"]>>) => api("/admin/updates/settings", { method: "PUT", body: JSON.stringify(b) }),
    onSettled: refresh,
    meta: { success: c.saved },
  });
  const unreject = useMutation({
    mutationFn: (b: { target: string; version: string }) => api(`/admin/updates/rejected/${b.target}/${b.version}`, { method: "DELETE" }),
    onSettled: refresh,
    meta: { success: t.retryAllowed },
  });

  if (!data)
    return (
      <>
        <SectionHeader title={t.title} text={t.intro} />
        {isPending ? <Loading /> : <LoadFailed error={error} onRetry={() => void refetch()} />}
      </>
    );
  const busy = !!data.running || data.history?.[0]?.status === "running";

  return (
    <>
      <SectionHeader title={t.title} text={t.intro} />

      <ListCard>
        <ListCardHeader>
          <CardTitle>{t.versions}</CardTitle>
          {/* Written by the update service: the full text stays in the tooltip. */}
          {data.unavailable && <CardDescription title={data.unavailable}>{data.unavailable}</CardDescription>}
        </ListCardHeader>
        <ListCardRows>
          <VersionCard
            title="Agora"
            current={data.server.app}
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
        </ListCardRows>
      </ListCard>

      {!data.unavailable && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t.autoUpdates}</CardTitle>
            </CardHeader>
            <CardContent>
              <FieldGroup>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="auto-hermes">{t.autoHermes}</FieldLabel>
                    <FieldDescription>{t.autoHermesHelp}</FieldDescription>
                  </FieldContent>
                  <Switch id="auto-hermes" checked={!!data.settings?.autoHermes} onCheckedChange={(autoHermes) => settings.mutate({ autoHermes })} />
                </Field>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel htmlFor="auto-app">{t.autoApp}</FieldLabel>
                    <FieldDescription>{t.autoAppHelp}</FieldDescription>
                  </FieldContent>
                  <Switch id="auto-app" checked={!!data.settings?.autoApp} onCheckedChange={(autoApp) => settings.mutate({ autoApp })} />
                </Field>
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel>{t.window}</FieldLabel>
                    <FieldDescription>{t.parisTime}</FieldDescription>
                  </FieldContent>
                  <div className="flex items-center gap-2">
                    <HourSelect label={t.windowStart} value={data.settings?.windowStart ?? 3} onChange={(h) => settings.mutate({ windowStart: h })} />
                    <span className="text-muted-foreground">–</span>
                    <HourSelect label={t.windowEnd} value={data.settings?.windowEnd ?? 5} onChange={(h) => settings.mutate({ windowEnd: h })} />
                  </div>
                </Field>
                {/* When it last looked, and looking again: one row, the button on the right. */}
                <Field orientation="horizontal">
                  <FieldContent>
                    <FieldLabel>{t.lastCheck}</FieldLabel>
                    <FieldDescription>{data.lastCheck ? time.format(new Date(data.lastCheck)) : t.never}</FieldDescription>
                  </FieldContent>
                  <Button variant="outline" size="sm" disabled={check.isPending || busy} onClick={() => check.mutate()}>
                    {check.isPending ? c.inProgress : t.checkNow}
                  </Button>
                </Field>
              </FieldGroup>
            </CardContent>
          </Card>

          <ListCard>
            <ListCardHeader>
              <CardTitle>{t.history}</CardTitle>
            </ListCardHeader>
            {data.history?.length ? (
              <ListCardRows>
                {data.history.map((run) => (
                  <RunRow key={run.id} run={run} />
                ))}
              </ListCardRows>
            ) : (
              <CardContent className="py-(--card-spacing)">
                <p className="text-sm text-muted-foreground">{t.noHistory}</p>
              </CardContent>
            )}
          </ListCard>
        </>
      )}
    </>
  );
}

function VersionCard(props: {
  title: string;
  current: string;
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
    <Item size="xs" role="listitem">
      <ItemContent>
        <ItemTitle>
          {props.title} {props.current}
        </ItemTitle>
        <ItemDescription>
          {latest ? (
            <>
              {t.available(latest)}
              {props.note?.(latest) && `, ${props.note(latest)}`}
              {rejected && `, ${t.rejected}`}
            </>
          ) : (
            t.upToDate
          )}
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
  const hours = Array.from({ length: 24 }, (_, h) => ({ value: String(h), label: t.hour(h), icon: <ClockIcon /> }));
  return (
    <OptionSelect aria-label={label} options={hours} value={String(value)} onValueChange={(h) => onChange(Number(h))} className="w-24" />
  );
}

/** Colour only where it means something: a rollback is orange, a failure red. */
const statusMeta = {
  running: { icon: LoaderIcon, cls: "text-muted-foreground animate-spin" },
  succeeded: { icon: CheckCircleIcon, cls: "text-muted-foreground" },
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
    <Collapsible open={open} onOpenChange={setOpen} role="listitem">
      <Item size="xs" render={<CollapsibleTrigger />} className="group/run rounded-none px-(--card-spacing) hover:bg-muted/50">
        <ItemMedia variant="icon">
          <M.icon className={M.cls} />
        </ItemMedia>
        <ItemContent>
          <ItemTitle>
            {run.target === "hermes" ? "Hermes" : "Agora"} {run.from} → {run.to}
          </ItemTitle>
          <ItemDescription>
            {t.status[run.status]}, {t.trigger[run.trigger]}, {time.format(new Date(run.startedAt))}
          </ItemDescription>
        </ItemContent>
        <ItemActions>
          <ChevronDownIcon className="size-4 text-muted-foreground transition-transform group-data-panel-open/run:rotate-180" />
        </ItemActions>
      </Item>
      {/* The steps sit under the row's title, past its icon. */}
      <CollapsibleContent>
        <div className="flex flex-col gap-3 pr-3 pb-3 pl-12">
        <ol className="flex flex-col gap-1 text-sm">
          {contentKeys(run.steps, (s) => `${s.at}:${stepText(t, s)}`).map(([key, s]) => (
            <li key={key} className="flex gap-2">
              <span className="shrink-0 tabular-nums text-muted-foreground">{new Date(s.at).toLocaleTimeString(locale)}</span>
              <span className={cn(s.ok === false && "text-destructive")}>{stepText(t, s)}</span>
            </li>
          ))}
        </ol>
        {failed.length > 0 && (
          <Alert>
            <WarningIcon />
            <AlertTitle>{t.failedChecks}</AlertTitle>
            <AlertDescription>
              {failed.map((c) => (
                <div key={c.name}>{t.checkLine(c.name, c.detail ?? t.checkFailed)}</div>
              ))}
            </AlertDescription>
          </Alert>
        )}
        {run.backup && (
          <p className="text-sm text-muted-foreground" title={run.backup}>
            {t.backup(run.backup)}
          </p>
        )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
