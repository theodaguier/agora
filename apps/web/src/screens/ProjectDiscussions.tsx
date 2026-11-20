import { useQuery } from "@tanstack/react-query";
import { Link, useParams, useRouteContext } from "@tanstack/react-router";
import { plainPreview } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useState } from "react";
import { ChevronLeftIcon, SearchIcon } from "@/components/icons";
import { ConversationAvatar } from "@/components/ConversationAvatar";
import { DiscussionMenu, NewDiscussionDialog } from "@/components/ProjectTree";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defineMessages, useT } from "@/i18n";
import { useEventText } from "@/i18n/events";
import { listTime } from "@/lib/dates";
import { useOrgTitle } from "@/lib/org";
import { conversationTitle } from "@/lib/participants";
import { conversationsQuery } from "@/lib/queries";

const messages = defineMessages({
  en: {
    discussions: "Discussions",
    back: "Back",
    active: "Active",
    archived: "Archived",
    general: "General",
    newDiscussion: "New discussion",
    search: "Search discussions",
    notFound: "This project doesn't exist, or you're not in it anymore.",
    noMatch: "No discussion matches.",
    noArchived: "No archived discussion.",
    actions: (name: string) => `Actions for ${name}`,
    prefix: (name: string) => `${name}: `,
  },
  fr: {
    discussions: "Discussions",
    back: "Retour",
    active: "Actives",
    archived: "Archivées",
    general: "Général",
    newDiscussion: "Nouvelle discussion",
    search: "Rechercher une discussion",
    notFound: "Ce projet n'existe pas, ou tu n'en fais plus partie.",
    noMatch: "Aucune discussion ne correspond.",
    noArchived: "Aucune discussion archivée.",
    actions: (name: string) => `Actions sur ${name}`,
    prefix: (name: string) => `${name} : `,
  },
});

/** Every discussion of a project (« See all » in the sidebar): the active ones or the archive, searchable, latest first. */
export function ProjectDiscussions() {
  const { projectId } = useParams({ from: "/app/p/$projectId" });
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  const c = useT(common);
  const eventText = useEventText();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const { data: list, isPending } = useQuery(conversationsQuery);
  const named = (list ?? []).map((x) => ({ ...x, name: conversationTitle(x, user.id) }));
  const project = named.find((x) => x.id === projectId && !x.parentId);
  useOrgTitle(project ? `${project.name} · ${t.discussions}` : t.discussions);
  const projects = named.filter((x) => x.kind === "group" && !x.parentId);
  const query = q.trim().toLowerCase();
  // The project's own thread is « General », always first among the active ones.
  const rows = project
    ? [
        ...(tab === "active" ? [{ ...project, name: t.general }] : []),
        ...named.filter((x) => x.parentId === project.id && x.archived === (tab === "archived")),
      ].filter((x) => x.name.toLowerCase().includes(query))
    : [];

  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 pt-6 pb-12 md:pt-10">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/" aria-label={t.back} />} className="-ml-2 md:hidden">
            <ChevronLeftIcon />
          </Button>
          {isPending ? (
            <div className="grid place-items-center py-16">
              <Spinner />
            </div>
          ) : !project ? (
            <Empty>
              <EmptyHeader>
                <EmptyDescription>{t.notFound}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <>
              <header className="flex items-center gap-3">
                <ConversationAvatar conversation={project} me={user.id} className="size-8" />
                <h1 className="min-w-0 flex-1 truncate text-xl font-medium">{project.name}</h1>
                <Button onClick={() => setCreating(true)}>{t.newDiscussion}</Button>
                <NewDiscussionDialog project={project} open={creating} onOpenChange={setCreating} />
              </header>
              <div className="flex flex-wrap items-center gap-2">
                <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
                  <TabsList>
                    <TabsTrigger value="active">{t.active}</TabsTrigger>
                    <TabsTrigger value="archived">{t.archived}</TabsTrigger>
                  </TabsList>
                </Tabs>
                <InputGroup className="ml-auto w-full sm:w-64">
                  <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.search} aria-label={t.search} />
                  <InputGroupAddon>
                    <SearchIcon />
                  </InputGroupAddon>
                </InputGroup>
              </div>
              {rows.length ? (
                <ItemGroup>
                  {rows.map((d) => (
                    <div key={d.id} className="group/row flex items-center">
                      <Item className="min-w-0 flex-1" render={<Link to="/c/$conversationId" params={{ conversationId: d.id }} />}>
                        <ItemContent>
                          <ItemTitle className={d.unread ? undefined : "font-normal"}>{d.name}</ItemTitle>
                          {d.preview && (
                            <ItemDescription className="line-clamp-1">
                              {d.preview.fromMe ? t.prefix(c.you) : d.preview.author && t.prefix(d.preview.author)}
                              {plainPreview(eventText(d.preview.text, d.preview.event))}
                            </ItemDescription>
                          )}
                        </ItemContent>
                        <ItemActions className="text-xs text-muted-foreground tabular-nums">{listTime(new Date(d.lastAt))}</ItemActions>
                      </Item>
                      {d.parentId && (
                        <DiscussionMenu
                          discussion={d}
                          projects={projects}
                          trigger={<Button variant="ghost" size="icon-sm" aria-label={t.actions(d.name)} className="opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100" />}
                        />
                      )}
                    </div>
                  ))}
                </ItemGroup>
              ) : (
                <Empty>
                  <EmptyHeader>
                    <EmptyTitle>{query ? t.noMatch : t.noArchived}</EmptyTitle>
                  </EmptyHeader>
                </Empty>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
