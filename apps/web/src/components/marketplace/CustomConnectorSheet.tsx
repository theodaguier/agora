import { guessIntegrationType, type IntegrationType } from "@agora/core";
import { common, integrations } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ErrorText, useRestartNeeded } from "@/components/admin/ui";
import { FormLabel } from "@/components/FormLabel";
import { CloseIcon } from "@/components/icons";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { defineMessages, useT } from "@/i18n";
import { api, type McpRequest } from "@/lib/api";
import { adminAgentsQuery } from "@/lib/queries";
import { AgentTargets } from "./AgentTargets";
import { IntegrationTile, IntegrationTypeSelect } from "./IntegrationType";
import { useMcpOAuth } from "./use-mcp-oauth";
import { OAuthClientFields } from "./OAuthClientFields";
import { needsOwnClient, oauthClientOf } from "../../lib/oauth-client";

type Transport = "remote" | "stdio";
type Auth = "none" | "header" | "oauth";
type EnvRow = { key: string; name: string; value: string; secret: boolean };

const messages = defineMessages({
  en: {
    title: "Custom connector",
    subtitle: "MCP server that isn't in the catalogs",
    intro: "Declare any MCP server by its URL or its command. Its type sets its icon and how bots show its data in conversations.",
    displayName: "Name",
    serverName: "Identifier",
    serverNameHelp: (name: string) => `Lowercase, digits and dashes. Bots see its tools as mcp__${name || "name"}__*.`,
    description: "Description",
    transport: "Transport",
    remote: "Remote (URL)",
    stdio: "Local (command)",
    url: "Server URL",
    auth: "Authentication",
    auths: { none: "None", header: "Access token", oauth: "OAuth" } as Record<Auth, string>,
    token: "Access token",
    tokenHelp: "Sent as an Authorization: Bearer header, stored in Hermes's .env only.",
    oauthHelp: "After adding, a tab opens for you to sign in to the service.",
    command: "Command",
    args: "Arguments",
    argsHelp: "One per line.",
    stdioWarning: "This command runs third-party code on the Hermes machine. Check where it comes from before adding it.",
    env: "Environment variables",
    envName: "Variable",
    envValue: "Value",
    secret: "Secret",
    addVariable: "Add a variable",
    removeVariable: (name: string) => `Remove ${name || "the variable"}`,
    secretsNote: "Values go straight to Hermes's .env: the app's database never keeps them.",
    docs: "Documentation",
    enableForAgents: "Enable for agents",
    defaultProfile: "The default profile (Server admin) has access automatically.",
    creating: "Declaring…",
    installing: "Installing…",
    authorizing: "Waiting for the authorization…",
    enabling: (name?: string) => `Enabling for ${name}…`,
    add: "Add the connector",
    done: "Done",
    installed: (n: number) => `Connector added, ${n} tool${n > 1 ? "s" : ""} available. Restart Hermes (banner above) so agents load it.`,
  },
  fr: {
    title: "Connecteur personnalisé",
    subtitle: "Serveur MCP absent des catalogues",
    intro: "Déclare n'importe quel serveur MCP par son URL ou sa commande. Son type fixe son icône et la façon dont les bots affichent ses données dans les conversations.",
    displayName: "Nom",
    serverName: "Identifiant",
    serverNameHelp: (name: string) => `Minuscules, chiffres et tirets. Les bots voient ses outils sous mcp__${name || "nom"}__*.`,
    description: "Description",
    transport: "Transport",
    remote: "Distant (URL)",
    stdio: "Local (commande)",
    url: "URL du serveur",
    auth: "Authentification",
    auths: { none: "Aucune", header: "Jeton d'accès", oauth: "OAuth" },
    token: "Jeton d'accès",
    tokenHelp: "Envoyé en en-tête Authorization: Bearer, stocké uniquement dans le .env de Hermes.",
    oauthHelp: "Après l'ajout, un onglet s'ouvre pour te connecter au service.",
    command: "Commande",
    args: "Arguments",
    argsHelp: "Un par ligne.",
    stdioWarning: "Cette commande exécute du code tiers sur la machine Hermes. Vérifie sa provenance avant de l'ajouter.",
    env: "Variables d'environnement",
    envName: "Variable",
    envValue: "Valeur",
    secret: "Secret",
    addVariable: "Ajouter une variable",
    removeVariable: (name: string) => `Retirer ${name || "la variable"}`,
    secretsNote: "Les valeurs vont directement dans le .env de Hermes : la base de l'app ne les conserve jamais.",
    docs: "Documentation",
    enableForAgents: "Activer pour les agents",
    defaultProfile: "Le profil par défaut (Admin Serveur) y a accès automatiquement.",
    creating: "Déclaration…",
    installing: "Installation…",
    authorizing: "En attente de l'autorisation…",
    enabling: (name?: string) => `Activation pour ${name}…`,
    add: "Ajouter le connecteur",
    done: "Terminé",
    installed: (n: number) => `Connecteur ajouté, ${n} outil${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}. Redémarre Hermes (bandeau ci-dessus) pour que les agents le chargent.`,
  },
});

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** Custom MCP connector, declared by an admin with its integration type. */
/** Tile, name and kind of the connector being declared. */
function SheetHeader({ type, title }: { type: IntegrationType; title: string }) {
  const t = useT(messages);
  const i = useT(integrations);
  return (
    <div className="mb-6 flex items-center gap-4">
      <IntegrationTile type={type} className="size-14 rounded-2xl [&_svg]:size-6" />
      <div className="min-w-0">
        <h1 className="truncate text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted-foreground">
          {i.types[type]} · {t.subtitle}
        </p>
      </div>
    </div>
  );
}

