import { defineMessages, useT } from "@/i18n";
import { auth, common, conversations } from "@agora/core/i18n";
import { useEventText } from "@/i18n/events";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { CalendarClockIcon, ClockIcon, CloseIcon, SplitIcon, FileTextIcon, KeyboardIcon, InboxIcon, LoaderIcon, TaskListIcon, LogOutIcon, MoonIcon, PlugIcon, PlusIcon, PuzzleIcon, SearchIcon, SlidersIcon, SparklesIcon, TerminalIcon, UserIcon } from "@/components/icons";
import { useState, type CSSProperties, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
import { BrandLogo } from "@/components/BrandLogo";
import { OrgLogo } from "@/components/OrgLogo";
import { mcpServersQuery } from "@/components/marketplace/data";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useOrgName } from "@/lib/org";
import type { ConversationSummary } from "@/lib/api";
import { listTime } from "@/lib/dates";
import { useTurns } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { ConversationAvatar, PersonAvatar } from "@/components/ConversationAvatar";
import { conversationTitle } from "@/lib/participants";
import { Marketplace } from "@/components/marketplace/Marketplace";
import { Button } from "@/components/ui/button";
import { ContextMenu, ContextMenuContent, ContextMenuGroup, ContextMenuItem, ContextMenuTrigger } from "@/components/ui/context-menu";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader } from "@/components/ui/empty";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth";
import { openProfile } from "@/lib/profile";
import { allCodeSessionsQuery } from "@/lib/code-sessions";
import { conversationsQuery, digestQuery, inboxQuery, tasksQuery } from "@/lib/queries";
import { setDigestOpen } from "@/lib/digest";
import { openSettings } from "@/lib/settings";
import { availabilityLabel, dndPresets, isAway, scheduleSettingsQuery, setDnd, useAvailability } from "@/lib/availability";
import { presenceQuery } from "@/lib/presence";
import { setOverlay, shortcuts } from "@/lib/shortcuts";
import { setWhatsNewOpen } from "@/lib/whats-new";
import { ShortcutKeys, ShortcutTooltip } from "@/components/Shortcuts";
import { openBeside, openHere, startTabDrag, tabPath, writeSize } from "@/lib/workspace";

const messages = defineMessages({
  en: {
    ...conversations.en,
    signOut: auth.en.signOut,
    searchConversation: "Search conversations",
    noMatch: "No conversation matches.",
    listError: "Conversations can't be reached right now.",
    openTasks: (n: number) => `${n} open task${n > 1 ? "s" : ""}`,
    inbox: "Inbox",
    inboxShort: "Inbox",
    tasksShort: "Tasks",
    sessionsShort: "Sessions",
    waitingSessions: (n: number) => `${n} waiting for you`,
    unreadInbox: (n: number) => `${n} unread`,
    profile: "My profile",
    settings: "Settings",
    dnd: "Do not disturb",
    dndOff: "Turn off",
    dndTurnedOn: "Do not disturb is on.",
    dndTurnedOff: "Do not disturb is off.",
    schedule: "Hours and absences…",
    shortcuts: "Keyboard shortcuts",
    whatsNew: "What's new",
    digest: "Morning recap",
    toggleSidebar: "Show or hide the sidebar",
    openInTab: "Open in a new tab",
    openBeside: "Open beside",
    resize: "Resize the sidebar",
    conversations: "Conversations",
    agents: "Agents",
    team: "Team",
    working: "Working",
    waiting: "Waits for your answer",
  },
  fr: {
    ...conversations.fr,
    signOut: auth.fr.signOut,
    searchConversation: "Rechercher une conversation",
    noMatch: "Aucune conversation ne correspond.",
    listError: "Les conversations sont injoignables pour le moment.",
    openTasks: (n: number) => `${n} tâche${n > 1 ? "s" : ""} en cours`,
    inbox: "Boîte de réception",
    inboxShort: "Boîte",
    tasksShort: "Tâches",
    sessionsShort: "Sessions",
    waitingSessions: (n: number) => `${n} t'attend${n > 1 ? "ent" : ""}`,
    unreadInbox: (n: number) => `${n} non lue${n > 1 ? "s" : ""}`,
    profile: "Mon profil",
    settings: "Paramètres",
    dnd: "Ne pas déranger",
    dndOff: "Désactiver",
    dndTurnedOn: "Ne pas déranger activé.",
    dndTurnedOff: "Ne pas déranger désactivé.",
    schedule: "Horaires et absences…",
    shortcuts: "Raccourcis clavier",
    whatsNew: "Nouveautés",
    digest: "Récap du matin",
    toggleSidebar: "Afficher ou masquer la barre latérale",
    openInTab: "Ouvrir dans un nouvel onglet",
    openBeside: "Ouvrir à côté",
    resize: "Redimensionner la barre latérale",
    conversations: "Conversations",
    agents: "Agents",
    team: "Équipe",
    working: "Au travail",
    waiting: "Attend ta réponse",
  },
});

