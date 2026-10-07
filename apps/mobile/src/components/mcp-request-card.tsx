import { common, connectors, integrations } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import * as Haptics from "expo-haptics";
import { Alert, Button, Card, Description, Input, Label, LinkButton, SkeletonGroup, Spinner, TextField, Typography, useToast } from "heroui-native";
import { Linking, View } from "react-native";
import { ConnectorField } from "@/components/connector-field";
import { WarningIcon } from "@/components/icons";
import { OAuthClientFields } from "@/components/marketplace/oauth-client-fields";
import { EMPTY_OAUTH_CLIENT, needsOwnClient, oauthClientOf } from "@/components/marketplace/oauth-client";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { useMcpOAuth } from "@/lib/marketplace";
import type { McpRequest } from "@/lib/types";
import type { StatusTone } from "@agora/core";
import { BlockGroup, BlockHeader, blockCard, MetaRow, StatusLine } from "@/components/views/block";
import { mcpRequestQuery } from "@/lib/requests";

/* apps/web/src/components/McpRequestCard.tsx */

const LIVE = new Set<McpRequest["status"]>(["pending", "approved", "authorizing"]);

/* apps/web/src/components/McpRequestCard.tsx `STATUS_TONE` */
const STATUS_TONE: Record<McpRequest["status"], StatusTone> = {
  pending: "warning",
  approved: "info",
  authorizing: "info",
  installed: "success",
  rejected: "danger",
};

const messages = defineMessages({
  en: {
    status: {
      pending: "Awaiting approval",
      approved: "Approved",
      authorizing: "Authorization needed",
      installed: "Installed",
      rejected: "Rejected",
    } as Record<McpRequest["status"], string>,
    loading: "Connector request…",
    connector: (title: string) => `Connector ${title}`,
    docs: "Documentation",
    stdioWarning: "This server will run this command on the Hermes machine. Check where it comes from before approving.",
    approve: "Approve",
    reject: "Reject",
    adminMust: "An admin must approve this connector before it's installed.",
    waitingConnect: "Waiting for the person who requested it to connect.",
    connectTo: (title: string) => `Connect to ${title}`,
    accessToken: "Access token",
    secretsNote: "Sent straight to Hermes: neither the conversation nor the app's database keeps them.",
    connecting: "Connecting…",
    connect: "Connect",
    installing: "Installing…",
    tools: (n: number, list: string) => `${n} tool${n > 1 ? "s" : ""}: ${list}`,
    connected: "Connected.",
    category: "Category",
    address: "Address",
    command: "Command",
    connection: "Connection",
    statusHelp: {
      pending: "An admin reviews the connector before the agent can use it.",
      approved: "The connector is approved: whoever requested it now connects their account.",
      authorizing: "The service is waiting for its sign-in to be authorized.",
      installed: "The connector is installed; the agent can use its tools.",
      rejected: "An admin refused this connector; it won't be installed.",
    } as Record<McpRequest["status"], string>,
  },
  fr: {
    status: {
      pending: "En attente de validation",
      approved: "Validé",
      authorizing: "Autorisation à donner",
      installed: "Installé",
      rejected: "Refusé",
    },
    loading: "Demande de connecteur…",
    connector: (title: string) => `Connecteur ${title}`,
    docs: "Documentation",
    stdioWarning: "Ce serveur exécutera cette commande sur la machine Hermes. Vérifie sa provenance avant de valider.",
    approve: "Valider",
    reject: "Refuser",
    adminMust: "Un administrateur doit valider ce connecteur avant qu'il soit installé.",
    waitingConnect: "En attente de connexion par la personne qui l'a demandé.",
    connectTo: (title: string) => `Se connecter à ${title}`,
    accessToken: "Jeton d'accès",
    secretsNote: "Transmis directement à Hermes : ni la conversation ni la base de l'app ne les conservent.",
    connecting: "Connexion…",
    connect: "Connecter",
    installing: "Installation…",
    tools: (n: number, list: string) => `${n} outil${n > 1 ? "s" : ""} : ${list}`,
    connected: "Connecté.",
    category: "Catégorie",
    address: "Adresse",
    command: "Commande",
    connection: "Connexion",
    statusHelp: {
      pending: "Un administrateur examine le connecteur avant que l'agent puisse s'en servir.",
      approved: "Le connecteur est validé : la personne qui l'a demandé connecte maintenant son compte.",
      authorizing: "Le service attend que sa connexion soit autorisée.",
      installed: "Le connecteur est installé ; l'agent peut utiliser ses outils.",
      rejected: "Un administrateur a refusé ce connecteur ; il ne sera pas installé.",
    },
  },
});

