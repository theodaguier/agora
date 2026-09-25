import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useEffect, useRef, useState } from "react";
import { confirmAction } from "@/lib/confirm";
import { FormLabel } from "@/components/FormLabel";
import { ModelLogo } from "@/components/ProviderLogo";
import { providerName } from "@/lib/providers";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { defineMessages, intlLocale, useLocale, useT } from "@/i18n";
import { dateFormat, numberFormat } from "@/lib/intl";
import { adminModelsQuery } from "@/lib/queries";
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
/** Subscriptions of a CLI engine (Claude Code, Codex); `active` null: the machine's own login. */
type SubscriptionAccounts = {
  machine: { loggedIn: boolean; email: string | null; plan: string | null };
  active: string | null;
  /** `loggedIn` false: its login expired or was revoked. */
  accounts: { id: string; email: string; plan: string | null; addedAt: string; loggedIn: boolean }[];
};

/** The CLIs whose subscription accounts are managed under their row (host CLI id = API path). */
const ENGINES = {
  claude: { name: "Claude Code", account: "Claude" },
  codex: { name: "Codex", account: "ChatGPT" },
} as const;
type EngineId = keyof typeof ENGINES;
const isEngine = (id: string): id is EngineId => id in ENGINES;

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
    checking: "Checking versions…",
    checked: "Versions checked.",
    updateStarted: (name: string) => `Updating ${name}…`,
    confirm: (name: string, v: string) => `Update ${name} to ${v}?`,
    machine: "This machine's login",
    signedIn: "Signed in",
    notSignedIn: "Not signed in",
    added: (date: string) => `Added on ${date}`,
    inUse: "In use",
    use: "Use",
    remove: "Remove",
    removeTitle: (name: string) => `Remove the ${name} account?`,
    signedOut: "Signed out: remove it and add it again",
    removeText: "Agora signs it out. The subscription itself isn't affected.",
    removeActiveText: (engine: string) => `Agora signs it out and ${engine} goes back to this machine's login.`,
    addAccount: (account: string) => `Add a ${account} account`,
    claudeAddText: "Sign in with the account to add on Claude's page, then paste the code it shows.",
    codexAddText: "Open the sign-in page, enter this code there, then sign in with the ChatGPT account to add. This window follows by itself.",
    oneTimeCode: "One-time code, valid 15 minutes",
    waiting: "Waiting for the sign-in…",
    retry: "Start again",
    preparing: "Preparing the sign-in…",
    openPage: "Open the sign-in page",
    code: "Code",
    connecting: "Signing in…",
    connect: "Sign in",
    nowUsing: (engine: string, name: string) => `${engine} now uses ${name}.`,
    nowUsingMachine: (engine: string) => `${engine} is back on this machine's login.`,
    accountRemoved: "Account removed.",
    accountAdded: (email: string) => `${email} added.`,
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
    checking: "Vérification des versions…",
    checked: "Versions vérifiées.",
    updateStarted: (name: string) => `Mise à jour de ${name}…`,
    confirm: (name: string, v: string) => `Mettre à jour ${name} vers ${v} ?`,
    machine: "Connexion de cette machine",
    signedIn: "Connectée",
    notSignedIn: "Non connectée",
    added: (date: string) => `Ajouté le ${date}`,
    inUse: "Utilisé",
    use: "Utiliser",
    remove: "Retirer",
    removeTitle: (name: string) => `Retirer le compte ${name} ?`,
    signedOut: "Déconnecté : retire-le puis ajoute-le de nouveau",
    removeText: "Agora le déconnecte. L'abonnement lui-même n'est pas touché.",
    removeActiveText: (engine: string) => `Agora le déconnecte et ${engine} repasse sur la connexion de cette machine.`,
    addAccount: (account: string) => `Ajouter un compte ${account}`,
    claudeAddText: "Connecte-toi avec le compte à ajouter sur la page de Claude, puis colle le code affiché.",
    codexAddText: "Ouvre la page de connexion, saisis-y ce code, puis connecte-toi avec le compte ChatGPT à ajouter. Cette fenêtre suit toute seule.",
    oneTimeCode: "Code à usage unique, valable 15 minutes",
    waiting: "En attente de la connexion…",
    retry: "Recommencer",
    preparing: "Préparation de la connexion…",
    openPage: "Ouvrir la page de connexion",
    code: "Code",
    connecting: "Connexion…",
    connect: "Se connecter",
    nowUsing: (engine: string, name: string) => `${engine} utilise maintenant ${name}.`,
    nowUsingMachine: (engine: string) => `${engine} repasse sur la connexion de cette machine.`,
    accountRemoved: "Compte retiré.",
    accountAdded: (email: string) => `${email} ajouté.`,
  },
});

