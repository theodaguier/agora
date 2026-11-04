import { guessIntegrationType, withHttps, type IntegrationType } from "@agora/core";
import { common, integrations } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { useRestartNeeded } from "@/components/admin/ui";
import { FormLabel } from "@/components/FormLabel";
import { BanIcon, CheckIcon, CloseIcon, CodeIcon, KeyIcon, ShieldCheckIcon } from "@/components/icons";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { defineMessages, useT } from "@/i18n";
import { api, type McpRequest } from "@/lib/api";
import { adminAgentsQuery } from "@/lib/queries";
import { AgentTargets } from "./AgentTargets";
import { IntegrationTile, IntegrationTypeSelect } from "./IntegrationType";
import { SheetHeader } from "./layout";
import { useMcpOAuth } from "./use-mcp-oauth";
import { OAuthClientFields } from "./OAuthClientFields";
import { needsOwnClient, oauthClientOf } from "../../lib/oauth-client";

type Transport = "remote" | "stdio";
type Auth = "none" | "header" | "headers" | "oauth";
type Row = { key: string; name: string; value: string };

const AUTHS = ["none", "header", "headers", "oauth"] as const;

/** How the server is reached: openly, with a token, with headers, or by signing in. */
const AUTH_ICONS: Record<Auth, ReactNode> = {
  none: <BanIcon />,
  header: <KeyIcon />,
  headers: <CodeIcon />,
  oauth: <ShieldCheckIcon />,
};

const messages = defineMessages({
  en: {
    title: "Custom connector",
    subtitle: "MCP server that isn't in the catalogs",
    name: "Name",
    connect: "How bots reach it",
    remote: "By an address",
    remoteHelp: "A server online or on your network",
    stdio: "By a command",
    stdioHelp: "A program started on the Hermes machine",
    url: "Server address",
    urlHelp: "Its MCP address, often ending in /mcp or /sse. An address on your network works too.",
    auth: "Authentication",
    auths: { none: "None", header: "Access token", headers: "HTTP headers", oauth: "Sign in (OAuth)" } as Record<Auth, string>,
    token: "Access token",
    tokenHelp: "Sent with every request, kept on the Hermes side only.",
    oauthHelp: "Once added, a tab opens for you to sign in to the service.",
    headers: "HTTP headers",
    headersHelp: "The ones the server's documentation asks for. Values are kept on the Hermes side only.",
    headerName: "Header",
    headerValue: "Value",
    addHeader: "Add a header",
    command: "Command",
    commandHelp: "Paste it as given in the server's documentation.",
    stdioWarning: "This command runs third-party code on the Hermes machine. Check where it comes from before adding it.",
    env: "Environment variables",
    envHelp: "Paste KEY=value lines to fill several at once. Values are kept on the Hermes side only.",
    envName: "Variable",
    envValue: "Value",
    addVariable: "Add a variable",
    remove: (name: string) => `Remove ${name || "this line"}`,
    more: "More options",
    identifier: "Identifier",
    identifierHelp: "How bots name it. Lowercase, digits and dashes.",
    description: "Description",
    docs: "Documentation",
    enableForAgents: "Bots that can use it",
    defaultProfile: "The main bot has it automatically.",
    creating: "Declaring…",
    installing: "Testing the connection…",
    authorizing: "Waiting for your sign-in…",
    enabling: (name?: string) => `Enabling for ${name}…`,
    add: "Add the connector",
    failed: "The connector couldn't be added",
    done: "Done",
    installedTitle: "Connector added",
    installed: (n: number) => `${n} tool${n > 1 ? "s" : ""} available. Restart Hermes (banner above) so bots load it.`,
  },
  fr: {
    title: "Connecteur personnalisé",
    subtitle: "Serveur MCP absent des catalogues",
    name: "Nom",
    connect: "Comment les bots le joignent",
    remote: "Par une adresse",
    remoteHelp: "Un serveur en ligne ou sur ton réseau",
    stdio: "Par une commande",
    stdioHelp: "Un programme lancé sur la machine Hermes",
    url: "Adresse du serveur",
    urlHelp: "Son adresse MCP, souvent terminée par /mcp ou /sse. Une adresse de ton réseau marche aussi.",
    auth: "Authentification",
    auths: { none: "Aucune", header: "Jeton d'accès", headers: "En-têtes HTTP", oauth: "Connexion (OAuth)" },
    token: "Jeton d'accès",
    tokenHelp: "Envoyé à chaque requête, gardé uniquement côté Hermes.",
    oauthHelp: "Une fois ajouté, un onglet s'ouvre pour te connecter au service.",
    headers: "En-têtes HTTP",
    headersHelp: "Ceux que demande la documentation du serveur. Les valeurs restent uniquement côté Hermes.",
    headerName: "En-tête",
    headerValue: "Valeur",
    addHeader: "Ajouter un en-tête",
    command: "Commande",
    commandHelp: "Colle-la telle qu'elle est donnée dans la documentation du serveur.",
    stdioWarning: "Cette commande exécute du code tiers sur la machine Hermes. Vérifie sa provenance avant de l'ajouter.",
    env: "Variables d'environnement",
    envHelp: "Colle des lignes CLÉ=valeur pour en remplir plusieurs d'un coup. Les valeurs restent uniquement côté Hermes.",
    envName: "Variable",
    envValue: "Valeur",
    addVariable: "Ajouter une variable",
    remove: (name: string) => `Retirer ${name || "cette ligne"}`,
    more: "Plus d'options",
    identifier: "Identifiant",
    identifierHelp: "Le nom que les bots lui donnent. Minuscules, chiffres et tirets.",
    description: "Description",
    docs: "Documentation",
    enableForAgents: "Bots qui peuvent l'utiliser",
    defaultProfile: "Le bot principal y a accès automatiquement.",
    creating: "Déclaration…",
    installing: "Test de la connexion…",
    authorizing: "En attente de ta connexion…",
    enabling: (name?: string) => `Activation pour ${name}…`,
    add: "Ajouter le connecteur",
    failed: "Le connecteur n'a pas pu être ajouté",
    done: "Terminé",
    installedTitle: "Connecteur ajouté",
    installed: (n: number) => `${n} outil${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}. Redémarre Hermes (bandeau ci-dessus) pour que les bots le chargent.`,
  },
});

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/** A command line as a shell reads it: words split on spaces, quotes keeping theirs together. */
export function splitCommand(line: string): string[] {
  const words: string[] = [];
  let word = "";
  let quote: string | null = null;
  let started = false;
  for (const ch of line.trim()) {
    if (quote) {
      if (ch === quote) quote = null;
      else word += ch;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      started = true;
    } else if (/\s/.test(ch)) {
      if (started || word) words.push(word);
      word = "";
      started = false;
    } else word += ch;
  }
  if (started || word) words.push(word);
  return words;
}

