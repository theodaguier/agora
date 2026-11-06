import { confirmAction } from "@/lib/confirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IntegrationIcon, TrashIcon } from "@/components/icons";
import { useState, type ReactNode } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { guessIntegrationType, type IntegrationType } from "@agora/core";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type AdminAgent, type ModelOptions, type Skill, type Toolset } from "@/lib/api";
import { AgentProfile } from "./AgentProfile";
import { AgentMemory, AgentSoul } from "./AgentSoul";
import { AgentWebhooks } from "./AgentWebhooks";
import { toast } from "sonner";
import { common } from "@agora/core/i18n";
import { defineMessages, useT } from "@/i18n";
import { agentSkillsQuery } from "@/lib/queries";
import { LoadError, Loading, useAction } from "./ui";

// Tab ids (not displayed: labels come from `messages.tabs`).
const tabs = ["Profil", "Personnalité", "Modèle", "Outils", "Skills", "Déclencheurs", "Mémoire"] as const;
export type Tab = (typeof tabs)[number];

const messages = defineMessages<{
  tabs: Record<Tab, string>;
  agents: string;
  modelIntro: string;
  modelList: string;
  defaultModel: string;
  reasoning: string;
  toolsIntro: string;
  needsConfig: string;
  riskyNote: string;
  riskyTitle: (tool: string) => string;
  riskyBody: string;
  riskyAction: string;
  mcpTitle: string;
  mcpDefault: string;
  mcpIntro: string;
  mcpEmpty: string;
  mcpInstanceOff: string;
  modelsEmpty: string;
  toolsEmpty: string;
  skillsEmpty: string;
  skillsNoMatch: string;
  uninstalling: string;
  skillsTitle: string;
  skillsHint: string;
  filterSkills: string;
  filter: string;
  uninstall: (name: string) => string;
  uninstallTitle: (name: string) => string;
  uninstallBody: string;
  uninstallAction: string;
  uninstalled: (name: string) => string;
  uninstallFailed: (name: string) => string;
}>({
  en: {
    tabs: { Profil: "Profile", Personnalité: "Personality", Modèle: "Model", Outils: "Tools", Skills: "Skills", Déclencheurs: "Triggers", Mémoire: "Memory" },
    agents: "Agents",
    modelIntro: "Default model for conversations with this agent. Each employee can pick another one for their thread.",
    modelList: "List provided by Hermes for the provider",
    defaultModel: "Default model",
    reasoning: "reasoning",
    toolsIntro: "Tools the agent can use in the app. Applied from the next message.",
    needsConfig: "Needs configuring in Hermes.",
    riskyNote: "Gives access to the server.",
    riskyTitle: (tool) => `Turn on "${tool}" for this agent?`,
    riskyBody:
      "This tool gives the agent, and anyone who writes to it, direct access to the server: commands, files, the other agents' keys. Text planted in a web page or an attached file is enough to hijack it. Only turn it on for an agent reserved for people you trust.",
    riskyAction: "Turn on anyway",
    mcpTitle: "MCP servers",
    mcpDefault: "The default profile uses all of the instance's active MCP servers (MCP tab).",
    mcpIntro: "The instance's MCP servers this agent can use. Applied from the next message.",
    mcpEmpty: "No MCP servers installed (MCP tab).",
    mcpInstanceOff: "Turned off for the whole instance.",
    modelsEmpty: "Hermes lists no models for this provider yet.",
    toolsEmpty: "No tools available for this agent.",
    skillsEmpty: "No skills yet. Add some from the Marketplace.",
    skillsNoMatch: "No skills match this filter.",
    uninstalling: "Uninstalling in Hermes…",
    skillsTitle: "Agent skills",
    skillsHint: "Add more from the Marketplace.",
    filterSkills: "Filter skills",
    filter: "Filter",
    uninstall: (name) => `Uninstall ${name}`,
    uninstallTitle: (name) => `Uninstall the "${name}" skill?`,
    uninstallBody: "The bot will no longer be able to use it. You can install it again from the marketplace.",
    uninstallAction: "Uninstall",
    uninstalled: (name) => `"${name}" uninstalled.`,
    uninstallFailed: (name) => `Couldn't uninstall "${name}".`,
  },
  fr: {
    tabs: { Profil: "Profil", Personnalité: "Personnalité", Modèle: "Modèle", Outils: "Outils", Skills: "Skills", Déclencheurs: "Déclencheurs", Mémoire: "Mémoire" },
    agents: "Agents",
    modelIntro: "Modèle utilisé par défaut dans les conversations avec cet agent. Chaque salarié peut en choisir un autre pour son fil.",
    modelList: "Liste fournie par Hermes pour le fournisseur",
    defaultModel: "Modèle par défaut",
    reasoning: "raisonnement",
    toolsIntro: "Outils que l'agent peut utiliser dans l'app. Pris en compte dès le message suivant.",
    needsConfig: "Configuration requise côté Hermes.",
    riskyNote: "Donne accès au serveur.",
    riskyTitle: (tool) => `Activer « ${tool} » pour cet agent ?`,
    riskyBody:
      "Cet outil donne à l'agent, et à toute personne qui lui écrit, un accès direct au serveur : commandes, fichiers, clés des autres agents. Un texte piégé dans une page web ou un fichier joint suffit à le détourner. À n'activer que pour un agent réservé à des personnes de confiance.",
    riskyAction: "Activer quand même",
    mcpTitle: "Serveurs MCP",
    mcpDefault: "Le profil par défaut utilise tous les serveurs MCP actifs de l'instance (onglet MCP).",
    mcpIntro: "Serveurs MCP de l'instance que cet agent peut utiliser. Pris en compte dès le message suivant.",
    mcpEmpty: "Aucun serveur MCP installé (onglet MCP).",
    mcpInstanceOff: "Coupé pour toute l'instance.",
    modelsEmpty: "Hermes ne liste encore aucun modèle pour ce fournisseur.",
    toolsEmpty: "Aucun outil disponible pour cet agent.",
    skillsEmpty: "Aucune skill pour l'instant. Ajoute-en depuis le Marketplace.",
    skillsNoMatch: "Aucune skill ne correspond à ce filtre.",
    uninstalling: "Désinstallation en cours dans Hermes…",
    skillsTitle: "Skills de l'agent",
    skillsHint: "Ajoute-en depuis le Marketplace.",
    filterSkills: "Filtrer les skills",
    filter: "Filtrer",
    uninstall: (name) => `Désinstaller ${name}`,
    uninstallTitle: (name) => `Désinstaller la compétence « ${name} » ?`,
    uninstallBody: "Le bot ne pourra plus s'en servir. Tu pourras la réinstaller depuis la marketplace.",
    uninstallAction: "Désinstaller",
    uninstalled: (name) => `« ${name} » désinstallée.`,
    uninstallFailed: (name) => `Impossible de désinstaller « ${name} ».`,
  },
});