const modelsKey = ["admin", "host", "models"];
const clisKey = ["admin", "host", "clis"];
const accountsKey = (engine: EngineId) => ["admin", "host", engine];

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
    meta: { loading: t.checking, success: t.checked },
  });
  const update = useMutation({
    mutationFn: (id: string) => api(`/admin/host/clis/${id}/update`, { method: "POST" }),
    onSettled: () => qc.invalidateQueries({ queryKey: clisKey }),
    meta: { success: (_: unknown, id: string) => t.updateStarted(data?.clis.find((cli) => cli.id === id)?.name ?? id) },
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
              <div key={cli.id} className="flex flex-col gap-2">
                <CliRow
                  cli={cli}
                  onUpdate={async () =>
                    (await confirmAction({ title: t.confirm(cli.name, cli.latest!), action: t.update, destructive: false })) && update.mutate(cli.id)
                  }
                />
                {isEngine(cli.id) && cli.installed && <SubscriptionAccountRows engine={cli.id} />}
              </div>
            ))}
          </ItemGroup>
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

/** The subscriptions a CLI engine can run on, under its row. Only its owner gets them (403 otherwise). */
function SubscriptionAccountRows({ engine }: { engine: EngineId }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const { name, account } = ENGINES[engine];
  const { data } = useQuery({ queryKey: accountsKey(engine), queryFn: () => api<SubscriptionAccounts>(`/admin/host/${engine}/accounts`), retry: false });
  const saved = (d: SubscriptionAccounts) => {
    qc.setQueryData(accountsKey(engine), d);
    // The account's plan decides the models: the pickers and the status follow.
    void Promise.all([
      qc.invalidateQueries({ queryKey: adminModelsQuery.queryKey }),
      qc.invalidateQueries({ queryKey: ["models"] }),
      qc.invalidateQueries({ queryKey: ["admin", "status"] }),
    ]);
  };
  const activate = useMutation({
    mutationFn: (id: string | null) => api<SubscriptionAccounts>(`/admin/host/${engine}/active`, { method: "PUT", body: JSON.stringify({ id }) }),
    onSuccess: saved,
    meta: { success: (d: SubscriptionAccounts, id: string | null) => (id ? t.nowUsing(name, d.accounts.find((a) => a.id === id)?.email ?? "") : t.nowUsingMachine(name)) },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api<SubscriptionAccounts>(`/admin/host/${engine}/accounts/${encodeURIComponent(id)}`, { method: "DELETE" }),
    onSuccess: saved,
    meta: { success: t.accountRemoved },
  });
  if (!data) return null;

  const day = dateFormat({ dateStyle: "medium" });
  const { machine } = data;
  const rows = [
    {
      id: null,
      title: t.machine,
      description: machine.loggedIn ? [machine.email, machine.plan && capitalize(machine.plan)].filter(Boolean).join(" · ") || t.signedIn : t.notSignedIn,
    },
    ...data.accounts.map((a) => ({
      id: a.id,
      title: a.email,
      description: a.loggedIn ? [a.plan && capitalize(a.plan), t.added(day.format(new Date(a.addedAt)))].filter(Boolean).join(" · ") : t.signedOut,
    })),
  ];

  return (
    <>
      {rows.map((r) => (
        <Item key={r.id ?? "machine"} variant="muted" size="xs" className="ml-6 w-auto">
          <ItemContent className="min-w-0">
            <ItemTitle className="w-full truncate">{r.title}</ItemTitle>
            <ItemDescription className="truncate">{r.description}</ItemDescription>
          </ItemContent>
          <ItemActions>
            {data.active === r.id ? (
              <Badge variant="secondary">{t.inUse}</Badge>
            ) : (
              <Button variant="outline" size="sm" disabled={activate.isPending} onClick={() => activate.mutate(r.id)}>
                {t.use}
              </Button>
            )}
            {r.id && (
              <Button
                variant="ghost"
                size="sm"
                disabled={remove.isPending}
                onClick={async () =>
                  (await confirmAction({ title: t.removeTitle(r.title), description: data.active === r.id ? t.removeActiveText(name) : t.removeText, action: t.remove })) &&
                  remove.mutate(r.id!)
                }
              >
                {t.remove}
              </Button>
            )}
          </ItemActions>
        </Item>
      ))}
      <div className="ml-6">
        <Button variant="outline" size="sm" onClick={() => setAdding(true)}>
          {t.addAccount(account)}
        </Button>
      </div>
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding &&
          (engine === "codex" ? (
            <AddCodexAccount onSaved={(d) => (saved(d), setAdding(false))} />
          ) : (
            <AddClaudeAccount onSaved={(d) => (saved(d), setAdding(false))} />
          ))}
      </Dialog>
    </>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** `claude auth login` run by the API: the owner signs in on Claude's page, then pastes the code it shows. */
function AddClaudeAccount({ onSaved }: { onSaved: (d: SubscriptionAccounts) => void }) {
  const t = useT(messages);
  const c = useT(common);
  const [code, setCode] = useState("");
  const start = useQuery({
    queryKey: ["admin", "host", "claude", "login"],
    queryFn: () => api<{ loginId: string; url: string }>("/admin/host/claude/logins", { method: "POST" }),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  const loginId = start.data?.loginId;
  const finish = useMutation({
    mutationFn: () => api<SubscriptionAccounts>(`/admin/host/claude/logins/${loginId}`, { method: "POST", body: JSON.stringify({ code: code.trim() }) }),
    onSuccess: onSaved,
    // That sign-in is over on the API: a new one, whose page gives a new code.
    onError: () => {
      setCode("");
      void start.refetch();
    },
    meta: { success: (d: SubscriptionAccounts) => t.accountAdded(d.accounts.at(-1)?.email ?? ""), error: false },
  });
  // Closed before the end: the waiting `claude auth login` is stopped (a no-op once the account is added).
  useEffect(
    () => () => {
      if (loginId) void api(`/admin/host/claude/logins/${loginId}`, { method: "DELETE" }).catch(() => {});
    },
    [loginId],
  );
  const ready = !!loginId && !!code.trim();

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t.addAccount(ENGINES.claude.account)}</DialogTitle>
        <DialogDescription>{t.claudeAddText}</DialogDescription>
      </DialogHeader>
      {start.isPending ? (
        <Loading label={t.preparing} />
      ) : start.isError ? (
        <ErrorText error={start.error} />
      ) : (
        <form
          id="claude-account"
          onSubmit={(e) => {
            e.preventDefault();
            if (ready) finish.mutate();
          }}
        >
          <FieldGroup className="gap-5">
            <Button variant="outline" className="self-start" nativeButton={false} render={<a href={start.data.url} target="_blank" rel="noreferrer" />}>
              {t.openPage}
            </Button>
            <Field>
              <FormLabel htmlFor="claude-account-code" required>
                {t.code}
              </FormLabel>
              <Input id="claude-account-code" className="font-mono" autoComplete="off" spellCheck={false} value={code} onChange={(e) => setCode(e.target.value)} />
            </Field>
            <ErrorText error={finish.error} />
          </FieldGroup>
        </form>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form="claude-account" disabled={!ready || finish.isPending}>
          {finish.isPending ? t.connecting : t.connect}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/**
 * `codex login --device-auth` run by the API: the owner enters the one-time code on OpenAI's page and
 * signs in there; the sign-in ends by itself, this dialog follows it.
 */
function AddCodexAccount({ onSaved }: { onSaved: (d: SubscriptionAccounts) => void }) {
  const t = useT(messages);
  const c = useT(common);
  const start = useQuery({
    queryKey: ["admin", "host", "codex", "login"],
    queryFn: () => api<{ loginId: string; url: string; code: string }>("/admin/host/codex/logins", { method: "POST" }),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  const loginId = start.data?.loginId;
  const state = useQuery({
    queryKey: ["admin", "host", "codex", "login", loginId],
    queryFn: () => api<{ state: "pending" | "done" | "failed"; error?: string; accounts?: SubscriptionAccounts }>(`/admin/host/codex/logins/${loginId}`),
    enabled: !!loginId,
    gcTime: 0,
    refetchInterval: (q) => (q.state.data && q.state.data.state !== "pending" ? false : 2000),
  });
  const result = state.data;
  // Once per sign-in, whatever re-renders the dialog before it closes.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (result?.state !== "done" || !result.accounts || handled.current === loginId) return;
    handled.current = loginId ?? null;
    toast.success(t.accountAdded(result.accounts.accounts.at(-1)?.email ?? ""));
    onSaved(result.accounts);
  }, [result, loginId, onSaved, t]);
  // Closed before the end: the waiting `codex login` is stopped (a no-op once it ended).
  useEffect(
    () => () => {
      if (loginId) void api(`/admin/host/codex/logins/${loginId}`, { method: "DELETE" }).catch(() => {});
    },
    [loginId],
  );

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t.addAccount(ENGINES.codex.account)}</DialogTitle>
        <DialogDescription>{t.codexAddText}</DialogDescription>
      </DialogHeader>
      {start.isPending ? (
        <Loading label={t.preparing} />
      ) : start.isError ? (
        <ErrorText error={start.error} />
      ) : result?.state === "failed" ? (
        <ErrorText error={new Error(result.error)} />
      ) : (
        <FieldGroup className="gap-5">
          <Field>
            <FieldLegend variant="label">{t.oneTimeCode}</FieldLegend>
            <p className="font-mono text-2xl font-semibold tracking-widest select-all">{start.data.code}</p>
          </Field>
          <Button variant="outline" className="self-start" nativeButton={false} render={<a href={start.data.url} target="_blank" rel="noreferrer" />}>
            {t.openPage}
          </Button>
          <Loading label={t.waiting} />
        </FieldGroup>
      )}
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        {(start.isError || result?.state === "failed") && <Button onClick={() => void start.refetch()}>{t.retry}</Button>}
      </DialogFooter>
    </DialogContent>
  );
}