/** MCP connector requested by a bot: admin approval, then secrets or OAuth, in the conversation. */
export function McpRequestCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const t = messages;
  const c = tr(common);
  const { data: req, error } = useQuery({
    ...mcpRequestQuery(id),
    refetchInterval: (q) => (q.state.data && LIVE.has(q.state.data.status) ? 5_000 : false),
  });
  const refresh = (next?: McpRequest) => (next ? qc.setQueryData(["mcp-request", id], next) : qc.invalidateQueries({ queryKey: ["mcp-request", id] }));

  const { toast } = useToast();
  const fail = (error: Error) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    toast.show({ variant: "danger", label: error.message });
  };
  const decide = useMutation({
    mutationFn: (approve: boolean) => api<McpRequest>(`/mcp-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: (next, approve) => {
      refresh(next);
      toast.show(approve ? { variant: "success", label: t.status.approved } : { variant: "default", label: t.status.rejected });
    },
    onError: fail,
  });
  const install = useMutation({
    mutationFn: (body: { env: Record<string, string>; bearer_token?: string }) =>
      api<McpRequest>(`/mcp-requests/${id}/install`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: (next) => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      refresh(next);
      toast.show({ variant: "success", label: t.connected });
    },
    onError: fail,
  });
  const oauth = useMcpOAuth();
  const [client, setClient] = useState(EMPTY_OAUTH_CLIENT);
  const authorize = useMutation({
    mutationFn: () => {
      const oauth_client = oauthClientOf(client);
      // Declared again when a client is given: Hermes reads it from the server's config.
      const declare = req?.status === "approved" || oauth_client;
      return oauth.authorize(
        id,
        declare ? () => api(`/mcp-requests/${id}/install`, { method: "POST", body: JSON.stringify(oauth_client ? { oauth_client } : {}) }) : undefined,
      );
    },
    onSuccess: () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: "success", label: t.connected });
    },
    onError: fail,
    onSettled: () => refresh(),
  });

  // The form's fields: the web reads them from FormData, here they're controlled.
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [tried, setTried] = useState(false);

  if (error) return null;
  if (!req) {
    return (
      <Card className={blockCard} accessibilityLabel={t.loading}>
        <SkeletonGroup isLoading className="gap-2">
          <SkeletonGroup.Item className="h-4 w-2/3 rounded-md" />
          <SkeletonGroup.Item className="h-3 w-1/3 rounded-md" />
        </SkeletonGroup>
      </Card>
    );
  }

  const busy = decide.isPending || install.isPending || authorize.isPending;
  const needsForm = req.env.length > 0 || req.auth === "header";
  const missing = (name: string, required: boolean) => tried && required && !values[name];

  // `required` inputs: the web's browser validation, here the empty ones turn invalid.
  const submit = () => {
    setTried(true);
    if (req.auth === "header" && !values.bearer_token) return;
    if (req.env.some((v) => v.required && !values[v.name])) return;
    const env = Object.fromEntries(req.env.map((v) => [v.name, values[v.name] ?? ""]).filter(([, v]) => v));
    const bearer = values.bearer_token ?? "";
    install.mutate({ env, ...(bearer && { bearer_token: bearer }) });
  };
  const setValue = (name: string) => (text: string) => setValues((vs) => ({ ...vs, [name]: text }));
  const secretInput = { autoCapitalize: "none", autoCorrect: false, autoComplete: "off" } as const;
  const target = req.url ?? req.command;

  return (
    <Card className={blockCard}>
      <BlockHeader
        title={t.connector(req.title)}
        description={req.description}
        status={<StatusLine tone={STATUS_TONE[req.status]} label={t.status[req.status]} help={t.statusHelp[req.status]} />}
      />

      <Card.Body className="gap-2">
        <BlockGroup>
          <MetaRow label={t.category}>{tr(integrations).types[req.type]}</MetaRow>
          {!!target && (
            <MetaRow label={req.transport === "stdio" ? t.command : t.address} mono>
              {target}
            </MetaRow>
          )}
          {req.status !== "rejected" && <MetaRow label={t.connection}>{tr(connectors).auths[req.auth]}</MetaRow>}
        </BlockGroup>
        {req.status === "pending" && req.canDecide && req.transport === "stdio" && (
          <View className="flex-row items-start gap-2">
            <WarningIcon size={16} className="mt-1 text-warning" />
            <Typography.Paragraph type="body-sm" color="muted" className="min-w-0 flex-1">
              {t.stdioWarning}
            </Typography.Paragraph>
          </View>
        )}
        {!!req.docsUrl && !(req.status === "pending" && req.canDecide) && (
          <LinkButton size="sm" accessibilityRole="link" onPress={withTap(() => Linking.openURL(req.docsUrl!))} className="self-start">
            {t.docs}
          </LinkButton>
        )}
      </Card.Body>

      <Card.Footer className="gap-2">
        {req.status === "pending" &&
          (req.canDecide ? (
            <>
              <Button isDisabled={busy} onPress={withTap(() => decide.mutate(true))}>
                {decide.isPending && decide.variables ? c.inProgress : t.approve}
              </Button>
              <View className="flex-row justify-between gap-2">
                {!!req.docsUrl && (
                  <Button variant="ghost" accessibilityRole="link" onPress={withTap(() => Linking.openURL(req.docsUrl!))}>
                    {t.docs}
                  </Button>
                )}
                <Button variant="ghost" className={req.docsUrl ? undefined : "flex-1"} isDisabled={busy} onPress={withTap(() => decide.mutate(false))}>
                  <Button.Label className="text-danger">{t.reject}</Button.Label>
                </Button>
              </View>
            </>
          ) : (
            <Typography.Paragraph type="body-sm" color="muted">
              {t.adminMust}
            </Typography.Paragraph>
          ))}

        {(req.status === "approved" || req.status === "authorizing") &&
          (!req.canConnect ? (
            <Typography.Paragraph type="body-sm" color="muted">
              {t.waitingConnect}
            </Typography.Paragraph>
          ) : req.auth === "oauth" ? (
            <View className="gap-4">
              {!!req.redirectUri && (
                <OAuthClientFields
                  redirectUri={req.redirectUri}
                  value={client}
                  onChange={setClient}
                  required={needsOwnClient(authorize.error) || /manually-registered|registration/i.test(req.error ?? "")}
                  disabled={busy}
                />
              )}
              <View className="gap-2">
                <Button isDisabled={busy} onPress={withTap(() => authorize.mutate())}>
                  {authorize.isPending ? c.inProgress : t.connectTo(req.title)}
                </Button>
                {oauth.status && (
                  <Typography.Paragraph type="body-sm" color="muted">
                    {oauth.status}
                  </Typography.Paragraph>
                )}
              </View>
            </View>
          ) : needsForm ? (
            <View className="gap-4">
              {req.auth === "header" && (
                <TextField isRequired isInvalid={missing("bearer_token", true)}>
                  <Label>{t.accessToken}</Label>
                  <Input value={values.bearer_token ?? ""} onChangeText={setValue("bearer_token")} secureTextEntry {...secretInput} />
                </TextField>
              )}
              {req.env.map((v) => (
                <ConnectorField
                  key={v.name}
                  field={v}
                  value={values[v.name] ?? ""}
                  fileName={fileNames[v.name]}
                  invalid={missing(v.name, v.required)}
                  onChange={(value, fileName) => {
                    setValue(v.name)(value);
                    if (fileName !== undefined) setFileNames((ns) => ({ ...ns, [v.name]: fileName }));
                  }}
                />
              ))}
              <Description>{t.secretsNote}</Description>
              <Button isDisabled={busy} onPress={withTap(submit)}>
                {install.isPending ? t.connecting : t.connect}
              </Button>
            </View>
          ) : req.error ? (
            <Button isDisabled={busy} onPress={withTap(() => install.mutate({ env: {} }))}>
              {install.isPending ? c.inProgress : c.retry}
            </Button>
          ) : (
            <View className="flex-row items-center gap-2">
              <Spinner size="sm" />
              <Typography.Paragraph type="body-sm" color="muted">
                {t.installing}
              </Typography.Paragraph>
            </View>
          ))}

        {req.status === "installed" && (
          <Typography.Paragraph type="body-sm" color="muted">
            {req.tools?.length ? t.tools(req.tools.length, `${req.tools.slice(0, 6).join(", ")}${req.tools.length > 6 ? "…" : ""}`) : t.connected}
          </Typography.Paragraph>
        )}

        {!!req.error && req.status !== "installed" && (
          <Alert status="danger">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Description>{req.error}</Alert.Description>
            </Alert.Content>
          </Alert>
        )}
      </Card.Footer>
    </Card>
  );
}