/** KEY=value lines pasted at once (a .env, a README block): one row each. */
function parseEnvLines(text: string): Row[] {
  return text
    .split(/\r?\n/)
    .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ key: crypto.randomUUID(), name: m[1]!.toUpperCase(), value: m[2]!.replace(/^(["'])(.*)\1$/, "$2") }));
}

const newRow = (): Row => ({ key: crypto.randomUUID(), name: "", value: "" });

/** Name and value lines (headers, environment variables), added and removed one by one. */
function PairRows(props: {
  rows: Row[];
  onChange: (rows: Row[]) => void;
  nameLabel: string;
  valueLabel: string;
  namePlaceholder: string;
  namePattern: string;
  upper?: boolean;
  addLabel: string;
  onPasteLines?: (text: string) => boolean;
}) {
  const t = useT(messages);
  const set = (key: string, patch: Partial<Row>) => props.onChange(props.rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  return (
    <div className="flex flex-col gap-2">
      {props.rows.map((row) => (
        <div key={row.key} className="flex items-center gap-2">
          <Input
            aria-label={props.nameLabel}
            placeholder={props.namePlaceholder}
            required
            pattern={props.namePattern}
            value={row.name}
            onChange={(e) => set(row.key, { name: props.upper ? e.target.value.toUpperCase() : e.target.value })}
            onPaste={(e) => {
              if (props.onPasteLines?.(e.clipboardData.getData("text"))) e.preventDefault();
            }}
            autoComplete="off"
            spellCheck={false}
            className="w-2/5"
          />
          <Input
            aria-label={props.valueLabel}
            placeholder={props.valueLabel}
            required
            type="password"
            value={row.value}
            onChange={(e) => set(row.key, { value: e.target.value })}
            autoComplete="new-password"
            className="flex-1"
          />
          <Button type="button" variant="ghost" size="icon-sm" aria-label={t.remove(row.name)} onClick={() => props.onChange(props.rows.filter((r) => r.key !== row.key))}>
            <CloseIcon />
          </Button>
        </div>
      ))}
      <div>
        <Button type="button" variant="outline" size="sm" onClick={() => props.onChange([...props.rows, newRow()])}>
          {props.addLabel}
        </Button>
      </div>
    </div>
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
  const [url, setUrl] = useState("");
  const [auth, setAuth] = useState<Auth>("none");
  const [token, setToken] = useState("");
  const [headers, setHeaders] = useState<Row[]>([newRow()]);
  const [commandLine, setCommandLine] = useState("");
  const [env, setEnv] = useState<Row[]>([]);
  const [description, setDescription] = useState("");
  const [docs, setDocs] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [client, setClient] = useState({ client_id: "", client_secret: "", scope: "" });
  const [progress, setProgress] = useState<string | null>(null);
  // Declared but not installed yet (the connection failed): reused only while the declaration is the same.
  const [created, setCreated] = useState<{ req: McpRequest; fingerprint: string } | null>(null);

  const serverName = name ?? slug(title);
  const words = splitCommand(commandLine);
  const shownType = type ?? guessIntegrationType(title, serverName, url, words[0] ?? "");

  const add = useMutation({
    mutationFn: async () => {
      const block =
        transport === "remote"
          ? {
              url: withHttps(url),
              auth: auth === "headers" ? "none" : auth,
              headers: auth === "headers" ? headers.filter((h) => h.name).map((h) => ({ name: h.name })) : [],
            }
          : { command: words[0], args: words.slice(1), env: env.filter((e) => e.name).map((e) => ({ name: e.name, required: true, secret: true })) };
      const declaration = {
        name: serverName,
        title: title.trim() || serverName,
        description: description.trim(),
        type: shownType,
        ...(docs.trim() && { docs: withHttps(docs) }),
        ...block,
      };
      // Fixed after a failure (another address, another header): declared again, never retried as it was.
      const fingerprint = JSON.stringify(declaration);
      let req = created?.fingerprint === fingerprint ? created.req : null;
      if (!req) {
        setProgress(t.creating);
        req = await api<McpRequest>("/mcp-requests/custom", { method: "POST", body: JSON.stringify(declaration) });
        setCreated({ req, fingerprint });
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
          ...(req.auth === "header" && { bearer_token: token }),
          ...(auth === "headers" && { headers: Object.fromEntries(headers.filter((h) => h.name).map((h) => [h.name, h.value])) }),
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
    // The sheet says what's next once added, and what failed above its button.
    meta: { success: c.added, error: false },
  });

  const header = (
    <SheetHeader media={<IntegrationTile type={shownType} />} title={title.trim() || t.title} description={t.subtitle} badge={<Badge variant="secondary">{i.types[shownType]}</Badge>} />
  );

  if (add.isSuccess) {
    return (
      <div className="mx-auto flex max-w-xl flex-col gap-6">
        {header}
        <Empty>
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <CheckIcon />
            </EmptyMedia>
            <EmptyTitle>{t.installedTitle}</EmptyTitle>
            <EmptyDescription>{t.installed(add.data.tools?.length ?? 0)}</EmptyDescription>
          </EmptyHeader>
          <EmptyContent>
            <Button onClick={onDone}>{t.done}</Button>
          </EmptyContent>
        </Empty>
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6">
      {header}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add.mutate();
        }}
      >
        <FieldGroup>
          <Field>
            <FormLabel htmlFor="cc-title" required>
              {t.name}
            </FormLabel>
            <Input id="cc-title" required maxLength={80} value={title} onChange={(e) => setTitle(e.target.value)} autoComplete="off" autoFocus />
          </Field>

          <FieldSet>
            <FieldLegend variant="label">{t.connect}</FieldLegend>
            <RadioGroup value={transport} onValueChange={(v) => setTransport(v as Transport)} className="grid gap-3 sm:grid-cols-2">
              {(["remote", "stdio"] as const).map((v) => (
                <FieldLabel key={v} htmlFor={`cc-${v}`}>
                  <Field orientation="horizontal">
                    <FieldContent>
                      <FieldTitle>{t[v]}</FieldTitle>
                      <FieldDescription>{v === "remote" ? t.remoteHelp : t.stdioHelp}</FieldDescription>
                    </FieldContent>
                    <RadioGroupItem value={v} id={`cc-${v}`} />
                  </Field>
                </FieldLabel>
              ))}
            </RadioGroup>
          </FieldSet>

          {transport === "remote" ? (
            <>
              <Field>
                <FormLabel htmlFor="cc-url" required>
                  {t.url}
                </FormLabel>
                <Input
                  id="cc-url"
                  inputMode="url"
                  required
                  pattern="(https?://)?\S+"
                  placeholder="https://mcp.exemple.com/mcp"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  onBlur={() => setUrl((u) => withHttps(u))}
                  autoComplete="off"
                  spellCheck={false}
                />
                <FieldDescription>{t.urlHelp}</FieldDescription>
              </Field>
              <Field>
                <FormLabel htmlFor="cc-auth" required>
                  {t.auth}
                </FormLabel>
                <Select items={AUTHS.map((a) => ({ value: a, label: t.auths[a] }))} value={auth} onValueChange={(v) => v && setAuth(v as Auth)}>
                  <SelectTrigger id="cc-auth" className="w-full">
                    <SelectValue>
                      {(a: Auth) => (
                        <>
                          {AUTH_ICONS[a]}
                          {t.auths[a]}
                        </>
                      )}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent alignItemWithTrigger={false} align="start">
                    {AUTHS.map((a) => (
                      <SelectItem key={a} value={a}>
                        {AUTH_ICONS[a]}
                        {t.auths[a]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {auth === "oauth" && <FieldDescription>{t.oauthHelp}</FieldDescription>}
              </Field>
              {auth === "header" && (
                <Field>
                  <FormLabel htmlFor="cc-token" required>
                    {t.token}
                  </FormLabel>
                  <Input id="cc-token" type="password" required value={token} onChange={(e) => setToken(e.target.value)} autoComplete="new-password" />
                  <FieldDescription>{t.tokenHelp}</FieldDescription>
                </Field>
              )}
              {auth === "headers" && (
                <FieldSet>
                  <FieldLegend variant="label">{t.headers}</FieldLegend>
                  <FieldDescription>{t.headersHelp}</FieldDescription>
                  <PairRows
                    rows={headers}
                    onChange={setHeaders}
                    nameLabel={t.headerName}
                    valueLabel={t.headerValue}
                    namePlaceholder="X-API-Key"
                    namePattern="[A-Za-z0-9\-]{1,60}"
                    addLabel={t.addHeader}
                  />
                </FieldSet>
              )}
              {auth === "oauth" && (
                <OAuthClientFields
                  redirectUri={`${window.location.origin}/api/mcp-oauth/callback/${encodeURIComponent(serverName || "…")}`}
                  value={client}
                  onChange={setClient}
                  required={needsOwnClient(add.error)}
                  disabled={add.isPending}
                />
              )}
            </>
          ) : (
            <>
              <Alert>
                <AlertDescription>{t.stdioWarning}</AlertDescription>
              </Alert>
              <Field>
                <FormLabel htmlFor="cc-command" required>
                  {t.command}
                </FormLabel>
                <Input
                  id="cc-command"
                  required
                  placeholder="npx -y @modelcontextprotocol/server-github"
                  value={commandLine}
                  onChange={(e) => setCommandLine(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
                <FieldDescription>{t.commandHelp}</FieldDescription>
              </Field>
              <FieldSet>
                <FieldLegend variant="label">{t.env}</FieldLegend>
                <FieldDescription>{t.envHelp}</FieldDescription>
                <PairRows
                  rows={env}
                  onChange={setEnv}
                  nameLabel={t.envName}
                  valueLabel={t.envValue}
                  namePlaceholder="API_KEY"
                  namePattern="[A-Z][A-Z0-9_]*"
                  upper
                  addLabel={t.addVariable}
                  onPasteLines={(text) => {
                    const rows = parseEnvLines(text);
                    if (!rows.length) return false;
                    setEnv((xs) => [...xs.filter((x) => x.name || x.value), ...rows]);
                    return true;
                  }}
                />
              </FieldSet>
            </>
          )}

          <AgentTargets legend={t.enableForAgents} hint={t.defaultProfile} value={targets} onChange={setTargets} withoutDefault />

          <Collapsible>
            <CollapsibleTrigger render={<Button type="button" variant="link" size="sm" className="h-auto self-start p-0" />}>
              {t.more}
            </CollapsibleTrigger>
            <CollapsibleContent>
              <FieldGroup className="pt-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field>
                    <FormLabel htmlFor="cc-name" required>
                      {t.identifier}
                    </FormLabel>
                    <Input
                      id="cc-name"
                      required
                      pattern="[a-z0-9][a-z0-9_\-]{0,59}"
                      value={serverName}
                      onChange={(e) => setName(e.target.value.toLowerCase())}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <FieldDescription>{t.identifierHelp}</FieldDescription>
                  </Field>
                  <Field>
                    <FormLabel htmlFor="cc-type" required>
                      {i.type}
                    </FormLabel>
                    <IntegrationTypeSelect id="cc-type" value={shownType} onValueChange={setType} />
                  </Field>
                </div>
                <Field>
                  <FormLabel htmlFor="cc-description">{t.description}</FormLabel>
                  <Textarea id="cc-description" maxLength={500} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
                </Field>
                <Field>
                  <FormLabel htmlFor="cc-docs">{t.docs}</FormLabel>
                  <Input id="cc-docs" inputMode="url" placeholder="https://" value={docs} onChange={(e) => setDocs(e.target.value)} onBlur={() => setDocs((d) => withHttps(d))} autoComplete="off" />
                </Field>
              </FieldGroup>
            </CollapsibleContent>
          </Collapsible>

          {add.error && (
            <Alert variant="destructive">
              <AlertTitle>{t.failed}</AlertTitle>
              <AlertDescription>{add.error.message}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end">
            <Button type="submit" disabled={add.isPending}>
              {add.isPending ? (oauth.status ?? progress ?? c.inProgress) : t.add}
            </Button>
          </div>
        </FieldGroup>
      </form>
    </div>
  );
}
