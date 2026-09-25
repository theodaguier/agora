import { RequiredMark } from "@/components/FormLabel";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckIcon, ExternalLinkIcon } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { ConnectorField } from "@/components/ConnectorField";
import { Spinner } from "@/components/ui/spinner";
import { api, type McpRequest } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { IntegrationTile } from "@/components/marketplace/IntegrationType";
import { useMcpOAuth } from "@/components/marketplace/use-mcp-oauth";
import { OAuthClientFields } from "@/components/marketplace/OAuthClientFields";
import { needsOwnClient, oauthClientOf } from "@/lib/oauth-client";
import { useState, type FormEvent } from "react";
import { integrations } from "@agora/core/i18n";
import type { StatusTone } from "@agora/core";
import { toneBadge } from "@/components/views/tone";
import { cn } from "@/lib/utils";
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
      <div className="flex w-full max-w-[min(680px,88%)] items-center gap-2 rounded-2xl bg-secondary p-3.5 text-sm text-muted-foreground">
        <Spinner /> {t.loading}
      </div>
    );
  }

  const busy = decide.isPending || install.isPending || authorize.isPending;
  const needsForm = req.env.length > 0 || req.auth === "header";
  const failure = decide.error ?? install.error ?? authorize.error;

  return (
    <div className="w-full max-w-[min(680px,88%)] rounded-2xl bg-secondary p-3.5">
      <div className="flex items-start gap-3">
        <IntegrationTile type={req.type} server={req.name} className="size-9 [&_svg]:size-4" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-[15px] font-medium leading-snug">{t.connector(req.title)}</p>
            <Badge variant="secondary" className="bg-accent font-normal text-muted-foreground">
              {i.types[req.type]}
            </Badge>
            <Badge variant="secondary" className={cn("font-normal", toneBadge[STATUS_TONE[req.status]])}>
              {req.status === "installed" && <CheckIcon data-icon="inline-start" />}
              {t.status[req.status]}
            </Badge>
          </div>
          {req.description && <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground">{req.description}</p>}
          <p className="mt-1.5 break-all font-mono text-xs text-muted-foreground">{req.url ?? req.command}</p>
          {req.docsUrl && (
            <a href={req.docsUrl} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              {t.docs} <ExternalLinkIcon className="size-3" />
            </a>
          )}
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-3 pl-12">
        {req.status === "pending" &&
          (req.canDecide ? (
            <>
              {req.transport === "stdio" && (
                <p className="text-sm text-warning">{t.stdioWarning}</p>
              )}
              <div className="flex gap-2">
                <Button size="sm" disabled={busy} onClick={() => decide.mutate(true)}>
                  {decide.isPending && decide.variables ? c.inProgress : t.approve}
                </Button>
                <Button size="sm" variant="ghost" disabled={busy} onClick={() => decide.mutate(false)}>
                  {t.reject}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t.adminMust}</p>
          ))}

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
                      className="bg-background font-mono"
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
      </div>
    </div>
  );
}
