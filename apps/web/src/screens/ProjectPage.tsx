import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouteContext, useSearch } from "@tanstack/react-router";
import {
  PROJECT_BOT_ACCESS_OPTIONS,
  PROJECT_STATUSES,
  resourceDomain,
  type ConversationEvent,
  type ProjectBotAccess,
  type ProjectInfo,
  type ProjectResource,
} from "@agora/core";
import { common } from "@agora/core/i18n";
import { useRef, useState, type ReactNode } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { BrandLogo } from "@/components/BrandLogo";
import { ConversationAvatar, PersonAvatar } from "@/components/ConversationAvatar";
import { DateTimePicker } from "@/components/DateTimePicker";
import { MessageText } from "@/components/MessageText";
import { OptionSelect } from "@/components/Pickers";
import { ProjectStatusIcon, useProjectStatusLabel } from "@/components/ProjectMarks";
import { ProjectMenu, useCreateDiscussion } from "@/components/ProjectTree";
import { ChevronLeftIcon, CloseIcon, ExternalLinkIcon, FileIcon, FileTextIcon, LinkIcon, SearchIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldGroup } from "@/components/ui/field";
import { FormLabel } from "@/components/FormLabel";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { defineMessages, useLocale, useT } from "@/i18n";
import { useEventText } from "@/i18n/events";
import { api, attachmentUrl, conversationPath, uploadAttachment, type AgentSummary, type ConversationDetail, type ConversationSummary, type Person } from "@/lib/api";
import { allCodeSessionsQuery } from "@/lib/code-sessions";
import { dayLabel, listTime } from "@/lib/dates";
import { useOrgTitle } from "@/lib/org";
import { conversationTitle } from "@/lib/participants";
import { agentsQuery, conversationQuery, conversationsQuery, usersQuery } from "@/lib/queries";
import { confirmAction } from "@/lib/confirm";
import { cn } from "@/lib/utils";
import type { ProjectTab } from "@/router";
import { ProjectDiscussionList } from "@/screens/ProjectDiscussions";
import { projectSessionGroups, SessionGroups, SessionRow } from "@/screens/Sessions";