export function AgentDetail({ agent, onBack }: { agent: AdminAgent; onBack: () => void }) {
  const t = useT(messages);
  return (
    <>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink render={<button type="button" onClick={onBack} />}>{t.agents}</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{agent.name}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <div className="flex items-center gap-3">
        <AgentAvatar agent={{ avatar: { shape: agent.avatarShape, color: agent.avatarColor } }} className="size-10" />
        <h2 className="text-base font-medium">{agent.name}</h2>
      </div>
      <AgentEditor agent={agent} />
    </>
  );
}

/** All of an agent's settings, in tabs: in Paramètres › Agents and in the thread panel. */
export function AgentEditor({ agent, initialTab = "Personnalité" }: { agent: AdminAgent; initialTab?: Tab }) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const t = useT(messages);
  return (
    <>
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-4">
        <TabsList>
          {tabs.map((id) => (
            <TabsTrigger key={id} value={id}>
              {t.tabs[id]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="Profil">
          <AgentProfile key={agent.id} agent={agent} />
        </TabsContent>
        <TabsContent value="Personnalité">
          <AgentSoul agentId={agent.id} agentName={agent.name} />
        </TabsContent>
        <TabsContent value="Modèle">
          <ModelSection agentId={agent.id} />
        </TabsContent>
        <TabsContent value="Outils" className="flex flex-col gap-4">
          <McpSection agentId={agent.id} isDefault={agent.hermesProfile === "default"} />
          <ToolsSection agentId={agent.id} />
        </TabsContent>
        <TabsContent value="Skills">
          <SkillsSection agentId={agent.id} />
        </TabsContent>
        <TabsContent value="Déclencheurs">
          <AgentWebhooks agentId={agent.id} />
        </TabsContent>
        <TabsContent value="Mémoire">
          <AgentMemory agentId={agent.id} />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ModelSection({ agentId }: { agentId: string }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const key = ["hermes", "model", agentId];
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => api<ModelOptions>(`/admin/hermes/agents/${agentId}/model`) });
  const save = useMutation({
    mutationFn: (model: string) => api(`/admin/hermes/agents/${agentId}/model`, { method: "PUT", body: JSON.stringify({ model }) }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["models"] });
    },
    meta: { success: c.saved },
  });
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.defaultModel}</CardTitle>
        <CardDescription>
          {t.modelIntro}
          {data && ` ${t.modelList} ${data.provider}.`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isPending ? (
          <Loading />
        ) : !data ? (
          <LoadError error={error} />
        ) : data.models.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t.modelsEmpty}</p>
        ) : (
          <RadioGroup aria-label={t.defaultModel} value={data.defaultModel} onValueChange={(v) => save.mutate(v as string)} disabled={save.isPending}>
            {data.models.map((m) => (
              <Field key={m.id} orientation="horizontal">
                <RadioGroupItem value={m.id} id={`model-${agentId}-${m.id}`} />
                <FieldContent>
                  <FieldLabel htmlFor={`model-${agentId}-${m.id}`}>{m.id}</FieldLabel>
                  {m.reasoning && <FieldDescription>{t.reasoning}</FieldDescription>}
                </FieldContent>
              </Field>
            ))}
          </RadioGroup>
        )}
      </CardContent>
    </Card>
  );
}

