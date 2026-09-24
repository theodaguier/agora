import { confirmAction } from "@/lib/confirm";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IntegrationIcon, TrashIcon } from "@/components/icons";
import { useState, type ReactNode } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel, FieldLegend, FieldSeparator, FieldSet, FieldTitle } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { guessIntegrationType, type IntegrationType } from "@agora/core";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, type AdminAgent, type ModelOptions, type Skill, type Toolset } from "@/lib/api";
import { AgentProfile } from "./AgentProfile";
import { AgentMemory, AgentSoul } from "./AgentSoul";
import { defineMessages, useT } from "@/i18n";
import { ErrorText, Loading, useAction } from "./ui";

// Tab ids (not displayed: labels come from `messages.tabs`).
const tabs = ["Profil", "Personnalité", "Modèle", "Outils", "Skills", "Mémoire"] as const;
export type Tab = (typeof tabs)[number];

const messages = defineMessages<{
  tabs: Record<Tab, string>;
  agents: string;
  profile: (name: string) => string;
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
  uninstalling: string;
  skillsTitle: string;
  skillsHint: string;
  filterSkills: string;
  filter: string;
  uninstall: (name: string) => string;
  uninstallTitle: (name: string) => string;
  uninstallBody: string;
  uninstallAction: string;
}>({
  en: {
    tabs: { Profil: "Profile", Personnalité: "Personality", Modèle: "Model", Outils: "Tools", Skills: "Skills", Mémoire: "Memory" },
    agents: "Agents",
    profile: (name) => `Hermes profile: ${name}`,
    modelIntro: "Default model for conversations with this agent. Each employee can pick another one for their thread.",
    modelList: "List provided by Hermes for the provider",
    defaultModel: "Default model",
    reasoning: "reasoning",
    toolsIntro: "Tools the agent can use in the app. Applied from the next message.",
    needsConfig: " · needs configuring in Hermes",
    riskyNote: " · gives access to the server",
    riskyTitle: (tool) => `Turn on "${tool}" for this agent?`,
    riskyBody:
      "This tool gives the agent, and anyone who writes to it, direct access to the server: commands, files, the other agents' keys. Text planted in a web page or an attached file is enough to hijack it. Only turn it on for an agent reserved for people you trust.",
    riskyAction: "Turn on anyway",
    mcpTitle: "MCP servers",
    mcpDefault: "The default profile uses all of the instance's active MCP servers (MCP tab).",
    mcpIntro: "The instance's MCP servers this agent can use. Applied from the next message.",
    mcpEmpty: "No MCP servers installed (MCP tab).",
    mcpInstanceOff: " · turned off for the whole instance",
    uninstalling: "Uninstalling in Hermes…",
    skillsTitle: "Agent skills",
    skillsHint: "Add more from the Marketplace.",
    filterSkills: "Filter skills",
    filter: "Filter",
    uninstall: (name) => `Uninstall ${name}`,
    uninstallTitle: (name) => `Uninstall the "${name}" skill?`,
    uninstallBody: "The bot will no longer be able to use it. You can install it again from the marketplace.",
    uninstallAction: "Uninstall",
  },
  fr: {
    tabs: { Profil: "Profil", Personnalité: "Personnalité", Modèle: "Modèle", Outils: "Outils", Skills: "Skills", Mémoire: "Mémoire" },
    agents: "Agents",
    profile: (name) => `profil Hermes : ${name}`,
    modelIntro: "Modèle utilisé par défaut dans les conversations avec cet agent. Chaque salarié peut en choisir un autre pour son fil.",
    modelList: "Liste fournie par Hermes pour le fournisseur",
    defaultModel: "Modèle par défaut",
    reasoning: "raisonnement",
    toolsIntro: "Outils que l'agent peut utiliser dans l'app. Pris en compte dès le message suivant.",
    needsConfig: " · configuration requise côté Hermes",
    riskyNote: " · donne accès au serveur",
    riskyTitle: (tool) => `Activer « ${tool} » pour cet agent ?`,
    riskyBody:
      "Cet outil donne à l'agent, et à toute personne qui lui écrit, un accès direct au serveur : commandes, fichiers, clés des autres agents. Un texte piégé dans une page web ou un fichier joint suffit à le détourner. À n'activer que pour un agent réservé à des personnes de confiance.",
    riskyAction: "Activer quand même",
    mcpTitle: "Serveurs MCP",
    mcpDefault: "Le profil par défaut utilise tous les serveurs MCP actifs de l'instance (onglet MCP).",
    mcpIntro: "Serveurs MCP de l'instance que cet agent peut utiliser. Pris en compte dès le message suivant.",
    mcpEmpty: "Aucun serveur MCP installé (onglet MCP).",
    mcpInstanceOff: " · coupé pour toute l'instance",
    uninstalling: "Désinstallation en cours dans Hermes…",
    skillsTitle: "Skills de l'agent",
    skillsHint: "Ajoute-en depuis le Marketplace.",
    filterSkills: "Filtrer les skills",
    filter: "Filtrer",
    uninstall: (name) => `Désinstaller ${name}`,
    uninstallTitle: (name) => `Désinstaller la compétence « ${name} » ?`,
    uninstallBody: "Le bot ne pourra plus s'en servir. Tu pourras la réinstaller depuis la marketplace.",
    uninstallAction: "Désinstaller",
  },
});