const messages = defineMessages({
  en: {
    projects: "Projects",
    back: "Back",
    tabs: { overview: "Overview", discussions: "Discussions", sessions: "Sessions", data: "Data", activity: "Activity" } satisfies Record<ProjectTab, string>,
    notFound: "This project doesn't exist, or you're not in it anymore.",
    namePlaceholder: "Project name",
    descriptionPlaceholder: "What the project is about, in one line",
    context: "Context",
    contextRead: "Read by the bots with every message",
    contextHidden: "Not given to the bots",
    contextEmpty: "Write what the bots should know about the project: its stack, its rules, its decisions.",
    contextEdited: (who: string, when: string) => `Edited by ${who} ${when}`,
    edit: "Edit",
    save: "Save",
    resources: "Resources",
    add: "Add",
    addResource: "Add a resource",
    url: "Link",
    label: "Name",
    remove: (name: string) => `Remove ${name}`,
    noResources: "The repository, the design file, production: the project's links, with their site's logo.",
    recentDiscussions: "Recent discussions",
    seeAll: (n: number) => `See all ${n}`,
    codeSessions: "Code sessions",
    noSessions: "No code session in this project yet.",
    properties: "Properties",
    status: "Status",
    lead: "Lead",
    noLead: "No lead",
    members: "Members",
    bots: "Bots",
    addMember: "Add a member",
    addBot: "Add a bot",
    findMember: "Find a colleague…",
    findBot: "Find a bot…",
    memberCount: (n: number) => `${n} members`,
    botCount: (n: number) => `${n} bots`,
    nobodyMatches: "No one matches.",
    listUnavailable: "Unreachable for now.",
    addFailed: "Couldn't add them.",
    removeFailed: "Couldn't remove them.",
    removeTitle: (name: string) => `Remove ${name} from the project?`,
    removeBody: "They'll no longer see the project or its discussions. You can add them back later.",
    removeBotBody: "It will no longer answer in the project or its discussions. You can add it back later.",
    removeAction: "Remove",
    repo: "Repository",
    repoPlaceholder: "owner/name",
    noRepo: "No repository",
    openOnGitHub: "Open on GitHub",
    dueOn: "Due date",
    botAccess: "What the bots can do",
    access: {
      context: { label: "Context", none: "No access", read: "Read", write: "Read and edit" },
      data: { label: "Data", none: "No access", read: "Read", add: "Read and add" },
      discussions: { label: "Discussions", none: "Leave untouched", rename: "Name untitled ones" },
      sessions: { label: "Code sessions", none: "No default", repo: "Start on the repository" },
    },
    activity: "Activity",
    noActivity: "Nothing yet.",
    data: "Data",
    dataIntro: "The project's files and pages: the bots and code sessions read them, and put what they make here.",
    search: "Search",
    pages: "Pages",
    files: "Files",
    version: (n: number) => `Version ${n}`,
    noData: "No file or page yet. Add one, or ask a bot for a page.",
    noMatch: "Nothing matches.",
    uploadFailed: "The file couldn't be added.",
    saveFailed: "Couldn't save.",
    inDiscussion: (name: string) => `in ${name}`,
    general: "General",
    startDiscussion: "Start a discussion",
  },
  fr: {
    projects: "Projets",
    back: "Retour",
    tabs: { overview: "Vue d'ensemble", discussions: "Discussions", sessions: "Sessions", data: "Données", activity: "Activité" },
    notFound: "Ce projet n'existe pas, ou tu n'en fais plus partie.",
    namePlaceholder: "Nom du projet",
    descriptionPlaceholder: "De quoi parle le projet, en une ligne",
    context: "Contexte",
    contextRead: "Lu par les bots à chaque message",
    contextHidden: "Pas transmis aux bots",
    contextEmpty: "Écris ce que les bots doivent savoir du projet : sa stack, ses règles, ses décisions.",
    contextEdited: (who: string, when: string) => `Modifié par ${who} ${when}`,
    edit: "Modifier",
    save: "Enregistrer",
    resources: "Ressources",
    add: "Ajouter",
    addResource: "Ajouter une ressource",
    url: "Lien",
    label: "Nom",
    remove: (name: string) => `Retirer ${name}`,
    noResources: "Le dépôt, la maquette, la production : les liens du projet, avec le logo de leur site.",
    recentDiscussions: "Discussions récentes",
    seeAll: (n: number) => `Voir les ${n}`,
    codeSessions: "Sessions de code",
    noSessions: "Aucune session de code dans ce projet pour l'instant.",
    properties: "Propriétés",
    status: "Statut",
    lead: "Responsable",
    noLead: "Aucun",
    members: "Membres",
    bots: "Bots",
    addMember: "Ajouter un membre",
    addBot: "Ajouter un bot",
    findMember: "Chercher un collègue…",
    findBot: "Chercher un bot…",
    memberCount: (n: number) => `${n} membres`,
    botCount: (n: number) => `${n} bots`,
    nobodyMatches: "Personne ne correspond.",
    listUnavailable: "Injoignable pour le moment.",
    addFailed: "Ajout impossible.",
    removeFailed: "Retrait impossible.",
    removeTitle: (name: string) => `Retirer ${name} du projet ?`,
    removeBody: "Cette personne ne verra plus le projet ni ses discussions. Tu pourras la rajouter plus tard.",
    removeBotBody: "Il ne répondra plus dans le projet ni dans ses discussions. Tu pourras le rajouter plus tard.",
    removeAction: "Retirer",
    repo: "Dépôt",
    repoPlaceholder: "propriétaire/nom",
    noRepo: "Aucun dépôt",
    openOnGitHub: "Ouvrir sur GitHub",
    dueOn: "Échéance",
    botAccess: "Ce que les bots peuvent faire",
    access: {
      context: { label: "Contexte", none: "Aucun accès", read: "Lire", write: "Lire et modifier" },
      data: { label: "Données", none: "Aucun accès", read: "Lire", add: "Lire et ajouter" },
      discussions: { label: "Discussions", none: "Ne pas y toucher", rename: "Nommer les nouvelles" },
      sessions: { label: "Sessions de code", none: "Pas de dépôt par défaut", repo: "Lancer sur le dépôt" },
    },
    activity: "Activité",
    noActivity: "Rien pour l'instant.",
    data: "Données",
    dataIntro: "Les fichiers et pages du projet : les bots et les sessions de code les lisent, et y déposent ce qu'ils produisent.",
    search: "Rechercher",
    pages: "Pages",
    files: "Fichiers",
    version: (n: number) => `Version ${n}`,
    noData: "Aucun fichier ni page pour l'instant. Ajoutes-en un, ou demande une page à un bot.",
    noMatch: "Rien ne correspond.",
    uploadFailed: "Le fichier n'a pas pu être ajouté.",
    saveFailed: "Enregistrement impossible.",
    inDiscussion: (name: string) => `dans ${name}`,
    general: "Général",
    startDiscussion: "Ouvrir une discussion",
  },
});

type Named = ConversationSummary & { name: string };
type ProjectData = {
  files: { id: string; conversationId: string; name: string; mime: string; size: number; createdAt: string; discussion: string | null; author: { kind: "user" | "agent"; id: string } | null }[];
  pages: { id: string; conversationId: string; title: string; version: number; updatedAt: string; discussion: string | null }[];
};
type ActivityRow = { id: string; conversationId: string; discussion: string | null; event: ConversationEvent | null; text: string; createdAt: string };

const TABS: ProjectTab[] = ["overview", "discussions", "sessions", "data", "activity"];

const activityQuery = (id: string) => ({ queryKey: ["project-activity", id], queryFn: () => api<ActivityRow[]>(conversationPath(id, "/project/activity")) });
const dataQuery = (id: string) => ({ queryKey: ["project-data", id], queryFn: () => api<ProjectData>(conversationPath(id, "/project/data")) });

