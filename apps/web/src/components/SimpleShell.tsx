import { historyBucket, type HistoryBucket } from "@agora/core";
import { conversations, simple } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { Link, Outlet, useParams, useRouteContext } from "@tanstack/react-router";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ChevronDownIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { OrgLogo } from "@/components/OrgLogo";
import { PlanRows, usePlans } from "@/components/PlanLimits";
import { UserMenu } from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { AgentAvatar } from "@/components/AgentAvatar";
import { Skeleton } from "@/components/ui/skeleton";
import { Item, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { ListCard, ListCardRows } from "@/components/list-card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useT } from "@/i18n";
import type { ConversationSummary } from "@/lib/api";
import { useOrgName, useOrgTitle } from "@/lib/org";
import { conversationTitle } from "@/lib/participants";
import { conversationsQuery } from "@/lib/queries";
import { defaultAssistant, useAssistants, useNewChat } from "@/lib/simple";

/*
 * Figma « Mode simple », 5 · Simple interface — web: the same shell as the full app, emptied. The sidebar
 * holds the history (a new chat, search, the chats by day), then at the bottom the coding subscriptions
 * (their owner only) and the account; the panel, the open chat. Projects stay out of the list: what concerns them there comes to their chat from their assistant.
 */

const ORDER: HistoryBucket[] = ["today", "yesterday", "week", "month", "older"];
const WIDTH = 260;

export function SimpleShell({ overlays }: { overlays: React.ReactNode }) {
  return (
    <SidebarProvider defaultOpen style={{ "--sidebar-width": `${WIDTH}px` } as CSSProperties} className="h-dvh min-h-0 overflow-hidden">
      <div className="flex min-w-0 flex-1 bg-sidebar">
        <HistorySidebar />
        <main className="flex min-w-0 flex-1 overflow-hidden bg-background md:my-2 md:mr-2 md:rounded-lg md:border">
          <Outlet />
        </main>
      </div>
      {overlays}
    </SidebarProvider>
  );
}

/** Desktop: beside the chat. Phone: a sheet over it, opened from the chat's header (SidebarTrigger). */
function HistorySidebar() {
  const { isMobile } = useSidebar();
  return (
    <Sidebar collapsible={isMobile ? "offcanvas" : "none"} className="shrink-0">
      <History />
    </Sidebar>
  );
}

function History() {
  const t = useT(simple);
  const tc = useT(conversations);
  const { user } = useRouteContext({ from: "/app" });
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const { setOpenMobile } = useSidebar();
  const org = useOrgName();
  const { data: list = [], isPending } = useQuery(conversationsQuery);
  const agents = useAssistants().data ?? [];
  const newChat = useNewChat();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const chats = list.filter((c) => c.kind === "direct" && !!c.preview).map((c) => ({ ...c, name: conversationTitle(c, user.id) }));
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = chats.filter((c) => words.every((w) => `${c.name} ${c.preview?.text ?? ""}`.toLowerCase().includes(w)));
  const buckets = ORDER.map((b) => ({ key: b, rows: shown.filter((c) => historyBucket(new Date(c.lastAt)) === b) })).filter((b) => b.rows.length);
  const next = defaultAssistant(agents, list);
  // The coding subscriptions and how much of their limits is used: their owner only, like the full sidebar.
  const plans = usePlans();

  return (
    <>
      <SidebarHeader className="px-3 pt-3.5 pb-0">
        <div className="flex h-9 items-center gap-1">
          <span className="flex min-w-0 items-center gap-2 px-1 text-ui font-medium">
            <OrgLogo className="size-4.5" />
            <span className="truncate">{org}</span>
          </span>
          <span className="flex-1" />
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="ghost" size="icon-sm" aria-label={t.search} aria-pressed={searching} onClick={() => (setSearching((s) => !s), setQ(""))} />}
            >
              <SearchIcon />
            </TooltipTrigger>
            <TooltipContent>{t.search}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={<Button variant="secondary" size="icon-sm" aria-label={t.newChat} disabled={!next} onClick={() => next && (newChat.mutate(next), setOpenMobile(false))} />}
            >
              <PlusIcon />
            </TooltipTrigger>
            <TooltipContent>{t.newChat}</TooltipContent>
          </Tooltip>
        </div>
        {searching && (
          <InputGroup className="mt-2">
            <InputGroupInput autoFocus value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Escape" && (setSearching(false), setQ(""))} placeholder={t.search} aria-label={t.search} />
            <InputGroupAddon>
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
        )}
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label={t.menu} className="gap-0 px-1">
        {isPending && (
          <SidebarGroup className="pt-5.5">
            {[0, 1, 2, 3].map((i) => (
              <SidebarMenuSkeleton key={i} />
            ))}
          </SidebarGroup>
        )}
        {!isPending && !!words.length && !buckets.length && (
          <Empty className="flex-none py-8">
            <EmptyHeader>
              <EmptyDescription>{t.noMatch}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {buckets.map((b, i) => (
          <SidebarGroup key={b.key} className={i === 0 ? "pt-5.5" : "pt-3.5"}>
            <SidebarGroupLabel className="h-auto pb-1 leading-4.25 font-normal text-muted-foreground">{t.history[b.key]}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-px">
                {b.rows.map((c) => (
                  <HistoryRow key={c.id} chat={c} active={c.id === conversationId} unreadLabel={tc.unread} onOpen={() => setOpenMobile(false)} />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-3 pb-1.5">
        {plans.length > 0 && (
          <SidebarGroup className="p-0 pb-1">
            <SidebarGroupLabel className="h-auto pb-1 leading-4.25 font-normal text-muted-foreground">{t.subscriptions}</SidebarGroupLabel>
            <SidebarMenu className="gap-px">
              <PlanRows plans={plans} />
            </SidebarMenu>
          </SidebarGroup>
        )}
        <SidebarMenu className="gap-px">
          <SidebarMenuItem>
            <UserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </>
  );
}

function HistoryRow({ chat: c, active, unreadLabel, onOpen }: { chat: ConversationSummary & { name: string }; active: boolean; unreadLabel: string; onOpen: () => void }) {
  const unread = c.unread && !active;
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        isActive={active}
        className="h-7.5 gap-2.5 text-ui data-active:font-normal"
        render={<Link to="/c/$conversationId" params={{ conversationId: c.id }} aria-current={active ? "page" : undefined} onClick={onOpen} />}
      >
        <span className="min-w-0 flex-1 truncate">{c.name}</span>
        {unread && <span role="status" aria-label={unreadLabel} className="size-1.5 shrink-0 rounded-full bg-brand" />}
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/** The simple interface's home: a new chat with the assistant of the latest one; what came meanwhile is listed in it (UnreadCard). */
export function SimpleHome() {
  const t = useT(simple);
  const agents = useAssistants();
  const chats = useQuery(conversationsQuery);
  const newChat = useNewChat();
  const asked = useRef(false);
  useOrgTitle();
  useEffect(() => {
    if (asked.current || !agents.data || !chats.data) return;
    const agentId = defaultAssistant(agents.data, chats.data);
    if (!agentId) return;
    asked.current = true;
    newChat.mutate(agentId);
  }, [agents.data, chats.data, newChat]);
  if (agents.data && !agents.data.length)
    return (
      <Empty className="m-auto max-w-sm flex-none">
        <EmptyHeader>
          <EmptyDescription>{t.noAssistant}</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  return (
    <div className="grid h-full flex-1 place-items-center">
      <Skeleton className="h-10 w-64" />
    </div>
  );
}

/**
 * The chat's header in the simple interface: the history (a phone's sheet), the assistant's name (a menu of
 * every assistant opened to them: picking another starts a chat with it) and "New chat".
 */
export function SimpleChatTitle({
  agentId,
  botName,
  title,
  onBehalfOf,
  conversationId,
}: {
  agentId: string | null;
  botName: string | null;
  title: string;
  /** A colleague's assistant writing for them: its name, then « pour Théo Daguier » under it. */
  onBehalfOf: string | null;
  conversationId: string;
}) {
  const t = useT(simple);
  const agents = useAssistants().data ?? [];
  const newChat = useNewChat();
  const { isMobile } = useSidebar();
  const unread = useUnreadChats(conversationId).length;
  // A colleague's assistant writing for them, or a colleague: the conversation's own title.
  const current = agents.find((a) => a.id === agentId);
  const next = current?.id ?? agents[0]?.id ?? null;
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1">
      {isMobile && (
        <span className="relative">
          <SidebarTrigger aria-label={unread ? `${t.menu}, ${t.newMessages(unread)}` : t.menu} />
          {unread > 0 && <span aria-hidden className="pointer-events-none absolute top-1 right-1 size-1.5 rounded-full bg-brand" />}
        </span>
      )}
      {onBehalfOf ? (
        <span className="flex min-w-0 flex-col px-1 leading-tight">
          <span className="truncate text-ui font-medium">{botName ?? title}</span>
          <span className="truncate text-xs text-muted-foreground">{t.forPerson(onBehalfOf)}</span>
        </span>
      ) : current && agents.length > 1 ? (
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="-ml-1 min-w-0 gap-1.5 px-2 text-ui font-medium" aria-label={t.chooseAssistant} />}>
            <AgentAvatar agent={current} className="size-4.5" />
            <span className="truncate">{current.name}</span>
            <ChevronDownIcon className="size-3 text-muted-foreground" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuRadioGroup value={current.id} onValueChange={(id) => id !== current.id && newChat.mutate(id as string)}>
              {agents.map((a) => (
                <DropdownMenuRadioItem key={a.id} value={a.id} className="items-start">
                  <AgentAvatar agent={a} className="mt-0.5 size-4" />
                  <span className="flex min-w-0 flex-col">
                    {a.name}
                    {a.role && <span className="text-xs text-muted-foreground">{a.role}</span>}
                  </span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <span className="min-w-0 truncate px-1 text-ui font-medium">{current?.name ?? title}</span>
      )}
      <span className="flex-1" />
      {next && (
        <Tooltip>
          <TooltipTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.newChat} onClick={() => newChat.mutate(next)} />}>
            <PlusIcon />
          </TooltipTrigger>
          <TooltipContent>{t.newChat}</TooltipContent>
        </Tooltip>
      )}
    </div>
  );
}

/** Chats of the history with something unread (a routine's result, a colleague's assistant, an inbox item). */
export function useUnreadChats(except?: string) {
  return (
    useQuery({
      ...conversationsQuery,
      select: (list: ConversationSummary[]) => list.filter((c) => c.kind === "direct" && c.unread && c.id !== except),
    }).data ?? []
  );
}

/**
 * Figma « Mode simple », 7 · Ouverture normale: a new chat lists what came meanwhile above the composer;
 * one click opens it, and once read it leaves the list.
 */
export function UnreadCard({ current }: { current: string }) {
  const t = useT(simple);
  const tc = useT(conversations);
  const { user } = useRouteContext({ from: "/app" });
  const unread = useUnreadChats(current);
  if (!unread.length) return null;
  return (
    <div className="mt-6 flex w-full max-w-md flex-col gap-2 text-left">
      <p className="px-1 text-xs text-muted-foreground">{t.newMessages(unread.length)}</p>
      <ListCard size="sm">
        <ListCardRows>
          {unread.map((c) => {
            const name = conversationTitle(c, user.id);
            const preview = c.preview ? `${c.preview.author ? tc.prefix(c.preview.author) : ""}${c.preview.text}` : "";
            return (
              <Item key={c.id} size="xs" render={<Link to="/c/$conversationId" params={{ conversationId: c.id }} />}>
                <ItemContent className="min-w-0">
                  <ItemTitle className="font-semibold">{name}</ItemTitle>
                  {preview && <ItemDescription className="truncate">{preview}</ItemDescription>}
                </ItemContent>
                <span role="status" aria-label={tc.unread} className="size-1.5 shrink-0 rounded-full bg-brand" />
              </Item>
            );
          })}
        </ListCardRows>
      </ListCard>
    </div>
  );
}