/** The list's width until dragged, and how far it can be dragged (px). */
export const SIDEBAR_WIDTH = 300;
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;
const clampWidth = (px: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)));

/**
 * Desktop: the conversation list, a panel on the grey chrome beside the workspace (hidden with ⌘B
 * or outside the Conversations zone of the rail), its edge dragged to widen it.
 * Mobile: the list is the home screen, full width, and hides as soon as a thread is open.
 */
export function AppSidebar({ width, onWidthChange }: { width: number; onWidthChange: (px: number) => void }) {
  const { isMobile, open } = useSidebar();
  const atRoot = useLocation({ select: (l) => l.pathname === "/" });
  if (!isMobile) {
    if (!open) return null;
    return (
      <Sidebar collapsible="none" style={{ "--sidebar-width": `${width}px` } as CSSProperties} className="relative shrink-0 border-r">
        <DesktopSidebar />
        <SidebarResizer width={width} onWidthChange={onWidthChange} />
      </Sidebar>
    );
  }
  return atRoot ? (
    <Sidebar collapsible="none" className="h-dvh w-full">
      <SidebarBody />
    </Sidebar>
  ) : null;
}

/**
 * The sidebar's right edge: dragged (or moved with the arrow keys) to change its width, double
 * clicked to reset it; dragged well past its narrowest, it folds to the icon rail.
 */
function SidebarResizer({ width, onWidthChange }: { width: number; onWidthChange: (px: number) => void }) {
  const t = useT(messages);
  const { setOpen } = useSidebar();
  const resize = (px: number) => {
    onWidthChange(px);
    writeSize("sidebar", px);
  };
  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const el = e.currentTarget;
    const startX = e.clientX;
    let last = width;
    el.setPointerCapture(e.pointerId);
    document.body.dataset.resizing = "";
    const move = (ev: globalThis.PointerEvent) => {
      const raw = width + ev.clientX - startX;
      if (raw < SIDEBAR_MIN - 80) {
        end();
        setOpen(false);
        return;
      }
      last = clampWidth(raw);
      onWidthChange(last);
    };
    const end = () => {
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      delete document.body.dataset.resizing;
      writeSize("sidebar", last);
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 48 : 16;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      resize(clampWidth(width + (e.key === "ArrowRight" ? step : -step)));
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      resize(e.key === "Home" ? SIDEBAR_MIN : SIDEBAR_MAX);
    }
  };
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t.resize}
      aria-valuenow={width}
      aria-valuemin={SIDEBAR_MIN}
      aria-valuemax={SIDEBAR_MAX}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => resize(SIDEBAR_WIDTH)}
      onKeyDown={onKeyDown}
      className="absolute inset-y-0 right-0 z-20 w-2 cursor-col-resize outline-none after:absolute after:inset-y-0 after:right-0 after:w-0.5 after:transition-colors hover:after:bg-ring/50 focus-visible:after:bg-ring"
    />
  );
}

/**
 * Desktop links of the sidebar: ⌘/Ctrl-click or a middle click opens in a new tab, and they can be
 * dragged onto a pane (its edges open a new pane).
 */
function tabLink(path: string, desktop: boolean) {
  if (!desktop) return {};
  return {
    onClick: (e: MouseEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.shiftKey || e.altKey) return;
      e.preventDefault();
      openHere(path, true);
    },
    onAuxClick: (e: MouseEvent) => {
      if (e.button !== 1) return;
      e.preventDefault();
      openHere(path, true);
    },
    onDragStart: (e: DragEvent) => startTabDrag(e, path),
  };
}