export function AgentDetail({ agent, onBack }: { agent: AdminAgent; onBack: () => void }) {
  const t = useT(messages);
  return (
    <>
      <Breadcrumb className="mb-5">
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
      <div className="mb-5 flex items-center gap-3">
        <AgentAvatar agent={{ avatar: { shape: agent.avatarShape, color: agent.avatarColor } }} className="size-11" />
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{agent.name}</h2>
          <p className="text-sm text-muted-foreground">{t.profile(agent.hermesProfile)}</p>
        </div>
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
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="gap-5">
        <TabsList variant="line" className="w-full justify-start border-b">
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
        <TabsContent value="Outils">
          <FieldGroup>
            <McpSection agentId={agent.id} isDefault={agent.hermesProfile === "default"} />
            <FieldSeparator />
            <ToolsSection agentId={agent.id} />
          </FieldGroup>
        </TabsContent>
        <TabsContent value="Skills">
          <SkillsSection agentId={agent.id} />
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
  const qc = useQueryClient();
  const key = ["hermes", "model", agentId];
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => api<ModelOptions>(`/admin/hermes/agents/${agentId}/model`) });
  const save = useMutation({
    mutationFn: (model: string) => api(`/admin/hermes/agents/${agentId}/model`, { method: "PUT", body: JSON.stringify({ model }) }),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["models"] });
    },
  });
  if (isPending) return <Loading />;
  if (!data) return <ErrorText error={error} />;

  return (
    <FieldSet>
      <FieldLegend variant="label">{t.defaultModel}</FieldLegend>
      <FieldDescription>
        {t.modelIntro} {t.modelList} {data.provider}.
      </FieldDescription>
      <RadioGroup aria-label={t.defaultModel} value={data.defaultModel} onValueChange={(v) => save.mutate(v as string)} disabled={save.isPending}>
        {data.models.map((m) => (
          <FieldLabel key={m.id} htmlFor={`model-${agentId}-${m.id}`}>
            <Field orientation="horizontal">
              <FieldContent>
                <FieldTitle>{m.id}</FieldTitle>
                {m.reasoning && <FieldDescription>{t.reasoning}</FieldDescription>}
              </FieldContent>
              <RadioGroupItem value={m.id} id={`model-${agentId}-${m.id}`} />
            </Field>
          </FieldLabel>
        ))}
      </RadioGroup>
      <ErrorText error={save.error} />
    </FieldSet>
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
  if (isPending) return <Loading />;
  if (!data) return <ErrorText error={error} />;

  return (
    <FieldSet>
      <FieldLegend>{m.tabs.Outils}</FieldLegend>
      <FieldDescription>{m.toolsIntro}</FieldDescription>
      <ErrorText error={toggle.error} />
      <SettingList>
        {data.map((t) => (
          <SettingRow
            key={t.name}
            title={withoutEmoji(t.label)}
            description={
              <>
                {t.description}
                {!t.configured && m.needsConfig}
                {t.risky && m.riskyNote}
              </>
            }
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
      </SettingList>
    </FieldSet>
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
  if (isPending) return <Loading />;
  if (!data) return <ErrorText error={error} />;

  return (
    <FieldSet>
      <FieldLegend>{t.mcpTitle}</FieldLegend>
      <FieldDescription>{isDefault ? t.mcpDefault : t.mcpIntro}</FieldDescription>
      <ErrorText error={toggle.error} />
      {data.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyDescription>{t.mcpEmpty}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <SettingList>
          {data.map((m) => (
            <SettingRow
              key={m.name}
              title={m.name}
              media={<IntegrationIcon type={types?.[m.name] ?? guessIntegrationType(m.name)} />}
              description={
                <>
                  {m.url ?? m.command}
                  {!m.instanceEnabled && t.mcpInstanceOff}
                </>
              }
            >
              <Switch
                aria-label={m.name}
                checked={m.enabled}
                disabled={isDefault || !m.instanceEnabled}
                onCheckedChange={(enabled) => toggle.mutate({ name: m.name, enabled })}
              />
            </SettingRow>
          ))}
        </SettingList>
      )}
    </FieldSet>
  );
}

function SkillsSection({ agentId }: { agentId: string }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const key = ["hermes", "skills", agentId];
  const [filter, setFilter] = useState("");
  const [action, setAction] = useState<string | null>(null);
  const { data: skills, isPending, error } = useQuery({ queryKey: key, queryFn: () => api<Skill[]>(`/admin/hermes/agents/${agentId}/skills`) });
  const toggle = useMutation({
    mutationFn: ({ name, enabled }: { name: string; enabled: boolean }) =>
      api(`/admin/hermes/agents/${agentId}/skills/${encodeURIComponent(name)}`, { method: "PUT", body: JSON.stringify({ enabled }) }),
    onMutate: ({ name, enabled }) => qc.setQueryData<Skill[]>(key, (xs) => xs?.map((s) => (s.name === name ? { ...s, enabled } : s))),
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
  const remove = useMutation({
    mutationFn: (name: string) => api<{ name?: string }>(`/admin/hermes/agents/${agentId}/skills/${encodeURIComponent(name)}`, { method: "DELETE" }),
    onSuccess: (r) => (r?.name ? setAction(r.name) : qc.invalidateQueries({ queryKey: key })),
  });
  useAction(action, () => {
    setAction(null);
    qc.invalidateQueries({ queryKey: key });
  });

  const list = (skills ?? []).filter((s) => `${s.name} ${s.description} ${s.category ?? ""}`.toLowerCase().includes(filter.toLowerCase()));

  return (
    <div className="flex flex-col gap-6">
      {action && <p className="text-sm text-muted-foreground">{t.uninstalling}</p>}
      <ErrorText error={remove.error} />
      <FieldSet>
        <FieldLegend>
          {t.skillsTitle}
          {skills && ` (${skills.length})`}
        </FieldLegend>
        <FieldDescription>{t.skillsHint}</FieldDescription>
        <Input aria-label={t.filterSkills} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t.filter} />
        {isPending && <Loading />}
        <ErrorText error={error ?? toggle.error} />
        <SettingList>
          {list.map((s) => (
            <SettingRow
              key={s.name}
              title={
                <>
                  {s.name}
                  {s.category && ` · ${s.category}`}
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
        </SettingList>
      </FieldSet>
    </div>
  );
}

/** Hermes prefixes toolset labels with an emoji ("🔍 Web Search"): the list stays text-only. */
const withoutEmoji = (label: string) => label.replace(/^[\p{Extended_Pictographic}\uFE0F\u200D\s]+/u, "");

/** List of settings: one row per tool, server or skill. */
function SettingList({ children }: { children: ReactNode }) {
  return <ItemGroup className="gap-0 rounded-lg border">{children}</ItemGroup>;
}

function SettingRow(props: { title: ReactNode; description: ReactNode; media?: ReactNode; children: ReactNode }) {
  return (
    <Item role="listitem" className="flex-nowrap rounded-none border-0 border-b border-border last:border-b-0">
      {props.media && <ItemMedia variant="icon">{props.media}</ItemMedia>}
      <ItemContent className="min-w-0">
        <ItemTitle>{props.title}</ItemTitle>
        <ItemDescription className="truncate">{props.description}</ItemDescription>
      </ItemContent>
      <ItemActions>{props.children}</ItemActions>
    </Item>
  );
}