/** Saves fields of the project's page, then refreshes what shows them. */
function useSaveProject(id: string) {
  const t = useT(messages);
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Partial<Omit<ProjectInfo, "contextUpdatedAt" | "contextAuthor">> & { title?: string; description?: string }) =>
      api(conversationPath(id), { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: conversationQuery(id).queryKey }),
        qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }),
        qc.invalidateQueries({ queryKey: ["project-activity", id] }),
      ]),
    meta: { error: t.saveFailed },
  });
}

/**
 * A project's page, as Linear's (Figma « Proposition — Page projet », section 11): its tabs on the left
 * (overview, discussions, code sessions, data, activity), its properties and what its bots may do on the
 * right. Every property is edited in place.
 */
export function ProjectPage() {
  const { projectId } = useParams({ from: "/app/p/$projectId" });
  const { tab = "overview" } = useSearch({ from: "/app/p/$projectId" });
  return <ProjectView projectId={projectId} tab={tab} />;
}

/** The page itself: a route on a phone, a workspace tab on desktop (the tab comes from the URL's `?tab=`). */
export function ProjectView({ projectId, tab }: { projectId: string; tab: ProjectTab }) {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  const navigate = useNavigate();
  const create = useCreateDiscussion();
  const { data: list, isPending } = useQuery(conversationsQuery);
  const { data: detail } = useQuery({ ...conversationQuery(projectId), enabled: !!list?.some((c) => c.id === projectId && !c.parentId) });
  const { data: allSessions = [] } = useQuery(allCodeSessionsQuery);
  const named: Named[] = (list ?? []).map((x) => ({ ...x, name: conversationTitle(x, user.id) }));
  const project = named.find((x) => x.id === projectId && !x.parentId && x.kind === "group");
  useOrgTitle(project?.name ?? t.projects);
  const discussions = named.filter((x) => x.parentId === projectId && !x.archived);
  const ids = new Set([projectId, ...named.filter((x) => x.parentId === projectId).map((x) => x.id)]);
  const sessions = allSessions.filter((s) => ids.has(s.conversationId));
  const setTab = (next: string) => navigate({ to: "/p/$projectId", params: { projectId }, search: next === "overview" ? {} : { tab: next as ProjectTab }, replace: true });
  const counts: Partial<Record<ProjectTab, number>> = { discussions: discussions.length, sessions: sessions.length };

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <header className="flex h-11.5 shrink-0 items-center gap-2 border-b pr-3.5 pl-3 md:pl-5">
        <Button variant="ghost" size="icon-sm" nativeButton={false} render={<Link to="/" aria-label={t.back} />} className="md:hidden">
          <ChevronLeftIcon />
        </Button>
        <span className="text-ui text-muted-foreground">{t.projects}</span>
        <span className="text-ui text-muted-foreground">/</span>
        {project && (
          <span className="flex min-w-0 items-center gap-2 text-ui font-medium">
            <ConversationAvatar conversation={project} me={user.id} className="size-4.5" />
            <span className="truncate">{project.name}</span>
          </span>
        )}
        <span className="flex-1" />
        {project && <ProjectMenu project={project} align="end" trigger={<Button variant="ghost" size="icon-sm" aria-label={project.name} />} />}
      </header>
      {isPending ? (
        <div className="grid flex-1 place-items-center">
          <Spinner />
        </div>
      ) : !project ? (
        <Empty className="mt-10">
          <EmptyHeader>
            <EmptyDescription>{t.notFound}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <>
          <Tabs value={tab} onValueChange={(v) => setTab(v as string)} className="shrink-0 border-b px-3 md:px-5">
            <TabsList variant="line" className="h-10 gap-3">
              {TABS.map((k) => (
                <TabsTrigger key={k} value={k} className="flex-none px-1">
                  {t.tabs[k]}
                  {counts[k] ? <span className="font-normal text-muted-foreground tabular-nums">{counts[k]}</span> : null}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <div className="flex min-h-0 flex-1">
            <div className="min-w-0 flex-1 overflow-y-auto">
              {tab === "sessions" ? (
                <SessionsTab sessions={sessions} />
              ) : (
                <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 pt-8 pb-16 md:px-8">
                  {tab === "overview" && detail?.project && (
                    <Overview
                      project={project}
                      detail={detail}
                      info={detail.project}
                      discussions={discussions}
                      sessions={sessions}
                      onTab={setTab}
                      onCreate={() => create.mutate(projectId)}
                    />
                  )}
                  {tab === "discussions" && <ProjectDiscussionList project={project} named={named} onCreate={() => create.mutate(projectId)} />}
                  {tab === "data" && <DataTab projectId={projectId} named={named} />}
                  {tab === "activity" && <ActivityList projectId={projectId} />}
                </div>
              )}
            </div>
            {detail?.project && (
              <aside className="hidden w-75 shrink-0 overflow-y-auto border-l lg:block">
                <PropertiesPanel detail={detail} info={detail.project} withActivity={tab !== "activity"} />
              </aside>
            )}
          </div>
        </>
      )}
    </section>
  );
}

/* ---------- overview ---------- */

/** A section's heading, its actions on the right (same buttons, flush with the content's right edge). */
function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex h-7 items-center gap-1">
      <h2 className="text-ui font-medium">{children}</h2>
      <span className="flex-1" />
      {aside && <div className="-mr-2.5 flex items-center">{aside}</div>}
    </div>
  );
}

