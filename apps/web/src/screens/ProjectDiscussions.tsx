import { Link } from "@tanstack/react-router";
import { plainPreview } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useState } from "react";
import { PinIcon, SearchIcon } from "@/components/icons";
import { DiscussionMenu } from "@/components/ProjectTree";
import { Button } from "@/components/ui/button";
import { Empty, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { defineMessages, useT } from "@/i18n";
import { useEventText } from "@/i18n/events";
import type { ConversationSummary } from "@/lib/api";
import { listTime } from "@/lib/dates";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: {
    active: "Active",
    archived: "Archived",
    general: "General",
    newDiscussion: "New discussion",
    search: "Search discussions",
    noMatch: "No discussion matches.",
    noArchived: "No archived discussion.",
    pinned: "Pinned",
    actions: (name: string) => `Actions for ${name}`,
    prefix: (name: string) => `${name}: `,
  },
  fr: {
    active: "Actives",
    archived: "Archivées",
    general: "Général",
    newDiscussion: "Nouvelle discussion",
    search: "Rechercher une discussion",
    noMatch: "Aucune discussion ne correspond.",
    noArchived: "Aucune discussion archivée.",
    pinned: "Épinglée",
    actions: (name: string) => `Actions sur ${name}`,
    prefix: (name: string) => `${name} : `,
  },
});

type Named = ConversationSummary & { name: string };

/**
 * A project's Discussions tab (Figma « Projet · Agora · Discussions »): « General » first, the pinned
 * ones, then by last activity; or its archive. Searchable, each row's actions on hover.
 */
export function ProjectDiscussionList({ project, named, onCreate }: { project: Named; named: Named[]; onCreate: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const eventText = useEventText();
  const [tab, setTab] = useState<"active" | "archived">("active");
  const [q, setQ] = useState("");
  const projects = named.filter((x) => x.kind === "group" && !x.parentId);
  const query = q.trim().toLowerCase();
  const inside = named.filter((x) => x.parentId === project.id && x.archived === (tab === "archived"));
  const rows = [
    ...(tab === "active" ? [{ ...project, name: t.general }] : []),
    ...inside.filter((x) => x.pinned),
    ...inside.filter((x) => !x.pinned),
  ].filter((x) => x.name.toLowerCase().includes(query));

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-2">
        <Tabs value={tab} onValueChange={(v) => setTab(v as "active" | "archived")}>
          <TabsList>
            <TabsTrigger value="active">{t.active}</TabsTrigger>
            <TabsTrigger value="archived">{t.archived}</TabsTrigger>
          </TabsList>
        </Tabs>
        <InputGroup className="ml-auto w-full sm:w-56">
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={c.search} aria-label={t.search} />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
        <Button onClick={onCreate}>{t.newDiscussion}</Button>
      </div>
      {rows.length ? (
        <ItemGroup>
          {rows.map((d) => (
            <div key={d.id} className="group/row flex items-center">
              <Item size="sm" className="min-w-0 flex-1" render={<Link to="/c/$conversationId" params={{ conversationId: d.id }} />}>
                <ItemContent className="flex-row items-center gap-2">
                  <ItemTitle className={cn("shrink-0", !d.unread && "font-normal")}>{d.name}</ItemTitle>
                  {d.pinned && <PinIcon aria-label={t.pinned} className="size-3 shrink-0 text-muted-foreground" />}
                  {d.preview && (
                    <ItemDescription className="line-clamp-1 min-w-0">
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
    </div>
  );
}
