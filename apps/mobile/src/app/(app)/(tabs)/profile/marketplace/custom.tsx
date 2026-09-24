import { guessIntegrationType, type IntegrationType } from "@agora/core";
import { common, integrations } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Alert, Button, Card, ControlField, Description, FieldError, Input, Label, Tabs, TextArea, TextField, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AdminGate, ErrorAlert, SettingsScroll } from "@/components/admin/ui";
import { CloseIcon } from "@/components/icons";
import { AgentTargets } from "@/components/marketplace/agent-targets";
import { IntegrationTile, IntegrationTypeSection } from "@/components/marketplace/integration-type";
import { OAuthClientFields } from "@/components/marketplace/oauth-client-fields";
import { RestartBanner } from "@/components/marketplace/restart-banner";
import { EMPTY_OAUTH_CLIENT, needsOwnClient, oauthClientOf } from "@/components/marketplace/oauth-client";
import { adminAgentsQuery } from "@/lib/agents-admin";
import { api, apiUrl } from "@/lib/api";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { flagRestart, useMcpOAuth } from "@/lib/marketplace";
import type { McpRequest } from "@/lib/types";

/* apps/web/src/components/marketplace/CustomConnectorSheet.tsx, as a form sheet. */

type Transport = "remote" | "stdio";
type Auth = "none" | "header" | "oauth";
type EnvRow = { key: string; name: string; value: string; secret: boolean };