function SectionAction({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={onClick}>
      {children}
    </Button>
  );
}

function Overview({
  project,
  detail,
  info,
  discussions,
  sessions,
  onTab,
  onCreate,
}: {
  project: Named;
  detail: ConversationDetail;
  info: ProjectInfo;
  discussions: Named[];
  sessions: ReturnType<typeof projectSessionGroups>["toDecide"];
  onTab: (tab: ProjectTab) => void;
  onCreate: () => void;
}) {
  const t = useT(messages);
  const { user } = useRouteContext({ from: "/app" });
  const save = useSaveProject(project.id);
  const recent = discussions.slice(0, 5);
  return (
    <>
      <div className="flex flex-col gap-3">
        <ConversationAvatar conversation={detail} me={user.id} className="size-10" />
        <InlineText
          value={detail.title ?? ""}
          placeholder={t.namePlaceholder}
          className="text-2xl font-medium"
          max={80}
          onSave={(title) => save.mutate({ title })}
        />
        <InlineText
          value={detail.description ?? ""}
          placeholder={t.descriptionPlaceholder}
          className="text-ui text-muted-foreground"
          max={200}
          onSave={(description) => save.mutate({ description })}
        />
      </div>
      <ContextSection projectId={project.id} info={info} />
      <ResourcesSection projectId={project.id} resources={info.resources} />
      <section className="flex flex-col gap-2">
        <SectionTitle
          aside={
            <>
              {discussions.length > recent.length && <SectionAction onClick={() => onTab("discussions")}>{t.seeAll(discussions.length)}</SectionAction>}
              <SectionAction onClick={onCreate}>{t.startDiscussion}</SectionAction>
            </>
          }
        >
          {t.recentDiscussions}
        </SectionTitle>
        <ItemGroup className="-mx-3 w-auto">
          {[{ ...project, name: t.general }, ...recent].map((d) => (
            <Item key={d.id} size="sm" render={<Link to="/c/$conversationId" params={{ conversationId: d.id }} />}>
              <ItemContent className="flex-row items-center gap-2">
                <ItemTitle className={cn("shrink-0", !d.unread && "font-normal")}>{d.name}</ItemTitle>
                {d.preview && <ItemDescription className="line-clamp-1 min-w-0">{d.preview.author ? `${d.preview.author} : ${d.preview.text}` : d.preview.text}</ItemDescription>}
              </ItemContent>
              <ItemActions className="text-xs text-muted-foreground tabular-nums">{listTime(new Date(d.lastAt))}</ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </section>
      <section className="flex flex-col gap-2">
        <SectionTitle
          aside={sessions.length > 3 && <SectionAction onClick={() => onTab("sessions")}>{t.seeAll(sessions.length)}</SectionAction>}
        >
          {t.codeSessions}
        </SectionTitle>
        {sessions.length ? (
          <div className="-mx-5">
            {sessions.slice(0, 3).map((s) => (
              <SessionRow key={s.id} session={s} grouping="priority" />
            ))}
          </div>
        ) : (
          <p className="text-ui text-muted-foreground">{t.noSessions}</p>
        )}
      </section>
    </>
  );
}

/** A text shown as itself, edited in place on click (Linear's project title and summary). */
function InlineText({ value, placeholder, className, max, onSave }: { value: string; placeholder: string; className?: string; max: number; onSave: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft !== null && draft.trim() !== value) onSave(draft.trim());
    setDraft(null);
  };
  return (
    <input
      value={draft ?? value}
      placeholder={placeholder}
      maxLength={max}
      aria-label={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setDraft(null);
          requestAnimationFrame(() => e.currentTarget?.blur());
        }
      }}
      className={cn("w-full bg-transparent outline-none placeholder:text-muted-foreground/60", className)}
    />
  );
}

/** The context the bots read with every message: shown as Markdown, rewritten in place. */
function ContextSection({ projectId, info }: { projectId: string; info: ProjectInfo }) {
  const t = useT(messages);
  const [draft, setDraft] = useState<string | null>(null);
  const save = useSaveProject(projectId);
  const read = info.botAccess.context !== "none";
  return (
    <section className="flex flex-col gap-2">
      <div className="flex flex-col">
        <SectionTitle aside={draft === null && <SectionAction onClick={() => setDraft(info.context)}>{t.edit}</SectionAction>}>{t.context}</SectionTitle>
        <p className="text-xs text-muted-foreground">{read ? t.contextRead : t.contextHidden}</p>
      </div>
      {draft !== null ? (
        <div className="flex flex-col gap-2">
          <Textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="min-h-48 font-mono text-xs" />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDraft(null)}>
              {useT(common).cancel}
            </Button>
            <Button disabled={save.isPending} onClick={() => save.mutate({ context: draft }, { onSuccess: () => setDraft(null) })}>
              {t.save}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg border px-4 py-3">
          {info.context ? <MessageText text={info.context} className="text-ui" /> : <p className="text-ui text-muted-foreground">{t.contextEmpty}</p>}
          {info.contextAuthor && info.contextUpdatedAt && (
            <span className="text-xs text-muted-foreground">{t.contextEdited(info.contextAuthor.name, listTime(new Date(info.contextUpdatedAt)))}</span>
          )}
        </div>
      )}
    </section>
  );
}

