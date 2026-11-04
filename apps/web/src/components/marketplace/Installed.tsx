import { confirmAction } from "@/lib/confirm";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackageIcon, PuzzleIcon, TrashIcon } from "@/components/icons";
import { Loading, useRestartNeeded } from "@/components/admin/ui";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemDescription, ItemFooter, ItemTitle } from "@/components/ui/item";
import { MarketSection, Tiles } from "./layout";
import { Switch } from "@/components/ui/switch";
import { SkillCreateDialog } from "@/components/SkillCreateDialog";
import { api, type McpRequest, type SkillRequest } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";
import { common, connectors } from "@agora/core/i18n";
import { mcpServersQuery, pluginsQuery, useSkillOwners } from "./data";
import { InitialTile, IntegrationTile, IntegrationTypeMenu } from "./IntegrationType";
import { ReconfigureDialog } from "./ReconfigureDialog";
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
    unavailable: "Unreachable for now.",
    remove: (name: string) => `Remove ${name}`,
    removeConfirm: (name: string) => `Remove the “${name}” connector?`,
    removeBody: "Bots will lose access to its tools. Its secrets stay in Hermes's .env.",
    removeAction: "Remove",
    plugins: "Active plugins",
    noPlugins: "No plugins enabled.",
    skills: "Skills",
    noSkills: "No skills added from the marketplace.",
    skillsHint: "Skills are installed per agent: enable or remove them in Administration › Agents › Skills.",
    approved: "Request approved.",
    rejected: "Request declined.",
    removed: (name: string) => `“${name}” removed.`,
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
    unavailable: "Injoignable pour l'instant.",
    remove: (name: string) => `Retirer ${name}`,
    removeConfirm: (name: string) => `Retirer le connecteur « ${name} » ?`,
    removeBody: "Les bots perdront l'accès à ses outils. Ses secrets restent dans le .env de Hermes.",
    removeAction: "Retirer",
    plugins: "Plugins actifs",
    noPlugins: "Aucun plugin activé.",
    skills: "Skills",
    noSkills: "Aucun skill ajouté depuis le marketplace.",
    skillsHint: "Les skills s'installent par agent : active-les ou retire-les dans Administration › Agents › Skills.",
    approved: "Demande validée.",
    rejected: "Demande refusée.",
    removed: (name: string) => `« ${name} » retiré.`,
  },
});