function ToolsSection({ agentId }: { agentId: string }) {
  const m = useT(messages);
  const qc = useQueryClient();
  const key = ["hermes", "toolsets", agentId];
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => api<Toolset[]>(`/admin/hermes/agents/${agentId}/toolsets`) });
  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api(`/admin/hermes/agents/${agentId}/toolsets/${name}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onMutate: ({ name, enabled }) => qc.setQueryData<Toolset[]>(key, (xs) => xs?.map((t) => (t.name === name ? { ...t, enabled } : t))),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  return (
    <ListCard>
      <ListCardHeader>
        <CardTitle>{m.tabs.Outils}</CardTitle>
        <CardDescription>{m.toolsIntro}</CardDescription>
      </ListCardHeader>
      {isPending || !data?.length ? (
        <CardContent className="py-(--card-spacing)">
          {isPending ? <Loading /> : !data ? <LoadError error={error} /> : <p className="text-sm text-muted-foreground">{m.toolsEmpty}</p>}
        </CardContent>
      ) : (
        <ListCardRows>
          {data.map((t) => (
            <SettingRow
              key={t.name}
              title={withoutEmoji(t.label)}
              description={[t.description, !t.configured && m.needsConfig, t.risky && m.riskyNote].filter(Boolean).join(" ")}
            >
              <Switch
                aria-label={withoutEmoji(t.label)}
                checked={t.enabled}
                onCheckedChange={async (enabled) => {
                  if (enabled && t.risky && !(await confirmAction({ title: m.riskyTitle(withoutEmoji(t.label)), description: m.riskyBody, action: m.riskyAction }))) return;
                  toggle.mutate({ name: t.name, enabled });
                }}
              />
            </SettingRow>
          ))}
        </ListCardRows>
      )}
    </ListCard>
  );
}

type AgentMcp = { name: string; url?: string; command?: string; instanceEnabled: boolean; enabled: boolean };

function McpSection({ agentId, isDefault }: { agentId: string; isDefault: boolean }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const key = ["hermes", "agent-mcp", agentId];
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => api<AgentMcp[]>(`/admin/hermes/agents/${agentId}/mcp`) });
  const { data: types } = useQuery({ queryKey: ["hermes", "mcp", "types"], queryFn: () => api<Record<string, IntegrationType>>("/admin/hermes/mcp/types") });
  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api(`/admin/hermes/agents/${agentId}/mcp/${name}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onMutate: ({ name, enabled }) => qc.setQueryData<AgentMcp[]>(key, (xs) => xs?.map((m) => (m.name === name ? { ...m, enabled } : m))),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  return (
    <ListCard>
      <ListCardHeader>
        <CardTitle>{t.mcpTitle}</CardTitle>
        <CardDescription>{isDefault ? t.mcpDefault : t.mcpIntro}</CardDescription>
      </ListCardHeader>
      {isPending || !data?.length ? (
        <CardContent className="py-(--card-spacing)">
          {isPending ? <Loading /> : !data ? <LoadError error={error} /> : <p className="text-sm text-muted-foreground">{t.mcpEmpty}</p>}
        </CardContent>
      ) : (
        <ListCardRows>
          {data.map((m) => (
            // The server's address stays out of the text: it shows on hover.
            <SettingRow
              key={m.name}
              title={m.name}
              hint={m.url ?? m.command}
              media={<IntegrationIcon type={types?.[m.name] ?? guessIntegrationType(m.name)} className="size-5" />}
              description={m.instanceEnabled ? undefined : t.mcpInstanceOff}
            >
              <Switch
                aria-label={m.name}
                checked={m.enabled}
                disabled={isDefault || !m.instanceEnabled}
                onCheckedChange={(enabled) => toggle.mutate({ name: m.name, enabled })}
              />
            </SettingRow>
          ))}
        </ListCardRows>
      )}
    </ListCard>
  );
}