/** A link's logo: its brand (logo.dev or the app's marks), else its site's favicon, else a link icon. */
function ResourceLogo({ url, className }: { url: string; className?: string }) {
  const domain = resourceDomain(url);
  const [failed, setFailed] = useState(false);
  const icon = <LinkIcon className={cn("size-4 text-muted-foreground", className)} />;
  if (!domain) return icon;
  const favicon = failed ? icon : <img src={`/api/integrations/favicon?domain=${encodeURIComponent(domain)}`} alt="" onError={() => setFailed(true)} className={cn("size-4 rounded-sm", className)} />;
  return <BrandLogo domain={domain} fallback={favicon} className={cn("size-4", className)} />;
}

function ResourcesSection({ projectId, resources }: { projectId: string; resources: ProjectResource[] }) {
  const t = useT(messages);
  const save = useSaveProject(projectId);
  const [adding, setAdding] = useState(false);
  return (
    <section className="flex flex-col gap-2">
      <SectionTitle
        aside={<SectionAction onClick={() => setAdding(true)}>{t.add}</SectionAction>}
      >
        {t.resources}
      </SectionTitle>
      {resources.length ? (
        <ItemGroup className="gap-2">
          {resources.map((r, i) => (
            <div key={`${r.url}-${i}`} className="group/row relative">
              <Item variant="outline" size="sm" render={<a href={r.url} target="_blank" rel="noreferrer" />}>
                <ItemMedia>
                  <ResourceLogo url={r.url} />
                </ItemMedia>
                <ItemContent className="flex-row items-center gap-2">
                  <ItemTitle>{r.label || resourceDomain(r.url)}</ItemTitle>
                  <ItemDescription className="line-clamp-1">{r.url.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <ExternalLinkIcon className="size-3.5 text-muted-foreground" />
                </ItemActions>
              </Item>
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t.remove(r.label || r.url)}
                className="absolute top-1/2 right-9 -translate-y-1/2 opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100"
                onClick={() => save.mutate({ resources: resources.filter((_, j) => j !== i) })}
              >
                <CloseIcon />
              </Button>
            </div>
          ))}
        </ItemGroup>
      ) : (
        <p className="text-ui text-muted-foreground">{t.noResources}</p>
      )}
      <Dialog open={adding} onOpenChange={setAdding}>
        {adding && <ResourceForm onDone={() => setAdding(false)} onAdd={(r) => save.mutateAsync({ resources: [...resources, r] })} />}
      </Dialog>
    </section>
  );
}

function ResourceForm({ onAdd, onDone }: { onAdd: (r: ProjectResource) => Promise<unknown>; onDone: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const [url, setUrl] = useState("");
  const [label, setLabel] = useState("");
  const full = /^https?:\/\//.test(url.trim()) ? url.trim() : `https://${url.trim()}`;
  const valid = !!url.trim() && !!resourceDomain(full);
  const add = useMutation({ mutationFn: () => onAdd({ url: full, label: label.trim() }), onSuccess: onDone, meta: { error: t.saveFailed } });
  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{t.addResource}</DialogTitle>
      </DialogHeader>
      <form
        id="project-resource"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !add.isPending) add.mutate();
        }}
      >
        <FieldGroup>
          <Field>
            <FormLabel htmlFor="resource-url" required>
              {t.url}
            </FormLabel>
            <Input id="resource-url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://github.com/…" />
          </Field>
          <Field>
            <FormLabel htmlFor="resource-label">{t.label}</FormLabel>
            <Input id="resource-label" value={label} maxLength={60} onChange={(e) => setLabel(e.target.value)} />
          </Field>
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form="project-resource" disabled={!valid || add.isPending}>
          {t.add}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ---------- properties panel ---------- */

function PropertyRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid min-h-8 grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2">
      <span className="text-ui text-muted-foreground">{label}</span>
      <div className="flex min-w-0 items-center gap-1.5 text-ui">{children}</div>
    </div>
  );
}

const GITHUB = "https://github.com/";