function SidebarBody() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const { user } = useRouteContext({ from: "/app" });
  const pathname = useLocation({ select: (l) => l.pathname });
  const { isMobile } = useSidebar();
  const [q, setQ] = useState("");
  const t = useT(messages);
  const [market, setMarket] = useState(false);
  const conversationList = useQuery(conversationsQuery);
  const { data: conversations = [], isPending } = conversationList;
  const list = conversations
    .map((c) => ({ ...c, name: conversationTitle(c, user.id) }))
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  // Agents: a direct conversation with a bot; the team: colleagues and groups.
  const withAgent = list.filter((c) => c.kind === "direct" && c.agents.length > 0);
  const team = list.filter((c) => !(c.kind === "direct" && c.agents.length > 0));
  const isAdmin = user.role === "admin";
  const { data: tasks } = useQuery(tasksQuery(user.id));
  // Badge: what you have to do yourself, not what you gave to others.
  // Only whether there are any: the sidebar is not redrawn at each step of a session at work.
  const { data: hasSessions = false } = useQuery({ ...allCodeSessionsQuery, select: (list) => list.length > 0 });
  const openTasks = tasks?.filter((x) => x.status !== "done" && x.assignees.some((a) => a.id === user.id)).length ?? 0;
  const { data: inbox } = useQuery(inboxQuery());
  const unreadInbox = inbox?.unread ?? 0;

  const rows = (items: typeof list) =>
    items.map((c) => <ConversationRow key={c.id} conversation={c} active={conversationId === c.id} desktop={!isMobile} />);

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center gap-2 p-2">
          <h2 className="text-lg font-semibold">{t.conversations}</h2>
          <ShortcutTooltip label={t.newConversation} shortcut={shortcuts.newConversation}>
            <Button variant="outline" size="icon-sm" aria-label={t.newConversation} nativeButton={false} render={<Link to="/new" {...tabLink("/new", !isMobile)} />} className="ml-auto">
              <PlusIcon />
            </Button>
          </ShortcutTooltip>
        </div>
        <ConversationSearch value={q} onChange={setQ} />
      </SidebarHeader>

      <SidebarContent role="navigation" aria-label={t.conversations}>
        {isPending && <ListSkeleton />}
        {!isPending && !list.length && <EmptyList query={conversations.length > 0} list={conversationList} />}
        {withAgent.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t.agents}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{rows(withAgent)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
        {team.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t.team}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>{rows(team)}</SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* On a phone there is no rail: its destinations stay at the bottom of the list. */}
      {isMobile && (
        <SidebarFooter>
          <SidebarMenu>
            {isAdmin && (
              <SidebarMenuItem>
                <SidebarMenuButton onClick={() => setMarket(true)}>
                  <PuzzleIcon />
                  <span>{t.marketplace}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <SidebarMenuButton isActive={pathname.startsWith("/inbox")} render={<Link to="/inbox" />}>
                <InboxIcon />
                <span>{t.inbox}</span>
              </SidebarMenuButton>
              {unreadInbox > 0 && <SidebarMenuBadge aria-label={t.unreadInbox(unreadInbox)}>{unreadInbox}</SidebarMenuBadge>}
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton isActive={pathname.startsWith("/tasks")} render={<Link to="/tasks" />}>
                <TaskListIcon />
                <span>{t.tasks}</span>
              </SidebarMenuButton>
              {openTasks > 0 && <SidebarMenuBadge aria-label={t.openTasks(openTasks)}>{openTasks}</SidebarMenuBadge>}
            </SidebarMenuItem>
            {hasSessions && (
              <SidebarMenuItem>
                <SidebarMenuButton isActive={pathname.startsWith("/sessions")} render={<Link to="/sessions" />}>
                  <TerminalIcon />
                  <span>{t.sessionsShort}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )}
            <SidebarMenuItem>
              <UserMenu user={user} />
            </SidebarMenuItem>
          </SidebarMenu>
          {market && <Marketplace onClose={() => setMarket(false)} />}
        </SidebarFooter>
      )}
    </>
  );
}

/**
 * Desktop: search and new conversation, the organisation at the top (its recap on click), the inbox,
 * the tasks and the sessions, then every conversation in one flat list.
 * At the bottom, the apps (Marketplace) and your account.
 */
