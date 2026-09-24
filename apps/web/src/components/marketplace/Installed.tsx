import { confirmAction } from "@/lib/confirm";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TrashIcon } from "@/components/icons";
import { ErrorText, Loading, useRestartNeeded } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { SkillCreateDialog } from "@/components/SkillCreateDialog";
import { api, type McpRequest, type SkillRequest } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { mcpServersQuery, pluginsQuery } from "./data";
import { IntegrationTile, IntegrationTypeMenu } from "./IntegrationType";
import type { IntegrationType } from "@agora/core";

const messages = defineMessages({
  en: {
    title: "Installed",
    skillRequests: "Skills requested by bots",
    mcpRequests: "Connectors requested by bots",
    reject: "Decline",
    approve: "Approve",
    review: "Review",
    stdioWarning: "Command runs on the Hermes machine.",
    mcpServers: "MCP connectors",
    noServers: "No connectors installed.",
    remove: (name: string) => `Remove ${name}`,
    removeConfirm: (name: string) => `Remove the “${name}” connector?`,
    removeBody: "Bots will lose access to its tools. Its secrets stay in Hermes's .env.",
    removeAction: "Remove",
    plugins: "Active plugins",
    noPlugins: "No plugins enabled.",
    skillsHint: "Skills are installed per agent: find them in Administration › Agents › Skills.",
  },
  fr: {
    title: "Installés",
    skillRequests: "Skills demandés par les bots",
    mcpRequests: "Connecteurs demandés par les bots",
    reject: "Refuser",
    approve: "Valider",
    review: "Relire",
    stdioWarning: "Commande exécutée sur la machine Hermes.",
    mcpServers: "Connecteurs MCP",
    noServers: "Aucun connecteur installé.",
    remove: (name: string) => `Retirer ${name}`,
    removeConfirm: (name: string) => `Retirer le connecteur « ${name} » ?`,
    removeBody: "Les bots perdront l'accès à ses outils. Ses secrets restent dans le .env de Hermes.",
    removeAction: "Retirer",
    plugins: "Plugins actifs",
    noPlugins: "Aucun plugin activé.",
    skillsHint: "Les skills s'installent par agent : retrouve-les dans Administration › Agents › Skills.",
  },
});