function PropertiesPanel({ detail, info, withActivity }: { detail: ConversationDetail; info: ProjectInfo; withActivity: boolean }) {
  const t = useT(messages);
  const statusLabel = useProjectStatusLabel();
  const save = useSaveProject(detail.id);
  const access = t.access;
  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-3 px-5 py-5">
        <h2 className="text-ui font-medium text-muted-foreground">{t.properties}</h2>
        <div className="flex flex-col gap-1">
          <PropertyRow label={t.status}>
            <OptionSelect
              aria-label={t.status}
              value={info.status}
              options={PROJECT_STATUSES.map((s) => ({ value: s, label: statusLabel[s], icon: <ProjectStatusIcon status={s} /> }))}
              onValueChange={(v) => save.mutate({ status: v as ProjectInfo["status"] })}
            />
          </PropertyRow>
          <PropertyRow label={t.lead}>
            <OptionSelect
              aria-label={t.lead}
              value={info.leadId ?? ""}
              options={[
                { value: "", label: t.noLead },
                ...detail.members.map((m) => ({ value: m.id, label: m.name, icon: <PersonAvatar person={m} className="size-4" /> })),
              ]}
              onValueChange={(v) => save.mutate({ leadId: v || null })}
            />
          </PropertyRow>
          <PropertyRow label={t.members}>
            <ParticipantsField detail={detail} kind="user" />
          </PropertyRow>
          <PropertyRow label={t.bots}>
            <ParticipantsField detail={detail} kind="agent" />
          </PropertyRow>
          <PropertyRow label={t.repo}>
            <RepoField repo={info.repo} onSave={(repo) => save.mutate({ repo })} />
          </PropertyRow>
          <PropertyRow label={t.dueOn}>
            <DateTimePicker
              dateOnly
              value={info.dueOn ?? undefined}
              onChange={(dueOn) => save.mutate({ dueOn })}
            />
          </PropertyRow>
        </div>
      </div>
      <Separator />
      <div className="flex flex-col gap-3 px-5 py-5">
        <h2 className="text-ui font-medium text-muted-foreground">{t.botAccess}</h2>
        {(Object.keys(PROJECT_BOT_ACCESS_OPTIONS) as (keyof ProjectBotAccess)[]).map((key) => (
          <Field key={key} className="gap-1.5">
            <label htmlFor={`access-${key}`} className="text-ui text-muted-foreground">
              {access[key].label}
            </label>
            <OptionSelect
              id={`access-${key}`}
              value={info.botAccess[key]}
              options={(PROJECT_BOT_ACCESS_OPTIONS[key] as string[]).map((v) => ({ value: v, label: (access[key] as Record<string, string>)[v]! }))}
              onValueChange={(v) => save.mutate({ botAccess: { ...info.botAccess, [key]: v } })}
            />
          </Field>
        ))}
      </div>
      {withActivity && (
        <>
          <Separator />
          <div className="flex flex-col gap-3 px-5 py-5">
            <h2 className="text-ui font-medium text-muted-foreground">{t.activity}</h2>
            <ActivityList projectId={detail.id} compact />
          </div>
        </>
      )}
    </div>
  );
}

type Candidate = { id: string; name: string; mark: ReactNode };

/**
 * The project's members or bots: one field showing who is in (faces, then the name or the count), opening a
 * searchable list where each one is ticked in or out. Joining or leaving the project also joins or leaves
 * its discussions (the API does it). Removing asks first; only the project's creator or an admin may.
 */