/** Shown once the connector is installed. */
function InstalledCard({ tools, onDone }: { tools: number; onDone: () => void }) {
  const t = useT(messages);
  return (
    <Card className="gap-4 bg-transparent py-5">
      <CardContent className="px-5">
        <p className="text-[15px]">{t.installed(tools)}</p>
      </CardContent>
      <CardFooter className="border-t-0 bg-transparent px-5 pt-0 pb-5">
        <Button onClick={onDone}>{t.done}</Button>
      </CardFooter>
    </Card>
  );
}

export function CustomConnectorSheet({ onDone }: { onDone: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const i = useT(integrations);
  const qc = useQueryClient();
  const flagRestart = useRestartNeeded();
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const agentNames = new Map(agents.map((a) => [a.id, a.name]));
  const oauth = useMcpOAuth();

  const [title, setTitle] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [type, setType] = useState<IntegrationType | null>(null);
  const [transport, setTransport] = useState<Transport>("remote");
  const [auth, setAuth] = useState<Auth>("none");
  const [env, setEnv] = useState<EnvRow[]>([]);
  const [targets, setTargets] = useState<string[]>([]);
  const [client, setClient] = useState({ client_id: "", client_secret: "", scope: "" });
  const [progress, setProgress] = useState<string | null>(null);
  // Declared but not installed yet (the connection failed): a new attempt reuses it.
  const [created, setCreated] = useState<McpRequest | null>(null);

  const serverName = name ?? slug(title);
  const [url, setUrl] = useState("");
  const [command, setCommand] = useState("");
  const shownType = type ?? guessIntegrationType(title, serverName, url, command);

  const add = useMutation({
    mutationFn: async (form: FormData) => {
      const str = (k: string) => String(form.get(k) ?? "").trim();
      let req = created;
      if (!req || req.name !== serverName) {
        setProgress(t.creating);
        const block =
          transport === "remote"
            ? { url, auth }
            : {
                command,
                args: str("args").split("\n").map((a) => a.trim()).filter(Boolean),
                env: env.filter((e) => e.name).map((e) => ({ name: e.name, required: true, secret: e.secret })),
              };
        req = await api<McpRequest>("/mcp-requests/custom", {
          method: "POST",
          body: JSON.stringify({
            name: serverName,
            title: title.trim() || serverName,
            description: str("description"),
            type: shownType,
            ...(str("docs") && { docs: str("docs") }),
            ...block,
          }),
        });
        setCreated(req);
      }
      const install = (body: object) => api<McpRequest>(`/mcp-requests/${req!.id}/install`, { method: "POST", body: JSON.stringify(body) });
      if (req.auth === "oauth") {
        setProgress(t.authorizing);
        const oauth_client = oauthClientOf(client);
        await oauth.authorize(req.id, req.status === "approved" || oauth_client ? () => install(oauth_client ? { oauth_client } : {}) : undefined);
      } else {
        setProgress(t.installing);
        await install({
          env: Object.fromEntries(env.filter((e) => e.name && e.value).map((e) => [e.name, e.value])),
          ...(req.auth === "header" && { bearer_token: str("bearer_token") }),
        });
      }
      for (const id of targets) {
        setProgress(t.enabling(agentNames.get(id)));
        await api(`/admin/hermes/agents/${id}/mcp/${req.name}`, { method: "PUT", body: JSON.stringify({ enabled: true }) });
      }
      flagRestart();
      return api<McpRequest>(`/mcp-requests/${req.id}`);
    },
    onSettled: () => {
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["hermes"] });
      qc.invalidateQueries({ queryKey: ["mcp-requests"] });
    },
    // The sheet tells what's next once added, and what failed next to its button.
    meta: { success: c.added, error: false },
  });

  return (
    <div className="mx-auto max-w-xl">
      <SheetHeader type={shownType} title={title.trim() || t.title} />

      {add.isSuccess ? (
        <InstalledCard tools={add.data.tools?.length ?? 0} onDone={onDone} />
      ) : (
        <>
          <p className="mb-6 text-[15px] leading-relaxed text-foreground/90">{t.intro}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              add.mutate(new FormData(e.currentTarget));
            }}
          >
            <FieldGroup>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field className="gap-1.5">
                  <FormLabel htmlFor="cc-title" required>
                    {t.displayName}
                  </FormLabel>
                  <Input id="cc-title" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" />
                </Field>
                <Field className="gap-1.5">
                  <FormLabel htmlFor="cc-type" required>
                    {i.type}
                  </FormLabel>
                  <IntegrationTypeSelect id="cc-type" value={shownType} onValueChange={setType} />
                </Field>
              </div>
              <Field className="gap-1.5">
                <FormLabel htmlFor="cc-name" required>
                  {t.serverName}
                </FormLabel>
                <Input
                  id="cc-name"
                  required
                  pattern="[a-z0-9][a-z0-9_\-]{0,59}"
                  value={serverName}
                  onChange={(e) => setName(e.target.value.toLowerCase())}
                  autoComplete="off"
                  className="font-mono"
                />
                <FieldDescription className="text-xs">{t.serverNameHelp(serverName)}</FieldDescription>
              </Field>
              <Field className="gap-1.5">
                <FormLabel htmlFor="cc-description">{t.description}</FormLabel>
                <Textarea id="cc-description" name="description" maxLength={500} rows={2} />
              </Field>

              <Field className="gap-1.5">
                <FormLabel required>{t.transport}</FormLabel>
                <ToggleGroup variant="outline" spacing={1} value={[transport]} onValueChange={(v) => v[0] && setTransport(v[0] as Transport)}>
                  <ToggleGroupItem value="remote">{t.remote}</ToggleGroupItem>
                  <ToggleGroupItem value="stdio">{t.stdio}</ToggleGroupItem>
                </ToggleGroup>
              </Field>

              {transport === "remote" ? (
                <>
                  <Field className="gap-1.5">
                    <FormLabel htmlFor="cc-url" required>
                      {t.url}
                    </FormLabel>
                    <Input
                      id="cc-url"
                      type="url"
                      required
                      pattern="https://.+"
                      placeholder="https://"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      autoComplete="off"
                      className="font-mono"
                    />
                  </Field>
                  <Field className="gap-1.5">
                    <FormLabel required>{t.auth}</FormLabel>
                    <ToggleGroup variant="outline" spacing={1} value={[auth]} onValueChange={(v) => v[0] && setAuth(v[0] as Auth)}>
                      {(["none", "header", "oauth"] as const).map((a) => (
                        <ToggleGroupItem key={a} value={a}>
                          {t.auths[a]}
                        </ToggleGroupItem>
                      ))}
                    </ToggleGroup>
                    {auth === "oauth" && <FieldDescription className="text-xs">{t.oauthHelp}</FieldDescription>}
                  </Field>
                  {auth === "oauth" && (
                    <OAuthClientFields
                      redirectUri={`${window.location.origin}/api/mcp-oauth/callback/${encodeURIComponent(serverName || "…")}`}
                      value={client}
                      onChange={setClient}
                      required={needsOwnClient(add.error)}
                      disabled={add.isPending}
                    />
                  )}
                  {auth === "header" && (
                    <Field className="gap-1.5">
                      <FormLabel htmlFor="cc-token" required>
                        {t.token}
                      </FormLabel>
                      <Input id="cc-token" name="bearer_token" type="password" required autoComplete="off" className="font-mono" />
                      <FieldDescription className="text-xs">{t.tokenHelp}</FieldDescription>
                    </Field>
                  )}
                </>
              ) : (
                <>
                  <Alert className="rounded-xl border-0 bg-secondary px-3.5 py-2.5">
                    <AlertDescription>{t.stdioWarning}</AlertDescription>
                  </Alert>
                  <Field className="gap-1.5">
                    <FormLabel htmlFor="cc-command" required>
                      {t.command}
                    </FormLabel>
                    <Input
                      id="cc-command"
                      required
                      pattern="[\w.\-]{1,40}"
                      placeholder="npx"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      autoComplete="off"
                      className="font-mono"
                    />
                  </Field>
                  <Field className="gap-1.5">
                    <FormLabel htmlFor="cc-args">{t.args}</FormLabel>
                    <Textarea id="cc-args" name="args" rows={3} placeholder={"-y\npackage@1.0.0"} className="font-mono" />
                    <FieldDescription className="text-xs">{t.argsHelp}</FieldDescription>
                  </Field>
                  <FieldSet className="gap-2">
                    <FieldLegend variant="label">{t.env}</FieldLegend>
                    {env.map((row) => (
                      <div key={row.key} className="flex items-center gap-2">
                        <Input
                          aria-label={t.envName}
                          placeholder="API_KEY"
                          required
                          pattern="[A-Z][A-Z0-9_]*"
                          value={row.name}
                          onChange={(e) => setEnv((xs) => xs.map((x) => (x.key === row.key ? { ...x, name: e.target.value.toUpperCase() } : x)))}
                          autoComplete="off"
                          className="w-2/5 font-mono"
                        />
                        <Input
                          aria-label={t.envValue}
                          placeholder={t.envValue}
                          required
                          type={row.secret ? "password" : "text"}
                          value={row.value}
                          onChange={(e) => setEnv((xs) => xs.map((x) => (x.key === row.key ? { ...x, value: e.target.value } : x)))}
                          autoComplete="off"
                          className="flex-1 font-mono"
                        />
                        <Field orientation="horizontal" className="w-auto shrink-0 gap-2">
                          <Checkbox
                            id={`secret-${row.key}`}
                            checked={row.secret}
                            onCheckedChange={(v) => setEnv((xs) => xs.map((x) => (x.key === row.key ? { ...x, secret: v === true } : x)))}
                          />
                          <FieldLabel htmlFor={`secret-${row.key}`} className="cursor-pointer font-normal">
                            {t.secret}
                          </FieldLabel>
                        </Field>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={t.removeVariable(row.name)}
                          onClick={() => setEnv((xs) => xs.filter((x) => x.key !== row.key))}
                        >
                          <CloseIcon />
                        </Button>
                      </div>
                    ))}
                    <div>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => setEnv((xs) => [...xs, { key: crypto.randomUUID(), name: "", value: "", secret: true }])}
                      >
                        {t.addVariable}
                      </Button>
                    </div>
                    {env.length > 0 && <FieldDescription className="text-xs">{t.secretsNote}</FieldDescription>}
                  </FieldSet>
                </>
              )}

              <Field className="gap-1.5">
                <FormLabel htmlFor="cc-docs">{t.docs}</FormLabel>
                <Input id="cc-docs" name="docs" type="url" placeholder="https://" autoComplete="off" />
              </Field>

              <AgentTargets legend={t.enableForAgents} hint={t.defaultProfile} value={targets} onChange={setTargets} withoutDefault />

              <Field orientation="horizontal" className="gap-3">
                <Button type="submit" disabled={add.isPending}>
                  {add.isPending ? (oauth.status ?? progress ?? c.inProgress) : t.add}
                </Button>
                <ErrorText error={add.error} />
              </Field>
            </FieldGroup>
          </form>
        </>
      )}
    </div>
  );
}