function DesktopSidebar() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const { user } = useRouteContext({ from: "/app" });
  const pathname = useLocation({ select: (l) => l.pathname });
  const t = useT(messages);
  const org = useOrgName();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [market, setMarket] = useState(false);
  const conversationList = useQuery(conversationsQuery);
  const { data: conversations = [], isPending } = conversationList;
  const { data: digest } = useQuery(digestQuery);
  const unreadInbox = useQuery(inboxQuery()).data?.unread ?? 0;
  // Claude Code sessions: the pill once there are any; its count, those waiting on your answer.
  // Whether there are any, and how many wait on you: picked out, so a session's every step does not redraw the sidebar.
  const { data: sessionsPill } = useQuery({
    ...allCodeSessionsQuery,
    select: (list) => ({ any: list.length > 0, waiting: list.filter((s) => s.status === "waiting" && s.requestedBy === user.id).length }),
  });
  const waitingSessions = sessionsPill?.waiting ?? 0;
  const list = conversations
    .map((c) => ({ ...c, name: conversationTitle(c, user.id) }))
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const closeSearch = () => {
    setSearching(false);
    setQ("");
  };

  return (
    <>
      <SidebarHeader>
        {/* Who this space is (opens the morning recap when there is one), then search and new. */}
        <div className="flex items-center gap-2">
          <SidebarMenu className="min-w-0 flex-1">
            <SidebarMenuItem>
              <SidebarMenuButton
                aria-label={digest ? t.digest : undefined}
                onClick={digest ? () => setDigestOpen(true) : undefined}
                render={digest ? undefined : <div />}
                className="font-medium"
              >
                <OrgLogo className="size-5" />
                <span className="truncate">{org}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant={searching ? "secondary" : "outline"}
                  size="icon-sm"
                  aria-label={t.searchConversation}
                  aria-pressed={searching}
                  onClick={() => (searching ? closeSearch() : setSearching(true))}
                />
              }
            >
              <SearchIcon />
            </TooltipTrigger>
            <TooltipContent>{t.searchConversation}</TooltipContent>
          </Tooltip>
          <ShortcutTooltip label={t.newConversation} shortcut={shortcuts.newConversation}>
            <Button variant="outline" size="icon-sm" aria-label={t.newConversation} nativeButton={false} render={<Link to="/new" {...tabLink("/new", true)} />}>
              <PlusIcon />
            </Button>
          </ShortcutTooltip>
        </div>
        {searching && <ConversationSearch value={q} onChange={setQ} onEscape={closeSearch} autoFocus />}
      </SidebarHeader>

      {/* Inbox, tasks and sessions on one line, as icons with what waits. */}
      {!searching && (
        <div className="flex items-center gap-1 px-2">
          <ShortcutItem to="/inbox" active={pathname.startsWith("/inbox")} icon={<InboxIcon />} label={t.inboxShort} count={unreadInbox} countLabel={t.unreadInbox(unreadInbox)} />
          <ShortcutItem to="/tasks" active={pathname.startsWith("/tasks")} icon={<TaskListIcon />} label={t.tasksShort} />
          {sessionsPill?.any && (
            <ShortcutItem to="/sessions" active={pathname.startsWith("/sessions")} icon={<TerminalIcon />} label={t.sessionsShort} count={waitingSessions} countLabel={t.waitingSessions(waitingSessions)} />
          )}
        </div>
      )}

      <SidebarContent role="navigation" aria-label={t.conversations}>
        {isPending && <ListSkeleton />}
        {!isPending && !list.length && <EmptyList query={conversations.length > 0} list={conversationList} />}
        {list.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>{t.conversations}</SidebarGroupLabel>
            <SidebarGroupContent>
              {/* A little air between rows: the open one and the hovered one stay two rows. */}
              <SidebarMenu className="gap-1">
                {list.map((c) => (
                  <ConversationRow key={c.id} conversation={c} active={conversationId === c.id} desktop />
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      {/* Your account, and the apps installed in the organisation. */}
      <SidebarFooter>
        <SidebarMenu>
          {user.role === "admin" && <AppsItem onClick={() => setMarket(true)} label={t.marketplace} />}
          <SidebarMenuItem>
            <UserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
        {user.role === "admin" && market && <Marketplace onClose={() => setMarket(false)} />}
      </SidebarFooter>
    </>
  );
}

/** The search field over the conversation list. */
function ConversationSearch({ value, onChange, onEscape, autoFocus }: { value: string; onChange: (q: string) => void; onEscape?: () => void; autoFocus?: boolean }) {
  const t = useT(messages);
  const tc = useT(common);
  return (
    <InputGroup>
      <InputGroupInput
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onEscape?.()}
        placeholder={tc.search}
        aria-label={t.searchConversation}
      />
      <InputGroupAddon>
        <SearchIcon />
      </InputGroupAddon>
    </InputGroup>
  );
}

function ListSkeleton() {
  return (
    <SidebarGroup>
      <SidebarMenu>
        {[0, 1, 2].map((i) => (
          <SidebarMenuItem key={i}>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        ))}
      </SidebarMenu>
    </SidebarGroup>
  );
}

/** Nothing in the list: none yet, none matching the search (`query`), or the list couldn't be fetched. */
function EmptyList({ query, list }: { query: boolean; list: { error: Error | null; refetch: () => unknown } }) {
  const t = useT(messages);
  const tc = useT(common);
  if (list.error && !query)
    return (
      <Empty>
        <EmptyHeader>
          <EmptyDescription title={list.error.message}>{t.listError}</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button variant="secondary" size="sm" onClick={() => void list.refetch()}>
            {tc.retry}
          </Button>
        </EmptyContent>
      </Empty>
    );
  return (
    <Empty>
      <EmptyHeader>
        <EmptyDescription>{query ? t.noMatch : t.empty}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

/** A destination above the list (inbox, tasks, sessions), with what waits for you. */
function ShortcutItem({ to, active, icon, label, count = 0, countLabel }: { to: string; active: boolean; icon: ReactNode; label: string; count?: number; countLabel?: string }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant={active ? "secondary" : "ghost"}
            size={count > 0 ? "sm" : "icon-sm"}
            aria-label={count > 0 ? `${label}, ${countLabel}` : label}
            nativeButton={false}
            render={<Link to={to} {...tabLink(to, true)} aria-current={active ? "page" : undefined} />}
          />
        }
      >
        {icon}
        {count > 0 && <span className="tabular-nums">{count}</span>}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** The logos of the first connectors installed; opens the Marketplace. */
function AppsItem({ onClick, label }: { onClick: () => void; label: string }) {
  const { data } = useQuery(mcpServersQuery);
  const servers = (data?.servers ?? []).slice(0, 3);
  return (
    <SidebarMenuItem>
      <SidebarMenuButton onClick={onClick}>
        {servers.length ? servers.map((s) => <BrandLogo key={s.name} server={s.name} fallback={<PlugIcon />} className="size-4 rounded-sm" />) : <PuzzleIcon />}
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  );
}

/**
 * A conversation: avatar, name and time, then the last message, or what the bot is doing.
 * Waiting for your answer: an orange dot (the only state asking you to act). Unread: a blue dot.
 */
function ConversationRow({ conversation: c, active, desktop }: { conversation: ConversationSummary & { name: string }; active: boolean; desktop: boolean }) {
  const { user } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  const tc = useT(common);
  const eventText = useEventText();
  const turns = useTurns(c.id);
  const waiting = turns.some((x) => x.approval);
  const working = !waiting && turns.length > 0;
  const path = tabPath.conversation(c.id);
  const unread = c.unread && !active;
  return (
    <SidebarMenuItem>
      <ContextMenu disabled={!desktop}>
        <ContextMenuTrigger
          render={
            <SidebarMenuButton
              size="lg"
              isActive={active}
              render={<Link to="/c/$conversationId" params={{ conversationId: c.id }} {...tabLink(path, desktop)} aria-current={active ? "page" : undefined} />}
            />
          }
        >
          {/* Presence only for colleagues: what a bot is doing is said on the second line. */}
          <ConversationAvatar conversation={c} me={user.id} className="size-7" status={c.agents.length ? undefined : active ? "ring-sidebar-accent" : "ring-sidebar"} />
          <span className="grid min-w-0 flex-1">
            <span className="flex items-center gap-2">
              {/* min-w-0: a long name truncates instead of pushing the time out of the row. */}
              <span className="min-w-0 truncate font-medium">{c.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{listTime(new Date(c.lastAt))}</span>
            </span>
            <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
              {waiting ? (
                <span className="truncate">{t.waiting}</span>
              ) : working ? (
                <>
                  <LoaderIcon className="animate-spin" />
                  <span className="truncate">{t.working}</span>
                </>
              ) : (
                // « Pixel est prêt » under Pixel's name says nothing: a list preview is a message, not a setup event.
                c.preview &&
                c.preview.event?.type !== "agent.ready" && (
                  <span className="truncate">
                    {c.preview.fromMe ? t.prefix(tc.you) : c.preview.author && c.kind === "group" && t.prefix(c.preview.author)}
                    {plainPreview(eventText(c.preview.text, c.preview.event))}
                  </span>
                )
              )}
              {waiting ? (
                <span className="ml-auto size-2 shrink-0 rounded-full bg-warning" />
              ) : (
                unread && <span className="ml-auto size-2 shrink-0 rounded-full bg-brand" role="status" aria-label={t.unread} />
              )}
            </span>
          </span>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-56">
          <ContextMenuGroup>
            <ContextMenuItem onClick={() => openHere(path, true)}>
              <PlusIcon />
              {t.openInTab}
            </ContextMenuItem>
            <ContextMenuItem onClick={() => openBeside(path)}>
              <SplitIcon />
              {t.openBeside}
            </ContextMenuItem>
          </ContextMenuGroup>
        </ContextMenuContent>
      </ContextMenu>
    </SidebarMenuItem>
  );
}

export function UserMenu({ user }: { user: { id: string; name: string; image?: string | null } }) {
  const navigate = useNavigate();
  const t = useT(messages);
  const { data: digest } = useQuery(digestQuery);
  const me = useAvailability(user.id);
  const away = isAway(me);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton size="lg" tooltip={user.name} />}>
        <PersonAvatar person={{ id: user.id, name: user.name, image: user.image ?? null }} className="size-8" />
        <span className="min-w-0 flex-1 truncate">{user.name}</span>
        {away && <MoonIcon role="img" aria-label={availabilityLabel(me) ?? t.dnd} className="text-destructive" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => openProfile(user.id)}>
            <UserIcon /> {t.profile}
          </DropdownMenuItem>
          <DndMenu userId={user.id} />
          <DropdownMenuItem onClick={() => openSettings()}>
            <SlidersIcon /> {t.settings}
            <DropdownMenuShortcut>
              <ShortcutKeys shortcut={shortcuts.settings} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOverlay("help")}>
            <KeyboardIcon /> {t.shortcuts}
            <DropdownMenuShortcut>
              <ShortcutKeys shortcut={shortcuts.help} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          {digest && (
            <DropdownMenuItem onClick={() => setDigestOpen(true)}>
              <FileTextIcon /> {t.digest}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setWhatsNewOpen(true)}>
            <SparklesIcon /> {t.whatsNew}
          </DropdownMenuItem>
          <DropdownMenuItem
            variant="destructive"
            onClick={async () => {
              await authClient.signOut();
              navigate({ to: "/login" });
            }}
          >
            <LogOutIcon /> {t.signOut}
          </DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** "Do not disturb" for a while, or off; the full schedule lives in Settings. */
function DndMenu({ userId }: { userId: string }) {
  const t = useT(messages);
  const schedule = useQuery({ ...presenceQuery, select: (s) => s.schedules?.[userId] }).data;
  const status = useAvailability(userId);
  const qc = useQueryClient();
  const change = useMutation({
    mutationFn: (until: string | null) => setDnd(userId, until),
    // The live "availability" event does the same; this covers a disconnected stream.
    onSettled: () => qc.invalidateQueries({ queryKey: scheduleSettingsQuery(userId).queryKey }),
    meta: { success: (_: unknown, until: string | null) => (until ? t.dndTurnedOn : t.dndTurnedOff) },
  });
  const on = status.state === "dnd";
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <MoonIcon className={cn(on && "text-destructive")} /> {t.dnd}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {on ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{availabilityLabel(status)}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => change.mutate(null)}>
              <CloseIcon />
              {t.dndOff}
            </DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          schedule &&
          dndPresets(schedule).map((p) => (
            <DropdownMenuItem key={p.label} onClick={() => change.mutate(p.until)}>
              <ClockIcon />
              {p.label}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openSettings("availability")}>
          <CalendarClockIcon />
          {t.schedule}
        </DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

/** A message as one line of preview: markdown links kept as their words, bare addresses and markup left out. */
const plainPreview = (text: string) =>
  text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>]/g, "")
    .replace(/\s+/g, " ")
    .trim();