function ParticipantsField({ detail, kind }: { detail: ConversationDetail; kind: "user" | "agent" }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { user } = useRouteContext({ from: "/app" });
  const [open, setOpen] = useState(false);
  const botsQ = useQuery({ ...agentsQuery, enabled: open && kind === "agent" });
  const peopleQ = useQuery({ ...usersQuery, enabled: open && kind === "user" });
  const list: { data?: (AgentSummary | Person)[]; isPending: boolean; isError: boolean } = kind === "agent" ? botsQ : peopleQ;
  const canRemove = detail.createdBy === user.id || user.role === "admin";
  const asCandidate = (x: AgentSummary | Person): Candidate =>
    kind === "agent"
      ? { id: x.id, name: x.name, mark: <AgentAvatar agent={x as AgentSummary} className="size-5" /> }
      : { id: x.id, name: x.name, mark: <PersonAvatar person={x as Person} className="size-5" /> };
  const current: Candidate[] = (kind === "agent" ? detail.agents : detail.members).map(asCandidate);
  const others: Candidate[] = (list.data ?? [])
    .filter((x) => !current.some((m) => m.id === x.id) && !(kind === "agent" && (x as AgentSummary).onboarding))
    .map(asCandidate);
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: conversationQuery(detail.id).queryKey }),
      qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }),
      qc.invalidateQueries({ queryKey: ["project-activity", detail.id] }),
    ]);
  const add = useMutation({
    mutationFn: (id: string) =>
      api(conversationPath(detail.id, "/members"), { method: "POST", body: JSON.stringify(kind === "agent" ? { agentIds: [id] } : { userIds: [id] }) }),
    onSuccess: refresh,
    meta: { success: c.added, error: t.addFailed },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api(conversationPath(detail.id, `/members/${kind}/${encodeURIComponent(id)}`), { method: "DELETE" }),
    onSuccess: refresh,
    meta: { success: c.removed, error: t.removeFailed },
  });
  const busy = add.isPending || remove.isPending;
  const pending = add.isPending ? add.variables : remove.isPending ? remove.variables : null;
  const toggle = async (m: Candidate, inProject: boolean) => {
    if (busy) return;
    if (!inProject) return add.mutate(m.id);
    setOpen(false);
    if (await confirmAction({ title: t.removeTitle(m.name), description: kind === "agent" ? t.removeBotBody : t.removeBody, action: t.removeAction }))
      remove.mutate(m.id);
  };
  const row = (m: Candidate, inProject: boolean) => (
    <CommandItem
      key={m.id}
      value={m.id}
      keywords={[m.name]}
      data-checked={inProject}
      disabled={inProject && (!canRemove || m.id === user.id)}
      onSelect={() => void toggle(m, inProject)}
    >
      {m.mark}
      <span className="truncate">{m.name}</span>
      {pending === m.id && <Spinner className="ml-auto" />}
    </CommandItem>
  );
  const empty = kind === "agent" ? t.addBot : t.addMember;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="outline" className={cn("w-full justify-start font-normal", !current.length && "text-muted-foreground")} />}>
        {current.length > 0 && (
          <span className="flex shrink-0 -space-x-1">
            {current.slice(0, 3).map((m) => (
              <span key={m.id} className="flex rounded-full ring-2 ring-background [&>*]:size-4!">
                {m.mark}
              </span>
            ))}
          </span>
        )}
        <span className="truncate">
          {current.length === 0 ? empty : current.length === 1 ? current[0]!.name : kind === "agent" ? t.botCount(current.length) : t.memberCount(current.length)}
        </span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-0">
        {/* Filter on the name only: the value holds the id, which must not match. */}
        <Command filter={(_, search, keywords) => (keywords?.some((k) => k.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0)}>
          <CommandInput placeholder={kind === "agent" ? t.findBot : t.findMember} />
          <CommandList>
            <CommandEmpty>{list.isPending ? <Spinner className="mx-auto" /> : list.isError ? t.listUnavailable : t.nobodyMatches}</CommandEmpty>
            {current.length > 0 && <CommandGroup>{current.map((m) => row(m, true))}</CommandGroup>}
            {others.length > 0 && <CommandGroup>{others.map((m) => row(m, false))}</CommandGroup>}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** The repository: one field showing it with GitHub's logo; it opens to change it, or to go to it on GitHub. */
function RepoField({ repo, onSave }: { repo: string | null; onSave: (repo: string | null) => void }) {
  const t = useT(messages);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(repo ?? "");
  const valid = !draft.trim() || /^[\w.-]+\/[\w.-]+$/.test(draft.trim());
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) setDraft(repo ?? "");
      }}
    >
      <PopoverTrigger render={<Button variant="outline" className={cn("w-full justify-start font-normal", !repo && "text-muted-foreground")} />}>
        {repo && <BrandLogo domain="github.com" fallback={<LinkIcon />} className="size-3.5" />}
        <span className="truncate">{repo ?? t.noRepo}</span>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!valid) return;
            onSave(draft.trim() || null);
            setOpen(false);
          }}
          className="flex flex-col gap-2"
        >
          <Input autoFocus value={draft} placeholder={t.repoPlaceholder} aria-label={t.repo} aria-invalid={!valid} onChange={(e) => setDraft(e.target.value)} />
          <div className="flex gap-2">
            {repo && (
              <Button variant="outline" size="sm" className="flex-1" nativeButton={false} render={<a href={GITHUB + repo} target="_blank" rel="noreferrer" />}>
                {t.openOnGitHub}
              </Button>
            )}
            <Button type="submit" size="sm" className="flex-1" disabled={!valid}>
              {t.save}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}

/* ---------- sessions ---------- */

function SessionsTab({ sessions }: { sessions: ReturnType<typeof projectSessionGroups>["toDecide"] }) {
  const t = useT(messages);
  const { toDecide, groups } = projectSessionGroups(sessions);
  if (!sessions.length)
    return (
      <Empty className="mt-10">
        <EmptyHeader>
          <EmptyTitle>{t.noSessions}</EmptyTitle>
        </EmptyHeader>
      </Empty>
    );
  return <SessionGroups toDecide={toDecide} groups={groups} grouping="state" />;
}

/* ---------- data ---------- */

const size = (n: number) => (n < 1024 ? `${n} o` : n < 1024 ** 2 ? `${Math.round(n / 1024)} Ko` : `${(n / 1024 ** 2).toFixed(1).replace(".", ",")} Mo`);