const t = defineMessages({
  en: {
    title: "Custom connector",
    subtitle: "MCP server that isn't in the catalogs",
    intro: "Declare any MCP server by its URL or its command. Its type sets its icon and how bots show its data in conversations.",
    displayName: "Name",
    serverName: "Identifier",
    serverNameHelp: (name: string) => `Lowercase, digits and dashes. Bots see its tools as mcp__${name || "name"}__*.`,
    serverNameInvalid: "Lowercase letters, digits, dashes and _ only.",
    description: "Description",
    transport: "Transport",
    remote: "Remote (URL)",
    stdio: "Local (command)",
    url: "Server URL",
    urlInvalid: "An https:// address.",
    docsInvalid: "A web address (https://…).",
    auth: "Authentication",
    auths: { none: "None", header: "Access token", oauth: "OAuth" } as Record<Auth, string>,
    token: "Access token",
    tokenHelp: "Sent as an Authorization: Bearer header, stored in Hermes's .env only.",
    oauthHelp: "After adding, the browser opens for you to sign in to the service.",
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
    serverNameInvalid: "Minuscules, chiffres, tirets et _ uniquement.",
    description: "Description",
    transport: "Transport",
    remote: "Distant (URL)",
    stdio: "Local (commande)",
    url: "URL du serveur",
    urlInvalid: "Une adresse en https://.",
    docsInvalid: "Une adresse web (https://…).",
    auth: "Authentification",
    auths: { none: "Aucune", header: "Jeton d'accès", oauth: "OAuth" },
    token: "Jeton d'accès",
    tokenHelp: "Envoyé en en-tête Authorization: Bearer, stocké uniquement dans le .env de Hermes.",
    oauthHelp: "Après l'ajout, le navigateur s'ouvre pour te connecter au service.",
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
    installed: (n: number) =>
      `Connecteur ajouté, ${n} outil${n > 1 ? "s" : ""} disponible${n > 1 ? "s" : ""}. Redémarre Hermes (bandeau ci-dessus) pour que les agents le chargent.`,
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

/** The web form's `pattern` attributes. */
const NAME = /^[a-z0-9][a-z0-9_-]{0,59}$/;
const HTTPS_URL = /^https:\/\/.+/;
/** The docs link: any web address, as the web's type=url field accepts. */
const WEB_URL = /^https?:\/\/\S+$/;
const COMMAND = /^[\w.-]{1,40}$/;
const ENV_NAME = /^[A-Z][A-Z0-9_]*$/;

export default function CustomConnectorScreen() {
  return (
    <>
      <Stack.Screen options={{ title: t.title }} />
      <AdminGate>
        <CustomConnector />
      </AdminGate>
    </>
  );
}

function CustomConnector() {
  const c = tr(common);
  const i = tr(integrations);
  const qc = useQueryClient();
  const router = useRouter();
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const oauth = useMcpOAuth();

  const [title, setTitle] = useState("");
  const [name, setName] = useState<string | null>(null);
  const [type, setType] = useState<IntegrationType | null>(null);
  const [description, setDescription] = useState("");
  const [transport, setTransport] = useState<Transport>("remote");
  const [auth, setAuth] = useState<Auth>("none");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [command, setCommand] = useState("");
  const [args, setArgs] = useState("");
  const [env, setEnv] = useState<EnvRow[]>([]);
  const [docs, setDocs] = useState("");
  const [targets, setTargets] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [client, setClient] = useState(EMPTY_OAUTH_CLIENT);
  // Declared but not installed yet (the connection failed): a new attempt reuses it.
  const [created, setCreated] = useState<McpRequest | null>(null);

  const serverName = name ?? slug(title);
  const shownType = type ?? guessIntegrationType(title, serverName, url, command);
  const editRow = (key: string, patch: Partial<EnvRow>) => setEnv((xs) => xs.map((x) => (x.key === key ? { ...x, ...patch } : x)));

  const nameInvalid = !!serverName && !NAME.test(serverName);
  const urlInvalid = !!url && !HTTPS_URL.test(url);
  const docsInvalid = !!docs.trim() && !WEB_URL.test(docs.trim());

  const add = useMutation({
    mutationFn: async () => {
      let req = created;
      if (!req || req.name !== serverName) {
        setProgress(t.creating);
        const block =
          transport === "remote"
            ? { url, auth }
            : {
                command,
                args: args.split("\n").map((a) => a.trim()).filter(Boolean),
                env: env.filter((e) => e.name).map((e) => ({ name: e.name, required: true, secret: e.secret })),
              };
        req = await api<McpRequest>("/mcp-requests/custom", {
          method: "POST",
          body: JSON.stringify({
            name: serverName,
            title: title.trim() || serverName,
            description: description.trim(),
            type: shownType,
            ...(docs.trim() && { docs: docs.trim() }),
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
          ...(req.auth === "header" && { bearer_token: token.trim() }),
        });
      }
      for (const id of targets) {
        setProgress(t.enabling(agentName.get(id)));
        await api(`/admin/hermes/agents/${id}/mcp/${req.name}`, { method: "PUT", body: JSON.stringify({ enabled: true }) });
      }
      flagRestart();
      return api<McpRequest>(`/mcp-requests/${req.id}`);
    },
    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onSettled: () => {
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["hermes"] });
      qc.invalidateQueries({ queryKey: ["mcp-requests"] });
    },
  });

  // The service refused dynamic registration: a new attempt needs the app's own Client ID.
  const clientRequired = transport === "remote" && auth === "oauth" && needsOwnClient(add.error);
  const valid =
    !!title.trim() &&
    !!serverName &&
    !nameInvalid &&
    !docsInvalid &&
    (!clientRequired || !!client.client_id.trim()) &&
    (transport === "remote"
      ? HTTPS_URL.test(url) && (auth !== "header" || !!token.trim())
      : COMMAND.test(command) && env.every((e) => ENV_NAME.test(e.name) && !!e.value));

  return (
    <SettingsScroll>
      <View className="flex-row items-center gap-4 px-1">
        <IntegrationTile type={shownType} size="lg" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Typography.Heading type="h4" numberOfLines={2}>
            {title.trim() || t.title}
          </Typography.Heading>
          <Typography.Paragraph type="body-sm" color="muted">
            {i.types[shownType]} · {t.subtitle}
          </Typography.Paragraph>
        </View>
      </View>

      {add.isSuccess ? (
        <>
          <RestartBanner />
          <Card>
            <Card.Body>
              <Typography.Paragraph>{t.installed(add.data.tools?.length ?? 0)}</Typography.Paragraph>
            </Card.Body>
            <Card.Footer>
              <Button onPress={withTap(() => router.back())}>{t.done}</Button>
            </Card.Footer>
          </Card>
        </>
      ) : (
        <>
          <Typography.Paragraph className="px-1">{t.intro}</Typography.Paragraph>

          <TextField isRequired>
            <Label>{t.displayName}</Label>
            <Input value={title} onChangeText={setTitle} maxLength={80} autoCorrect={false} />
          </TextField>
          <IntegrationTypeSection value={shownType} onChange={setType} />
          <TextField isRequired isInvalid={nameInvalid}>
            <Label>{t.serverName}</Label>
            <Input
              value={serverName}
              onChangeText={(v) => setName(v.toLowerCase())}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            {nameInvalid ? <FieldError>{t.serverNameInvalid}</FieldError> : <Description>{t.serverNameHelp(serverName)}</Description>}
          </TextField>
          <TextField>
            <Label>{t.description}</Label>
            <TextArea value={description} onChangeText={setDescription} maxLength={500} className="min-h-20" />
          </TextField>

          <View className="gap-2">
            <Label isRequired>{t.transport}</Label>
            <Tabs value={transport} onValueChange={(v) => (haptic.select(), setTransport(v as Transport))}>
              <Tabs.List>
                <Tabs.Indicator />
                <Tabs.Trigger value="remote">
                  <Tabs.Label>{t.remote}</Tabs.Label>
                </Tabs.Trigger>
                <Tabs.Trigger value="stdio">
                  <Tabs.Label>{t.stdio}</Tabs.Label>
                </Tabs.Trigger>
              </Tabs.List>
            </Tabs>
          </View>

          {transport === "remote" ? (
            <>
              <TextField isRequired isInvalid={urlInvalid}>
                <Label>{t.url}</Label>
                <Input
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://"
                  keyboardType="url"
                  autoCapitalize="none"
                  autoCorrect={false}
                />
                {urlInvalid && <FieldError>{t.urlInvalid}</FieldError>}
              </TextField>
              <View className="gap-2">
                <Label isRequired>{t.auth}</Label>
                <Tabs value={auth} onValueChange={(v) => (haptic.select(), setAuth(v as Auth))}>
                  <Tabs.List>
                    <Tabs.Indicator />
                    {(["none", "header", "oauth"] as const).map((a) => (
                      <Tabs.Trigger key={a} value={a}>
                        <Tabs.Label>{t.auths[a]}</Tabs.Label>
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                </Tabs>
                {auth === "oauth" && <Description>{t.oauthHelp}</Description>}
              </View>
              {auth === "oauth" && (
                <OAuthClientFields
                  redirectUri={apiUrl(`/mcp-oauth/callback/${encodeURIComponent(serverName || "…")}`)}
                  value={client}
                  onChange={setClient}
                  required={clientRequired}
                  disabled={add.isPending}
                />
              )}
              {auth === "header" && (
                <TextField isRequired>
                  <Label>{t.token}</Label>
                  <Input value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" autoCorrect={false} />
                  <Description>{t.tokenHelp}</Description>
                </TextField>
              )}
            </>
          ) : (
            <>
              <Alert status="warning">
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>{t.stdioWarning}</Alert.Description>
                </Alert.Content>
              </Alert>
              <TextField isRequired>
                <Label>{t.command}</Label>
                <Input value={command} onChangeText={setCommand} placeholder="npx" autoCapitalize="none" autoCorrect={false} />
              </TextField>
              <TextField>
                <Label>{t.args}</Label>
                <TextArea
                  value={args}
                  onChangeText={setArgs}
                  placeholder={"-y\npackage@1.0.0"}
                  autoCapitalize="none"
                  autoCorrect={false}
                  className="min-h-24"
                />
                <Description>{t.argsHelp}</Description>
              </TextField>
              <View className="gap-3">
                <Label>{t.env}</Label>
                {env.map((row) => (
                  <Card key={row.key} variant="secondary">
                    <Card.Body className="gap-2">
                      <View className="flex-row items-center gap-2">
                        <Input
                          accessibilityLabel={t.envName}
                          placeholder="API_KEY"
                          value={row.name}
                          onChangeText={(v) => editRow(row.key, { name: v.toUpperCase() })}
                          autoCapitalize="characters"
                          autoCorrect={false}
                          containerClassName="flex-1"
                        />
                        <Button isIconOnly variant="ghost" size="sm" accessibilityLabel={t.removeVariable(row.name)} onPress={withTap(() => setEnv((xs) => xs.filter((x) => x.key !== row.key)))}>
                          <CloseIcon className="size-5 text-muted" />
                        </Button>
                      </View>
                      <Input
                        accessibilityLabel={t.envValue}
                        placeholder={t.envValue}
                        value={row.value}
                        onChangeText={(v) => editRow(row.key, { value: v })}
                        secureTextEntry={row.secret}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <ControlField className="self-start" isSelected={row.secret} onSelectedChange={(v) => (haptic.select(), editRow(row.key, { secret: v }))}>
                        <ControlField.Indicator variant="checkbox" />
                        <Label>{t.secret}</Label>
                      </ControlField>
                    </Card.Body>
                  </Card>
                ))}
                <Button
                  variant="secondary"
                  size="sm"
                  className="self-start"
                  onPress={withTap(() => setEnv((xs) => [...xs, { key: `${Date.now()}-${xs.length}`, name: "", value: "", secret: true }]))}
                >
                  {t.addVariable}
                </Button>
                {env.length > 0 && <Description>{t.secretsNote}</Description>}
              </View>
            </>
          )}

          <TextField isInvalid={docsInvalid}>
            <Label>{t.docs}</Label>
            <Input value={docs} onChangeText={setDocs} placeholder="https://" keyboardType="url" autoCapitalize="none" autoCorrect={false} />
            {docsInvalid && <FieldError>{t.docsInvalid}</FieldError>}
          </TextField>

          <AgentTargets legend={t.enableForAgents} hint={t.defaultProfile} value={targets} onChange={setTargets} withoutDefault />

          <ErrorAlert error={add.error} />
          <Button size="lg" isDisabled={add.isPending || !valid} onPress={withTap(() => add.mutate())}>
            {add.isPending ? (oauth.status ?? progress ?? c.inProgress) : t.add}
          </Button>
        </>
      )}
    </SettingsScroll>
  );
}
