import { RequiredMark } from "@/components/FormLabel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WarningIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConnectorField } from "@/components/ConnectorField";
import { Spinner } from "@/components/ui/spinner";
import { api, type McpRequest } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { useMcpOAuth } from "@/components/marketplace/use-mcp-oauth";
import { OAuthClientFields } from "@/components/marketplace/OAuthClientFields";
import { needsOwnClient, oauthClientOf } from "@/lib/oauth-client";
import { useState, type FormEvent } from "react";
import { connectors, integrations } from "@agora/core/i18n";
import type { StatusTone } from "@agora/core";
import { BlockCard, BlockFooter, MetaList, MetaRow, StatusLine } from "@/components/views/block";
import { common } from "@agora/core/i18n";

const LIVE = new Set<McpRequest["status"]>(["pending", "approved", "authorizing"]);

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
    category: "Category",
    address: "Address",
    command: "Command",
    connection: "Connection",
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
    category: "Catégorie",
    address: "Adresse",
    command: "Commande",
    connection: "Connexion",
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
  },
});

const mcpRequestQuery = (id: string) => ({
  queryKey: ["mcp-request", id],
  queryFn: () => api<McpRequest>(`/mcp-requests/${id}`),
});

/** MCP connector requested by a bot: admin approval, then secrets or OAuth, in the conversation. */
export function McpRequestCard({ id }: { id: string }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const c = useT(common);
  const i = useT(integrations);
  const co = useT(connectors);
  const { data: req, error } = useQuery({
    ...mcpRequestQuery(id),
    refetchInterval: (q) => (q.state.data && LIVE.has(q.state.data.status) ? 5_000 : false),
  });
  const refresh = (next?: McpRequest) => (next ? qc.setQueryData(["mcp-request", id], next) : qc.invalidateQueries({ queryKey: ["mcp-request", id] }));

  const decide = useMutation({
    mutationFn: (approve: boolean) => api<McpRequest>(`/mcp-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSuccess: refresh,
    // The card says what failed, next to its buttons.
    meta: { error: false },
  });
  const install = useMutation({
    mutationFn: (body: { env: Record<string, string>; bearer_token?: string }) =>
      api<McpRequest>(`/mcp-requests/${id}/install`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: refresh,
    meta: { error: false },
  });
  const oauth = useMcpOAuth();
  const [client, setClient] = useState({ client_id: "", client_secret: "", scope: "" });
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
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
    onSettled: () => refresh(),
    meta: { error: false },
  });

  if (error) return null;
  if (!req) {
    return (
      <BlockCard className="flex-row items-center gap-2 py-4 px-5 text-muted-foreground">
        <Spinner /> {t.loading}
      </BlockCard>
    );
  }

  const busy = decide.isPending || install.isPending || authorize.isPending;
  const needsForm = req.env.length > 0 || req.auth === "header";
  const failure = decide.error ?? install.error ?? authorize.error;

  const decides = req.status === "pending" && req.canDecide;
  const target = req.url ?? req.command;

  return (
    <BlockCard>
      <CardHeader>
        <CardTitle className="font-semibold">{t.connector(req.title)}</CardTitle>
        {req.description && <CardDescription>{req.description}</CardDescription>}
        <StatusLine tone={STATUS_TONE[req.status]} className="mt-1">
          {t.status[req.status]}
        </StatusLine>
      </CardHeader>

      <CardContent className="flex flex-col gap-3">
        <MetaList>
          <MetaRow label={t.category}>{i.types[req.type]}</MetaRow>
          {target && (
            <MetaRow label={req.url ? t.address : t.command} mono>
              {target}
            </MetaRow>
          )}
          <MetaRow label={t.connection}>{co.auths[req.auth]}</MetaRow>
        </MetaList>

        {decides && req.transport === "stdio" && (
          <p className="flex items-start gap-2 text-[13px] text-muted-foreground">
            <WarningIcon aria-hidden className="mt-px size-4 shrink-0 text-warning" />
            {t.stdioWarning}
          </p>
        )}
        {req.status === "pending" && !req.canDecide && <p className="text-sm text-muted-foreground">{t.adminMust}</p>}

        {(req.status === "approved" || req.status === "authorizing") &&
          (!req.canConnect ? (
            <p className="text-sm text-muted-foreground">{t.waitingConnect}</p>
          ) : req.auth === "oauth" ? (
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                authorize.mutate();
              }}
            >
              {req.redirectUri && (
                <OAuthClientFields
                  redirectUri={req.redirectUri}
                  value={client}
                  onChange={setClient}
                  required={needsOwnClient(authorize.error) || /manually-registered|registration/i.test(req.error ?? "")}
                  disabled={busy}
                />
              )}
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" type="submit" disabled={busy}>
                  {authorize.isPending ? c.inProgress : t.connectTo(req.title)}
                </Button>
                {oauth.status && <span className="text-sm text-muted-foreground">{oauth.status}</span>}
              </div>
            </form>
          ) : needsForm ? (
            <form
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                const missing = new Set(req.env.filter((v) => v.required && !values[v.name]?.trim()).map((v) => v.name));
                if (req.auth === "header" && !values.bearer_token?.trim()) missing.add("bearer_token");
                setInvalid(missing);
                if (missing.size) return;
                const env = Object.fromEntries(req.env.map((v) => [v.name, values[v.name] ?? ""]).filter(([, v]) => v));
                const bearer = values.bearer_token ?? "";
                install.mutate({ env, ...(bearer && { bearer_token: bearer }) });
              }}
            >
              <FieldGroup className="gap-3">
                {req.auth === "header" && (
                  <Field className="gap-1.5" data-invalid={invalid.has("bearer_token") || undefined}>
                    <FieldLabel htmlFor={`${id}-bearer`}>
                      {t.accessToken}
                      <RequiredMark />
                    </FieldLabel>
                    <Input
                      id={`${id}-bearer`}
                      type="password"
                      required
                      value={values.bearer_token ?? ""}
                      aria-invalid={invalid.has("bearer_token") || undefined}
                      autoComplete="off"
                      onChange={(e) => setValues((vs) => ({ ...vs, bearer_token: e.target.value }))}
                      className="font-mono"
                    />
                  </Field>
                )}
                {req.env.map((v) => (
                  <ConnectorField
                    key={v.name}
                    id={`${id}-${v.name}`}
                    field={v}
                    value={values[v.name] ?? ""}
                    fileName={fileNames[v.name]}
                    invalid={invalid.has(v.name)}
                    onChange={(value, fileName) => {
                      setValues((vs) => ({ ...vs, [v.name]: value }));
                      if (fileName !== undefined) setFileNames((ns) => ({ ...ns, [v.name]: fileName }));
                      setInvalid((current) => {
                        if (!current.has(v.name)) return current;
                        const next = new Set(current);
                        next.delete(v.name);
                        return next;
                      });
                    }}
                  />
                ))}
                <FieldDescription className="text-xs">{t.secretsNote}</FieldDescription>
                <div>
                  <Button size="sm" type="submit" disabled={busy}>
                    {install.isPending ? t.connecting : t.connect}
                  </Button>
                </div>
              </FieldGroup>
            </form>
          ) : req.error ? (
            <div>
              <Button size="sm" disabled={busy} onClick={() => install.mutate({ env: {} })}>
                {install.isPending ? c.inProgress : c.retry}
              </Button>
            </div>
          ) : (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner /> {t.installing}
            </p>
          ))}

        {req.status === "installed" && (
          <p className="text-sm text-muted-foreground">
            {req.tools?.length ? t.tools(req.tools.length, `${req.tools.slice(0, 6).join(", ")}${req.tools.length > 6 ? "…" : ""}`) : t.connected}
          </p>
        )}

        {(failure || (req.error && req.status !== "installed")) && (
          <p className="text-sm text-destructive">{failure instanceof Error ? failure.message : req.error}</p>
        )}
      </CardContent>

      {(decides || req.docsUrl) && (
        <BlockFooter>
          {req.docsUrl && (
            <Button size="sm" variant="ghost" className="mr-auto" nativeButton={false} render={<a href={req.docsUrl} target="_blank" rel="noreferrer" />}>
              {t.docs}
            </Button>
          )}
          {decides && (
            <>
              <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide.mutate(false)}>
                {t.reject}
              </Button>
              <Button size="sm" disabled={busy} onClick={() => decide.mutate(true)}>
                {decide.isPending && decide.variables ? c.inProgress : t.approve}
              </Button>
            </>
          )}
        </BlockFooter>
      )}
    </BlockCard>
  );
}