function DataTab({ projectId, named }: { projectId: string; named: Named[] }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [q, setQ] = useState("");
  const { data, isPending } = useQuery(dataQuery(projectId));
  const upload = useMutation({
    mutationFn: async (files: File[]) => {
      for (const f of files) await uploadAttachment(projectId, f);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["project-data", projectId] }),
    meta: { error: t.uploadFailed },
  });
  const query = q.trim().toLowerCase();
  const pages = (data?.pages ?? []).filter((p) => p.title.toLowerCase().includes(query));
  const files = (data?.files ?? []).filter((f) => f.name.toLowerCase().includes(query));
  const author = (a: ProjectData["files"][number]["author"]) => {
    if (!a) return null;
    for (const c of named) {
      if (a.kind === "agent") {
        const bot = c.agents.find((x) => x.id === a.id);
        if (bot) return { name: bot.name, mark: <AgentAvatar agent={bot} className="size-4" /> };
      } else {
        const m = c.members.find((x) => x.id === a.id);
        if (m) return { name: m.name, mark: <PersonAvatar person={m} className="size-4" /> };
      }
    }
    return null;
  };
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-medium">{t.data}</h2>
          <span className="flex-1" />
          <InputGroup className="w-48">
            <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={t.search} aria-label={t.search} />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
          <Button disabled={upload.isPending} onClick={() => input.current?.click()}>
            {t.add}
          </Button>
          <input
            ref={input}
            type="file"
            multiple
            hidden
            onChange={(e) => {
              const picked = [...(e.target.files ?? [])];
              e.target.value = "";
              if (picked.length) upload.mutate(picked);
            }}
          />
        </div>
        <p className="text-ui text-muted-foreground">{t.dataIntro}</p>
      </div>
      {isPending ? (
        <Spinner />
      ) : !pages.length && !files.length ? (
        <p className="text-ui text-muted-foreground">{query ? t.noMatch : t.noData}</p>
      ) : (
        <>
          {pages.length > 0 && (
            <section className="flex flex-col gap-1">
              <h3 className="px-2 text-xs font-medium text-muted-foreground">{t.pages}</h3>
              <ItemGroup>
                {pages.map((p) => (
                  <Item key={p.id} size="sm" render={<Link to="/artifacts/$artifactId" params={{ artifactId: p.id }} />}>
                    <ItemMedia>
                      <FileTextIcon className="size-4 text-muted-foreground" />
                    </ItemMedia>
                    <ItemContent className="flex-row items-center gap-2">
                      <ItemTitle>{p.title}</ItemTitle>
                      <ItemDescription>{t.version(p.version)}</ItemDescription>
                    </ItemContent>
                    <ItemActions className="text-xs text-muted-foreground">
                      {p.discussion && <span className="max-w-48 truncate">{t.inDiscussion(p.discussion)}</span>}
                      <span className="tabular-nums">{listTime(new Date(p.updatedAt))}</span>
                    </ItemActions>
                  </Item>
                ))}
              </ItemGroup>
            </section>
          )}
          {files.length > 0 && (
            <section className="flex flex-col gap-1">
              <h3 className="px-2 text-xs font-medium text-muted-foreground">{t.files}</h3>
              <ItemGroup>
                {files.map((f) => {
                  const by = author(f.author);
                  return (
                    <Item key={f.id} size="sm" render={<a href={attachmentUrl(f.id)} target="_blank" rel="noreferrer" />}>
                      <ItemMedia>
                        <FileIcon className="size-4 text-muted-foreground" />
                      </ItemMedia>
                      <ItemContent className="flex-row items-center gap-2">
                        <ItemTitle className="truncate">{f.name}</ItemTitle>
                        <ItemDescription>{size(f.size)}</ItemDescription>
                      </ItemContent>
                      <ItemActions className="text-xs text-muted-foreground">
                        {by && (
                          <span className="flex items-center gap-1.5">
                            {by.mark}
                            {by.name}
                          </span>
                        )}
                        <span className="tabular-nums">{listTime(new Date(f.createdAt))}</span>
                      </ItemActions>
                    </Item>
                  );
                })}
              </ItemGroup>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/* ---------- activity ---------- */

/** The project's events, grouped by day; `compact`: the panel's latest few. */
function ActivityList({ projectId, compact }: { projectId: string; compact?: boolean }) {
  const t = useT(messages);
  const locale = useLocale();
  const eventText = useEventText();
  const { data = [], isPending } = useQuery(activityQuery(projectId));
  if (isPending) return <Spinner />;
  if (!data.length) return <p className="text-ui text-muted-foreground">{t.noActivity}</p>;
  const row = (a: ActivityRow) => {
    const text = eventText(a.text, a.event);
    const actor = a.event && "actor" in a.event ? (a.event.actor as string) : null;
    const lead = actor && text.startsWith(actor) ? actor : null;
    return (
      <Link
        key={a.id}
        to="/c/$conversationId"
        params={{ conversationId: a.conversationId }}
        search={{ m: a.id }}
        className={cn("flex gap-3 rounded-md text-ui hover:bg-muted/50", compact ? "py-1" : "px-2 py-2")}
      >
        <span className="min-w-0 flex-1 text-muted-foreground">
          {lead ? (
            <>
              <span className="font-medium text-foreground">{lead}</span>
              {text.slice(lead.length)}
            </>
          ) : (
            text
          )}
          {a.discussion && <span className="text-muted-foreground/70"> {t.inDiscussion(a.discussion)}</span>}
        </span>
        <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
          {compact ? listTime(new Date(a.createdAt)) : new Date(a.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
        </span>
      </Link>
    );
  };
  if (compact) return <div className="flex flex-col gap-1">{data.slice(0, 6).map(row)}</div>;
  const days = new Map<string, ActivityRow[]>();
  for (const a of data) {
    const key = dayLabel(new Date(a.createdAt));
    days.set(key, [...(days.get(key) ?? []), a]);
  }
  return (
    <div className="flex flex-col gap-6">
      <h2 className="text-xl font-medium">{t.activity}</h2>
      {[...days].map(([day, rows]) => (
        <section key={day} className="flex flex-col gap-1">
          <h3 className="px-2 text-xs font-medium text-muted-foreground">{day}</h3>
          {rows.map(row)}
        </section>
      ))}
    </div>
  );
}