export function Installed() {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const flagRestart = useRestartNeeded();
  const servers = useQuery(mcpServersQuery);
  const plugins = useQuery(pluginsQuery);
  const requests = useQuery({ queryKey: ["mcp-requests"], queryFn: () => api<McpRequest[]>("/mcp-requests") });
  const pending = (requests.data ?? []).filter((r) => r.status === "pending");
  const skillRequests = useQuery({ queryKey: ["skill-requests"], queryFn: () => api<SkillRequest[]>("/skill-requests") });
  const pendingSkills = (skillRequests.data ?? []).filter((r) => r.status === "pending");
  const [reviewing, setReviewing] = useState<SkillRequest | null>(null);
  const decideSkill = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api(`/skill-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["skill-requests"] });
      qc.invalidateQueries({ queryKey: ["skill-request"] });
    },
  });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api(`/mcp-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["mcp-requests"] });
      qc.invalidateQueries({ queryKey: ["mcp-request"] });
      qc.invalidateQueries({ queryKey: ["hermes"] });
    },
  });
  const changed = () => {
    flagRestart();
    qc.invalidateQueries({ queryKey: ["hermes"] });
  };
  const toggleMcp = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api(`/admin/hermes/mcp/servers/${name}/enabled`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onSuccess: changed,
  });
  const removeMcp = useMutation({
    mutationFn: (name: string) => api(`/admin/hermes/mcp/servers/${name}`, { method: "DELETE" }),
    onSuccess: changed,
  });
  const setType = useMutation({
    mutationFn: ({ name, type }: { name: string; type: IntegrationType }) =>
      api(`/admin/hermes/mcp/servers/${name}/type`, { method: "PUT", body: JSON.stringify({ type }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hermes", "mcp"] }),
  });
  const togglePlugin = useMutation({
    mutationFn: ({ name, enable }: { name: string; enable: boolean }) =>
      api(`/admin/hermes/plugins/${encodeURIComponent(name)}/${enable ? "enable" : "disable"}`, { method: "POST" }),
    onSuccess: changed,
  });

  const enabledPlugins = (plugins.data ?? []).filter((p) => /^enabled/i.test(p.status));

  return (
    <>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">{t.title}</h1>
      <ErrorText error={toggleMcp.error ?? removeMcp.error ?? setType.error ?? togglePlugin.error ?? decide.error ?? decideSkill.error} />

      {pendingSkills.length > 0 && (
        <>
          <h2 className="mb-2 text-[15px] font-medium">{t.skillRequests}</h2>
          <div className="mb-8 flex flex-col">
            {pendingSkills.map((r) => (
              <div key={r.id} className="flex items-center gap-3.5 border-b border-border/50 py-3 last:border-0">
                <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent font-semibold">{r.name.charAt(0).toUpperCase()}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px]">{r.name}</div>
                  {(r.kind === "create" ? r.description : r.reason) && (
                    <div className="truncate text-sm text-muted-foreground">{r.kind === "create" ? r.description : r.reason}</div>
                  )}
                  {r.kind !== "create" && <div className="truncate font-mono text-xs text-muted-foreground">{r.identifier}</div>}
                  {r.error && <div className="truncate text-xs text-destructive">{r.error}</div>}
                </div>
                <Button variant="ghost" size="sm" disabled={decideSkill.isPending} onClick={() => decideSkill.mutate({ id: r.id, approve: false })}>
                  {t.reject}
                </Button>
                <Button
                  size="sm"
                  disabled={decideSkill.isPending}
                  onClick={() => (r.kind === "create" ? setReviewing(r) : decideSkill.mutate({ id: r.id, approve: true }))}
                >
                  {r.error ? c.retry : r.kind === "create" ? t.review : t.approve}
                </Button>
              </div>
            ))}
          </div>
          <SkillCreateDialog request={reviewing} onClose={() => setReviewing(null)} />
        </>
      )}

      {pending.length > 0 && (
        <>
          <h2 className="mb-2 text-[15px] font-medium">{t.mcpRequests}</h2>
          <div className="mb-8 flex flex-col">
            {pending.map((r) => (
              <div key={r.id} className="flex items-center gap-3.5 border-b border-border/50 py-3 last:border-0">
                <IntegrationTile type={r.type} server={r.name} />
                <div className="min-w-0 flex-1">
                  <div className="text-[15px]">{r.title}</div>
                  {r.description && <div className="truncate text-sm text-muted-foreground">{r.description}</div>}
                  <div className="truncate font-mono text-xs text-muted-foreground">{r.url ?? r.command}</div>
                  {r.transport === "stdio" && <div className="text-xs text-warning">{t.stdioWarning}</div>}
                </div>
                <Button variant="ghost" size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: false })}>
                  {t.reject}
                </Button>
                <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: true })}>
                  {t.approve}
                </Button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-2 text-[15px] font-medium">{t.mcpServers}</h2>
      {servers.isPending && <Loading />}
      {servers.data?.servers.length === 0 && <p className="mb-8 text-sm text-muted-foreground">{t.noServers}</p>}
      <div className="mb-8 flex flex-col">
        {servers.data?.servers.map((s) => (
          <div key={s.name} className="flex items-center gap-3.5 border-b border-border/50 py-3 last:border-0">
            <IntegrationTile type={s.type} server={s.name} />
            <div className="min-w-0 flex-1">
              <div className="text-[15px]">{s.name}</div>
              <div className="truncate font-mono text-xs text-muted-foreground">{s.url ?? s.command}</div>
            </div>
            <IntegrationTypeMenu value={s.type} disabled={setType.isPending} onValueChange={(type) => setType.mutate({ name: s.name, type })} />
            <Button
              variant="ghost"
              size="icon"
              aria-label={t.remove(s.name)}
              onClick={async () =>
                (await confirmAction({ title: t.removeConfirm(s.name), description: t.removeBody, action: t.removeAction })) && removeMcp.mutate(s.name)
              }
              className="hover:text-destructive"
            >
              <TrashIcon />
            </Button>
            <Switch
              aria-label={s.name}
              checked={s.enabled !== false}
              onCheckedChange={(enabled) => toggleMcp.mutate({ name: s.name, enabled })}
            />
          </div>
        ))}
      </div>

      <h2 className="mb-2 text-[15px] font-medium">{t.plugins}</h2>
      {plugins.isPending && <Loading />}
      {plugins.data && enabledPlugins.length === 0 && <p className="mb-8 text-sm text-muted-foreground">{t.noPlugins}</p>}
      <div className="mb-8 flex flex-col">
        {enabledPlugins.map((p) => (
          <div key={p.name} className="flex items-center gap-3.5 border-b border-border/50 py-3 last:border-0">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent font-semibold">{p.name.charAt(0).toUpperCase()}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px]">{p.name}</div>
              <div className="truncate text-sm text-muted-foreground">{p.description}</div>
            </div>
            <Switch aria-label={p.name} checked onCheckedChange={(enable) => togglePlugin.mutate({ name: p.name, enable })} />
          </div>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">{t.skillsHint}</p>
    </>
  );
}