function SkillsSection({ agentId }: { agentId: string }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const query = agentSkillsQuery(agentId);
  const key = query.queryKey;
  const [filter, setFilter] = useState("");
  /** Hermes uninstalling a skill in the background: its action id and the skill, said by a toast until it's done. */
  const [action, setAction] = useState<{ id: string; skill: string } | null>(null);
  const { data: skills, isPending, error } = useQuery(query);
  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api(`/admin/hermes/agents/${agentId}/skills/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onMutate: ({ name, enabled }) => qc.setQueryData<Skill[]>(key, (xs) => xs?.map((s) => (s.name === name ? { ...s, enabled } : s))),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["commands"] });
    },
  });
  const remove = useMutation({
    mutationFn: (name: string) => api<{ name?: string }>(`/admin/hermes/agents/${agentId}/skills/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: (r, skill) => {
      if (!r?.name) return void qc.invalidateQueries({ queryKey: key });
      setAction({ id: r.name, skill });
      toast.loading(t.uninstalling, { id: r.name });
    },
    meta: { success: (r: { name?: string } | undefined, skill: string) => (r?.name ? undefined : t.uninstalled(skill)) },
  });
  useAction(action?.id ?? null, (ok) => {
    if (action) toast[ok ? "success" : "error"](ok ? t.uninstalled(action.skill) : t.uninstallFailed(action.skill), { id: action.id });
    setAction(null);
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ["commands"] });
  });

  const list = (skills ?? []).filter((s) => `${s.name} ${s.description} ${s.category ?? ""}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <ListCard>
      <ListCardHeader>
        <CardTitle>
          {t.skillsTitle}
          {skills && ` (${skills.length})`}
        </CardTitle>
        <CardDescription>{t.skillsHint}</CardDescription>
      </ListCardHeader>
      <CardContent className="flex flex-col gap-3 py-(--card-spacing)">
        <Input aria-label={t.filterSkills} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.filter} />
        {isPending ? (
          <Loading />
        ) : !skills ? (
          <LoadError error={error} />
        ) : (
          list.length === 0 && <p className="text-sm text-muted-foreground">{skills.length ? t.skillsNoMatch : t.skillsEmpty}</p>
        )}
      </CardContent>
      {list.length > 0 && (
        <ListCardRows>
          {list.map((s) => (
            <SettingRow
              key={s.name}
              title={
                <>
                  {s.name}
                  {s.category && <span className="text-muted-foreground">{s.category}</span>}
                </>
              }
              description={s.description}
            >
              {s.provenance && s.provenance !== "bundled" && (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={t.uninstall(s.name)}
                  title={t.uninstall(s.name)}
                  disabled={!!action}
                  onClick={async () =>
                    (await confirmAction({ title: t.uninstallTitle(s.name), description: t.uninstallBody, action: t.uninstallAction })) && remove.mutate(s.name)
                  }
                >
                  <TrashIcon />
                </Button>
              )}
              <Switch aria-label={s.name} checked={s.enabled} onCheckedChange={(enabled) => toggle.mutate({ name: s.name, enabled })} />
            </SettingRow>
          ))}
        </ListCardRows>
      )}
    </ListCard>
  );
}

/** Hermes prefixes toolset labels with an emoji ("🔍 Web Search"): the list stays text-only. */
const withoutEmoji = (label: string) => label.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "");

/** A row of a settings list: a tool, a server or a skill, with its controls on the right. */
function SettingRow(props: { title: ReactNode; description?: ReactNode; hint?: string; media?: ReactNode; children: ReactNode }) {
  return (
    <Item size="xs" role="listitem" title={props.hint} className="flex-nowrap">
      {props.media && <ItemMedia>{props.media}</ItemMedia>}
      <ItemContent className="min-w-0">
        <ItemTitle>{props.title}</ItemTitle>
        {props.description && <ItemDescription className="truncate">{props.description}</ItemDescription>}
      </ItemContent>
      <ItemActions>{props.children}</ItemActions>
    </Item>
  );
}