export function Installed() {
  const t = useT(messages);
  const c = useT(common);
  const k = useT(connectors);
  const qc = useQueryClient();
  const flagRestart = useRestartNeeded();
  const servers = useQuery(mcpServersQuery);
  const plugins = useQuery(pluginsQuery);
  const skills = useSkillOwners();
  const requests = useQuery({ queryKey: ["mcp-requests"], queryFn: () => api<McpRequest[]>("/mcp-requests") });
  const pending = (requests.data ?? []).filter((r) => r.status === "pending");
  const skillRequests = useQuery({ queryKey: ["skill-requests"], queryFn: () => api<SkillRequest[]>("/skill-requests") });
  const pendingSkills = (skillRequests.data ?? []).filter((r) => r.status === "pending");
  const [reviewing, setReviewing] = useState<SkillRequest | null>(null);
  const [reconfiguring, setReconfiguring] = useState<McpRequest | null>(null);
  const reconfigure = useMutation({
    mutationFn: (name: string) => api<McpRequest>(`/mcp-requests/reconfigure/${encodeURIComponent(name)}`, { method: "POST" }),
    onSuccess: setReconfiguring,
  });
  const decideSkill = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api(`/skill-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["skill-requests"] });
      qc.invalidateQueries({ queryKey: ["skill-request"] });
    },
    meta: { success: (_: unknown, { approve }: { approve: boolean }) => (approve ? t.approved : t.rejected) },
  });
  const decide = useMutation({
    mutationFn: ({ id, approve }: { id: string; approve: boolean }) => api(`/mcp-requests/${id}/${approve ? "approve" : "reject"}`, { method: "POST" }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["mcp-requests"] });
      qc.invalidateQueries({ queryKey: ["mcp-request"] });
      qc.invalidateQueries({ queryKey: ["hermes"] });
    },
    meta: { success: (_: unknown, { approve }: { approve: boolean }) => (approve ? t.approved : t.rejected) },
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
    meta: { success: (_: unknown, name: string) => t.removed(name) },
  });
  const setType = useMutation({
    mutationFn: ({ name, type }: { name: string; type: IntegrationType }) =>
      api(`/admin/hermes/mcp/servers/${name}/type`, { method: "PUT", body: JSON.stringify({ type }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["hermes", "mcp"] }),
    meta: { success: c.saved },
  });
  const togglePlugin = useMutation({
    mutationFn: ({ name, enable }: { name: string; enable: boolean }) =>
      api(`/admin/hermes/plugins/${encodeURIComponent(name)}/${enable ? "enable" : "disable"}`, { method: "POST" }),
    onSuccess: changed,
  });

  const enabledPlugins = (plugins.data ?? []).filter((p) => /^enabled/i.test(p.status));

  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-base font-medium">{t.title}</h1>

      {pendingSkills.length > 0 && (
        <MarketSection title={t.skillRequests}>
          <Tiles>
            {pendingSkills.map((r) => (
              <Item variant="outline" className="items-start" key={r.id} role="listitem">
                <InitialTile icon={<PackageIcon />} />
                <ItemContent className="min-w-0">
                  <ItemTitle>{r.name}</ItemTitle>
                  {(r.kind === "create" ? r.description : r.reason) && <ItemDescription>{r.kind === "create" ? r.description : r.reason}</ItemDescription>}
                  {r.kind !== "create" && (
                    <ItemDescription>
                      <code>{r.identifier}</code>
                    </ItemDescription>
                  )}
                  {r.error && <p className="truncate text-xs text-destructive">{r.error}</p>}
                </ItemContent>
                <ItemFooter className="justify-end">
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
                </ItemFooter>
              </Item>
            ))}
          </Tiles>
          <SkillCreateDialog request={reviewing} onClose={() => setReviewing(null)} />
        </MarketSection>
      )}

      {pending.length > 0 && (
        <MarketSection title={t.mcpRequests}>
          <Tiles>
            {pending.map((r) => (
              <Item variant="outline" className="items-start" key={r.id} role="listitem">
                <IntegrationTile type={r.type} server={r.name} />
                <ItemContent className="min-w-0">
                  <ItemTitle>{r.title}</ItemTitle>
                  {r.description && <ItemDescription>{r.description}</ItemDescription>}
                  <ItemDescription>
                    <code>{r.url ?? r.command}</code>
                  </ItemDescription>
                  {r.transport === "stdio" && <p className="text-xs text-warning">{t.stdioWarning}</p>}
                </ItemContent>
                <ItemFooter className="justify-end">
                  <Button variant="ghost" size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: false })}>
                    {t.reject}
                  </Button>
                  <Button size="sm" disabled={decide.isPending} onClick={() => decide.mutate({ id: r.id, approve: true })}>
                    {t.approve}
                  </Button>
                </ItemFooter>
              </Item>
            ))}
          </Tiles>
        </MarketSection>
      )}

      <MarketSection title={t.mcpServers}>
        {servers.isError && <p className="text-sm text-muted-foreground">{t.unavailable}</p>}
        {servers.isPending && (
          <Loading />
        )}
        {servers.data?.servers.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.noServers}</p>
        )}
        {!!servers.data?.servers.length && (
          <Tiles>
            {servers.data.servers.map((s) => (
              <Item variant="outline" className="items-start" key={s.name} role="listitem">
                <IntegrationTile type={s.type} server={s.name} />
                <ItemContent className="min-w-0">
                  <ItemTitle title={s.url ?? s.command}>{s.name}</ItemTitle>
                </ItemContent>
                <ItemFooter className="justify-end">
                  <IntegrationTypeMenu value={s.type} disabled={setType.isPending} onValueChange={(type) => setType.mutate({ name: s.name, type })} />
                  {s.source !== "plugin" && (
                    <Button variant="ghost" size="sm" disabled={reconfigure.isPending} onClick={() => reconfigure.mutate(s.name)}>
                      {k.reconfigure}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t.remove(s.name)}
                    onClick={async () =>
                      (await confirmAction({ title: t.removeConfirm(s.name), description: t.removeBody, action: t.removeAction })) && removeMcp.mutate(s.name)
                    }
                  >
                    <TrashIcon />
                  </Button>
                  <Switch aria-label={s.name} checked={s.enabled !== false} onCheckedChange={(enabled) => toggleMcp.mutate({ name: s.name, enabled })} />
                </ItemFooter>
              </Item>
            ))}
          </Tiles>
        )}
      </MarketSection>

      <ReconfigureDialog request={reconfiguring} onClose={() => setReconfiguring(null)} />

      <MarketSection title={t.plugins}>
        {plugins.isError && <p className="text-sm text-muted-foreground">{t.unavailable}</p>}
        {plugins.isPending && (
          <Loading />
        )}
        {plugins.data && enabledPlugins.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.noPlugins}</p>
        )}
        {enabledPlugins.length > 0 && (
          <Tiles>
            {enabledPlugins.map((p) => (
              <Item variant="outline" className="items-start" key={p.name} role="listitem">
                <InitialTile icon={<PuzzleIcon />} />
                <ItemContent className="min-w-0">
                  <ItemTitle>{p.name}</ItemTitle>
                  <ItemDescription>{p.description}</ItemDescription>
                </ItemContent>
                <ItemFooter className="justify-end">
                  <Switch aria-label={p.name} checked onCheckedChange={(enable) => togglePlugin.mutate({ name: p.name, enable })} />
                </ItemFooter>
              </Item>
            ))}
          </Tiles>
        )}
      </MarketSection>

      <MarketSection title={t.skills} description={t.skillsHint}>
        {skills.pending && (
          <Loading />
        )}
        {!skills.pending && skills.installed.length === 0 && (
          <p className="text-sm text-muted-foreground">{t.noSkills}</p>
        )}
        {skills.installed.length > 0 && (
          <Tiles>
            {skills.installed.map((s) => (
              <Item variant="outline" className="items-start" key={s.name} role="listitem">
                <InitialTile icon={<PackageIcon />} />
                <ItemContent className="min-w-0">
                  <ItemTitle>{s.name}</ItemTitle>
                  <ItemDescription>{s.description}</ItemDescription>
                </ItemContent>
                <ItemFooter className="justify-end">
                  <span className="truncate text-sm text-muted-foreground">{s.agents.map((a) => a.name).join(", ")}</span>
                </ItemFooter>
              </Item>
            ))}
          </Tiles>
        )}
      </MarketSection>
    </div>
  );
}
