import { RequiredMark } from "@/components/FormLabel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BookOpenIcon, PuzzleIcon } from "@/components/icons";
import { useState } from "react";
import { ErrorText, useRestartNeeded } from "@/components/admin/ui";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { adminAgentsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { useSkillOwners, type Item } from "./data";
import { defineMessages, tr, useT } from "@/i18n";
import { common, integrations } from "@agora/core/i18n";
import { guessIntegrationType, type IntegrationType } from "@agora/core";
import { AgentTargets } from "./AgentTargets";
import { IntegrationTile, IntegrationTypeSelect } from "./IntegrationType";

const messages = defineMessages({
  en: {
    hermesError: (error: string) => `Hermes: ${error}`,
    notConfirmed: "Hermes didn't confirm the installation.",
    tooLong: "The installation is taking too long.",
    enablingFor: (name?: string) => `Enabling for ${name}…`,
    installingConnector: "Installing the connector…",
    installingServer: "Installing the server…",
    installingFor: (name?: string) => `Installing for ${name}…`,
    enablingPlugin: "Enabling the plugin…",
    installingPlugin: "Installing the plugin…",
    mcpSubtitle: "MCP connector · installed for the whole instance",
    registrySubtitle: (remote: boolean) => `MCP registry · ${remote ? "remote server" : "runs on the Hermes machine"}`,
    skillSubtitle: (source: string) => `Skill · ${source}`,
    pluginSubtitle: "Hermes plugin · loaded by the whole instance",
    skillInstalled: "Skill installed.",
    added: "Added. Restart Hermes (banner above) so agents load it.",
    verdict: (verdict: string) =>
      `Hermes's security check rated this skill “${verdict}” (external install commands, for example). It was allowed under Hermes's policy for this source. Review it before leaving it active.`,
    authorizeBefore: "Then authorize it with",
    authorizeAfter: "on the Hermes server.",
    done: "Done",
    configuration: "Configuration",
    stdioBefore: "This server runs third-party code on the Hermes machine:",
    stdioAfter: ". Check its repository before adding it.",
    token: "Access token",
    tokenHelp: "Sent as an Authorization: Bearer header, stored in Hermes's .env.",
    oauth: "This server requires an OAuth sign-in",
    oauthBefore: "This connector is authorized through OAuth: after installing, run",
    oauthAfter: "on the Hermes server.",
    enableForAgents: "Enable for agents",
    installForAgents: "Install for agents",
    defaultProfile: "The default profile (Server admin) has access automatically.",
  },
  fr: {
    hermesError: (error: string) => `Hermes : ${error}`,
    notConfirmed: "Hermes n'a pas confirmé l'installation.",
    tooLong: "L'installation prend trop de temps.",
    enablingFor: (name?: string) => `Activation pour ${name}…`,
    installingConnector: "Installation du connecteur…",
    installingServer: "Installation du serveur…",
    installingFor: (name?: string) => `Installation pour ${name}…`,
    enablingPlugin: "Activation du plugin…",
    installingPlugin: "Installation du plugin…",
    mcpSubtitle: "Connecteur MCP · installé pour toute l'instance",
    registrySubtitle: (remote: boolean) => `Registre MCP · ${remote ? "serveur distant" : "exécuté sur la machine Hermes"}`,
    skillSubtitle: (source: string) => `Skill · ${source}`,
    pluginSubtitle: "Plugin Hermes · chargé par toute l'instance",
    skillInstalled: "Skill installé.",
    added: "Ajouté. Redémarre Hermes (bandeau ci-dessus) pour que les agents le chargent.",
    verdict: (verdict: string) =>
      `Le contrôle de sécurité de Hermes a classé ce skill « ${verdict} » (commandes d'installation externes, par exemple). Il a été autorisé selon la politique de Hermes pour cette source. Vérifie-le avant de le laisser actif.`,
    authorizeBefore: "Autorise-le ensuite avec",
    authorizeAfter: "sur le serveur Hermes.",
    done: "Terminé",
    configuration: "Configuration",
    stdioBefore: "Ce serveur exécute du code tiers sur la machine Hermes :",
    stdioAfter: ". Vérifie son dépôt avant de l'ajouter.",
    token: "Jeton d'accès",
    tokenHelp: "Envoyé en en-tête Authorization: Bearer, stocké dans le .env de Hermes.",
    oauth: "Ce serveur demande une connexion OAuth",
    oauthBefore: "Ce connecteur s'autorise par OAuth : après l'installation, lance",
    oauthAfter: "sur le serveur Hermes.",
    enableForAgents: "Activer pour les agents",
    installForAgents: "Installer pour les agents",
    defaultProfile: "Le profil par défaut (Admin Serveur) y a accès automatiquement.",
  },
});

const envName = (e: string | { name: string }) => (typeof e === "string" ? e : e.name);

/**
 * Waits for a Hermes dashboard background task to finish (skill install).
 * The exit code is 0 even on failure, so we read the log of the
 * last run to know whether the skill was actually installed.
 */
async function waitAction(name: string) {
  for (let i = 0; i < 120; i++) {
    const s = await api<{ running: boolean; exit_code: number | null; lines?: string[] }>(
      `/admin/hermes/actions/${encodeURIComponent(name)}`,
    );
    if (!s.running) {
      const lines = s.lines ?? [];
      const start = lines.map((l) => l.startsWith("===") && l.includes(" started ")).lastIndexOf(true);
      const run = lines.slice(start + 1).join("\n");
      const error = run.match(/Error:\s*([\s\S]*?)(?:\n\n|$)/);
      if (error) throw new Error(tr(messages).hermesError(error[1]!.replace(/\s+/g, " ").trim()));
      if (s.exit_code !== 0 || !/^Installed:/m.test(run)) throw new Error(tr(messages).notConfirmed);
      return run.match(/Verdict:\s*(\w+)/)?.[1] ?? null;
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(tr(messages).tooLong);
}

export function AddSheet({ item, onDone }: { item: Item; onDone: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const flagRestart = useRestartNeeded();
  const i = useT(integrations);
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const agentNames = new Map(agents.map((a) => [a.id, a.name]));
  const [targets, setTargets] = useState<string[]>([]);
  const { owners } = useSkillOwners();
  const [progress, setProgress] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const env = item.kind === "mcp" ? item.entry.required_env.map(envName) : [];
  const reg = item.kind === "registry" ? item.server : null;
  const [oauth, setOauth] = useState(false);
  const isMcp = item.kind === "mcp" || item.kind === "registry";
  const serverName = reg ? reg.hermesName : item.name;
  const perAgent = item.kind !== "plugin";
  const [type, setType] = useState<IntegrationType>(("type" in item && item.type) || guessIntegrationType(item.name, item.description));

  const enableFor = async (server: string) => {
    for (const id of targets) {
      setProgress(t.enablingFor(agentNames.get(id)));
      await api(`/admin/hermes/agents/${id}/mcp/${server}`, { method: "PUT", body: JSON.stringify({ enabled: true }) });
    }
    flagRestart();
  };

  const add = useMutation({
    mutationFn: async (values: Record<string, string>) => {
      if (item.kind === "mcp") {
        setProgress(t.installingConnector);
        await api("/admin/hermes/mcp/catalog/install", { method: "POST", body: JSON.stringify({ name: item.name, env: values, type }) });
        await enableFor(item.name);
      } else if (item.kind === "registry") {
        setProgress(t.installingServer);
        const { bearer_token, ...rest } = values;
        const env = Object.fromEntries(Object.entries(rest).filter(([, v]) => v));
        await api("/admin/hermes/mcp/registry/install", {
          method: "POST",
          body: JSON.stringify({ id: item.server.id, env, oauth, type, ...(bearer_token ? { bearer_token } : {}) }),
        });
        await enableFor(item.server.hermesName);
      } else if (item.kind === "skill") {
        for (const id of targets) {
          setProgress(t.installingFor(agentNames.get(id)));
          const r = await api<{ name?: string }>(`/admin/hermes/agents/${id}/skills-hub/install`, {
            method: "POST",
            body: JSON.stringify({ identifier: item.identifier }),
          });
          if (r?.name) {
            const v = await waitAction(r.name);
            if (v && v !== "SAFE") setVerdict(v);
          }
        }
      } else if (item.plugin) {
        setProgress(t.enablingPlugin);
        await api(`/admin/hermes/plugins/${encodeURIComponent(item.plugin.name)}/enable`, { method: "POST" });
        flagRestart();
      } else {
        setProgress(t.installingPlugin);
        await api("/admin/hermes/plugins/install", { method: "POST", body: JSON.stringify({ identifier: item.identifier }) });
        flagRestart();
      }
    },
    onSettled: () => {
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["hermes"] });
      // The "/" menu lists the bots' skills and connectors.
      qc.invalidateQueries({ queryKey: ["commands"] });
    },
  });

  const Icon = item.kind === "skill" ? BookOpenIcon : PuzzleIcon;
  const done = add.isSuccess;

  return (
    <div className="mx-auto max-w-xl">
      <div className="mb-6 flex items-center gap-4">
        {isMcp ? (
          <IntegrationTile type={type} server={item.name} className="size-14 rounded-2xl [&_svg]:size-6" />
        ) : (
          <span className="grid size-14 shrink-0 place-items-center rounded-2xl bg-accent">
            <Icon className="size-6 text-foreground/80" />
          </span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight">{item.name}</h1>
          <p className="text-sm text-muted-foreground">
            {item.kind === "mcp" && t.mcpSubtitle}
            {reg && t.registrySubtitle(reg.transport === "remote")}
            {item.kind === "skill" && t.skillSubtitle(item.source)}
            {item.kind === "plugin" && t.pluginSubtitle}
          </p>
        </div>
      </div>
      <p className="mb-6 text-[15px] leading-relaxed text-foreground/90">{item.description}</p>

      {done ? (
        <Card className="gap-4 bg-transparent py-5">
          <CardContent className="flex flex-col gap-2 px-5">
            <p className="text-[15px]">
              {item.kind === "skill" ? t.skillInstalled : t.added}
            </p>
            {verdict && (
              <p className="text-sm text-warning">
                {t.verdict(verdict)}
              </p>
            )}
            {(oauth || (item.kind === "mcp" && item.entry.auth_type === "oauth")) && (
              <p className="text-sm text-muted-foreground">
                {t.authorizeBefore} <code className="text-foreground">hermes mcp login {serverName}</code> {t.authorizeAfter}
              </p>
            )}
            {item.kind === "mcp" && item.entry.post_install && (
              <p className="whitespace-pre-line text-sm text-muted-foreground">{item.entry.post_install}</p>
            )}
          </CardContent>
          <CardFooter className="border-t-0 bg-transparent px-5 pt-0 pb-5">
            <Button onClick={onDone}>{t.done}</Button>
          </CardFooter>
        </Card>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const keys = reg ? [...reg.env.map((e) => e.name), ...(reg.bearer ? ["bearer_token"] : [])] : env;
            add.mutate(Object.fromEntries(keys.map((k) => [k, String(f.get(k) ?? "")])));
          }}
        >
          <FieldGroup>
            {env.length > 0 && (
              <FieldSet className="gap-2">
                <FieldLegend variant="label">{t.configuration}</FieldLegend>
                {env.map((k) => (
                  <Input key={k} name={k} required placeholder={k} aria-label={k} autoComplete="off" className="font-mono" />
                ))}
              </FieldSet>
            )}
            {reg?.transport === "stdio" && (
              <Alert className="rounded-xl border-0 bg-secondary px-3.5 py-2.5">
                <AlertDescription>
                  {t.stdioBefore}{" "}
                  <code className="break-all text-foreground">{reg.command}</code>
                  {t.stdioAfter}
                </AlertDescription>
              </Alert>
            )}
            {reg && reg.env.length > 0 && (
              <FieldSet className="gap-3">
                <FieldLegend variant="label">{t.configuration}</FieldLegend>
                {reg.env.map((e) => (
                  <Field key={e.name} className="gap-1.5">
                    <FieldLabel htmlFor={`env-${e.name}`} className="font-mono text-xs">
                      {e.name}
                      {e.required && <RequiredMark />}
                    </FieldLabel>
                    <Input
                      id={`env-${e.name}`}
                      name={e.name}
                      required={e.required}
                      type={e.secret ? "password" : "text"}
                      autoComplete="off"
                      className="font-mono"
                    />
                    {e.description && <FieldDescription className="text-xs">{e.description}</FieldDescription>}
                  </Field>
                ))}
              </FieldSet>
            )}
            {reg?.bearer && (
              <Field className="gap-1.5">
                <FieldLabel htmlFor="bearer_token">{t.token}</FieldLabel>
                <Input id="bearer_token" name="bearer_token" type="password" required autoComplete="off" className="font-mono" />
                <FieldDescription className="text-xs">{t.tokenHelp}</FieldDescription>
              </Field>
            )}
            {reg?.transport === "remote" && !reg.bearer && (
              <Field orientation="horizontal" className="gap-3">
                <Checkbox id="oauth" checked={oauth} onCheckedChange={(v) => setOauth(v === true)} />
                <FieldLabel htmlFor="oauth" className="cursor-pointer font-normal">
                  {t.oauth}
                </FieldLabel>
              </Field>
            )}
            {item.kind === "mcp" && item.entry.auth_type === "oauth" && (
              <Alert className="rounded-xl border-0 bg-secondary px-3.5 py-2.5">
                <AlertDescription>
                  {t.oauthBefore} <code className="text-foreground">hermes mcp login {item.name}</code> {t.oauthAfter}
                </AlertDescription>
              </Alert>
            )}

            {isMcp && (
              <Field className="gap-1.5">
                <FieldLabel htmlFor="integration-type">
                  {i.type}
                  <RequiredMark />
                </FieldLabel>
                <IntegrationTypeSelect id="integration-type" value={type} onValueChange={setType} />
              </Field>
            )}

            {perAgent && (
              <AgentTargets
                legend={isMcp ? t.enableForAgents : t.installForAgents}
                hint={isMcp ? t.defaultProfile : undefined}
                value={targets}
                onChange={setTargets}
                withoutDefault={isMcp}
                installed={item.kind === "skill" ? owners.get(item.name) : undefined}
              />
            )}

            <Field orientation="horizontal" className="gap-3">
              <Button type="submit" disabled={add.isPending || (item.kind === "skill" && targets.length === 0)}>
                {add.isPending ? progress ?? "…" : c.add}
              </Button>
              <ErrorText error={add.error} />
            </Field>
          </FieldGroup>
        </form>
      )}
    </div>
  );
}
