import { defineMessages, useT } from "@/i18n";
import { auth, common, conversations } from "@agora/core/i18n";
import { useEventText } from "@/i18n/events";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { FileTextIcon, KeyboardIcon, InboxIcon, LoaderIcon, TaskListIcon, LogOutIcon, MoonIcon, PlugIcon, PlusIcon, PuzzleIcon, SearchIcon, SlidersIcon, SparklesIcon, TerminalIcon, UserIcon } from "@/components/icons";
import { useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent, type ReactNode } from "react";
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
import { Sidebar, SidebarFooter, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem, SidebarMenuSkeleton, useSidebar } from "@/components/ui/sidebar";
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
      <aside style={{ width }} className="relative flex shrink-0 flex-col overflow-hidden border-r border-border bg-sidebar text-sidebar-foreground">
        <DesktopSidebar />
        <SidebarResizer width={width} onWidthChange={onWidthChange} />
      </aside>
    );
  }
  return atRoot ? <Sidebar collapsible="none" className="h-dvh w-full"><SidebarBody /></Sidebar> : null;
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
  const tc = useT(common);
  const t = useT(messages);
  const [market, setMarket] = useState(false);
  const { data: conversations = [], isPending } = useQuery(conversationsQuery);
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
      <div className="flex flex-col gap-0.5 px-2.5 pt-[18px]">
        <div className="flex items-center pb-3 pl-2">
          <h2 className="text-[17px] leading-[22px] font-semibold tracking-[-0.3px]">{t.conversations}</h2>
          <ShortcutTooltip label={t.newConversation} shortcut={shortcuts.newConversation}>
            <Button variant="outline" size="icon-xs" aria-label={t.newConversation} nativeButton={false} render={<Link to="/new" {...tabLink("/new", !isMobile)} />} className="ml-auto size-6 rounded-[6px] [&_svg:not([class*='size-'])]:size-4">
              <PlusIcon />
            </Button>
          </ShortcutTooltip>
        </div>
        <InputGroup>
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={tc.search} aria-label={t.searchConversation} />
          <InputGroupAddon className="text-subtle [&>svg:not([class*='size-'])]:size-[15px]">
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
      </div>

      <nav aria-label={t.conversations} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2.5 pb-3">
        {isPending && [0, 1, 2].map((i) => <SidebarMenuSkeleton key={i} showIcon className="mt-2 h-[53px]" />)}
        {!isPending && conversations.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t.empty}</p>}
        {withAgent.length > 0 && (
          <>
            <ListLabel>{t.agents}</ListLabel>
            {rows(withAgent)}
          </>
        )}
        {team.length > 0 && (
          <>
            <ListLabel>{t.team}</ListLabel>
            {rows(team)}
          </>
        )}
      </nav>

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
 * Figma « Sidebar » (desktop): search and new conversation as round buttons, the organisation at the
 * top (its recap on click), the inbox and the tasks as pills, then every conversation in one flat list.
 * At the bottom, your account and the apps (Marketplace).
 */
function DesktopSidebar() {
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const { user } = useRouteContext({ from: "/app" });
  const pathname = useLocation({ select: (l) => l.pathname });
  const t = useT(messages);
  const tc = useT(common);
  const org = useOrgName();
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [market, setMarket] = useState(false);
  const { data: conversations = [], isPending } = useQuery(conversationsQuery);
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
      <div className="flex h-14 shrink-0 items-center justify-end gap-2 px-3">
        <Tooltip>
          <TooltipTrigger
            render={<RoundButton aria-label={t.searchConversation} aria-pressed={searching} onClick={() => (searching ? closeSearch() : setSearching(true))} />}
          >
            <SearchIcon />
          </TooltipTrigger>
          <TooltipContent>{t.searchConversation}</TooltipContent>
        </Tooltip>
        <ShortcutTooltip label={t.newConversation} shortcut={shortcuts.newConversation}>
          <RoundButton aria-label={t.newConversation} nativeButton={false} render={<Link to="/new" {...tabLink("/new", true)} />}>
            <PlusIcon />
          </RoundButton>
        </ShortcutTooltip>
      </div>

      {searching ? (
        <div className="px-3 pb-4">
          <InputGroup className="h-9 rounded-full bg-background">
            <InputGroupInput
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && closeSearch()}
              placeholder={tc.search}
              aria-label={t.searchConversation}
            />
            <InputGroupAddon className="text-subtle [&>svg:not([class*='size-'])]:size-[15px]">
              <SearchIcon />
            </InputGroupAddon>
          </InputGroup>
        </div>
      ) : (
        <>
          {/* Figma « Accueil »: who this space is; opens the morning recap when there is one. */}
          <button
            type="button"
            disabled={!digest}
            onClick={() => setDigestOpen(true)}
            aria-label={digest ? t.digest : undefined}
            className="mx-auto mb-4 flex flex-col items-center gap-2 rounded-2xl px-3 pt-1 pb-0.5 outline-none enabled:hover:bg-black/4 focus-visible:ring-3 focus-visible:ring-ring/30 dark:enabled:hover:bg-white/5"
          >
            <OrgLogo className="size-[52px]" />
            <span className="text-sm leading-5">{org}</span>
          </button>
          {/* Figma « Raccourcis ». */}
          <div className="flex gap-1 px-3 pb-4">
            <Shortcut to="/inbox" active={pathname.startsWith("/inbox")} icon={<InboxIcon />} label={t.inboxShort} count={unreadInbox} countLabel={t.unreadInbox(unreadInbox)} />
            <Shortcut to="/tasks" active={pathname.startsWith("/tasks")} icon={<TaskListIcon />} label={t.tasksShort} />
            {sessionsPill?.any && (
              <Shortcut to="/sessions" active={pathname.startsWith("/sessions")} icon={<TerminalIcon />} label={t.sessionsShort} count={waitingSessions} countLabel={t.waitingSessions(waitingSessions)} />
            )}
          </div>
        </>
      )}

      <nav aria-label={t.conversations} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-3 pb-2">
        {isPending && [0, 1, 2].map((i) => <SidebarMenuSkeleton key={i} showIcon className="h-[54px]" />)}
        {!isPending && conversations.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted-foreground">{t.empty}</p>}
        {list.map((c) => (
          <ConversationRow key={c.id} conversation={c} active={conversationId === c.id} desktop />
        ))}
      </nav>

      {/* Figma « Bas »: your account, and the apps installed in the organisation. */}
      <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-3.5">
        <UserMenu user={user} pill />
        {user.role === "admin" && (
          <>
            <AppsPill onClick={() => setMarket(true)} label={t.marketplace} />
            {market && <Marketplace onClose={() => setMarket(false)} />}
          </>
        )}
      </div>
    </>
  );
}

/** Figma « Bouton rond »: white, hairline, 32 px. */
function RoundButton({ className, ...props }: React.ComponentProps<typeof Button>) {
  return (
    <Button
      variant="outline"
      size="icon"
      className={cn("bg-background shadow-[0_1px_2px_0_oklch(0_0_0/0.05)] aria-pressed:bg-accent [&_svg:not([class*='size-'])]:size-[17px]", className)}
      {...props}
    />
  );
}

/** Figma « Raccourci »: a white pill, its icon and name, and in orange what waits for you. */
function Shortcut({ to, active, icon, label, count = 0, countLabel }: { to: string; active: boolean; icon: ReactNode; label: string; count?: number; countLabel?: string }) {
  return (
    <Link
      to={to}
      {...tabLink(to, true)}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex h-8 min-w-fit flex-auto items-center justify-center gap-1 rounded-full border border-border bg-background px-1.5 text-[13px] leading-[18px] outline-none transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30 [&_svg]:size-[15px] [&_svg]:shrink-0 [&_svg]:text-icon",
        active && "border-transparent bg-accent hover:bg-accent",
      )}
    >
      {icon}
      <span className="truncate">{label}</span>
      {count > 0 && (
        <span aria-label={countLabel} className="rounded-lg bg-warning px-[5px] text-[11px] leading-[14px] text-white tabular-nums">
          {count}
        </span>
      )}
    </Link>
  );
}

/** Figma « Applications »: the logos of the first connectors installed; opens the Marketplace. */
function AppsPill({ onClick, label }: { onClick: () => void; label: string }) {
  const { data } = useQuery(mcpServersQuery);
  const servers = (data?.servers ?? []).slice(0, 3);
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <button
            type="button"
            onClick={onClick}
            aria-label={label}
            className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-border bg-background px-2.5 outline-none transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30"
          />
        }
      >
        {servers.length ? (
          servers.map((s) => <BrandLogo key={s.name} server={s.name} fallback={<PlugIcon className="size-4 text-icon" />} className="size-4 rounded-[3px]" />)
        ) : (
          <PuzzleIcon className="size-4 text-icon" />
        )}
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function ListLabel({ children }: { children: string }) {
  return <p className="pt-4 pb-1.5 pl-2 text-[13px] leading-[18px] tracking-[-0.05px] text-subtle">{children}</p>;
}

/**
 * Figma « Ligne de conversation »: avatar, name and time, then the last message, or what the bot is
 * doing. Waiting for your answer: an orange dot (the only state asking you to act). Unread: a blue dot.
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
    <ContextMenu disabled={!desktop}>
      <ContextMenuTrigger
        render={
          <Link
            to="/c/$conversationId"
            params={{ conversationId: c.id }}
            {...tabLink(path, desktop)}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex shrink-0 items-center gap-3 rounded-xl py-[9px] pr-2.5 pl-2 outline-none transition-colors hover:bg-black/4 focus-visible:ring-3 focus-visible:ring-ring/30 dark:hover:bg-white/5",
              active && "bg-accent hover:bg-accent dark:hover:bg-accent",
            )}
          />
        }
      >
        {/* Presence only for colleagues: what a bot is doing is said on the second line. */}
        <ConversationAvatar conversation={c} me={user.id} className="size-9" status={c.agents.length ? undefined : active ? "ring-accent" : "ring-sidebar"} />
        <span className="grid min-w-0 flex-1 gap-0.5">
          <span className="flex items-center gap-[7px]">
            <span className="truncate text-[15px] leading-[21px]">{c.name}</span>
            <span className="ml-auto shrink-0 text-xs leading-4 text-subtle">{listTime(new Date(c.lastAt))}</span>
          </span>
          <span className="flex min-w-0 items-center gap-2 text-sm leading-5 text-muted-foreground">
            {waiting ? (
              <span className="truncate">{t.waiting}</span>
            ) : working ? (
              <>
                <LoaderIcon className="size-3 shrink-0 animate-spin" />
                <span className="truncate">{t.working}</span>
              </>
            ) : (
              c.preview && (
                <span className="truncate">
                  {c.preview.fromMe ? t.prefix(tc.you) : c.preview.author && c.kind === "group" && t.prefix(c.preview.author)}
                  {eventText(c.preview.text, c.preview.event).replace(/[*_`#>]/g, "")}
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
          <ContextMenuItem onClick={() => openHere(path, true)}>{t.openInTab}</ContextMenuItem>
          <ContextMenuItem onClick={() => openBeside(path)}>{t.openBeside}</ContextMenuItem>
        </ContextMenuGroup>
      </ContextMenuContent>
    </ContextMenu>
  );
}

export function UserMenu({ user, pill }: { user: { id: string; name: string; image?: string | null }; pill?: boolean }) {
  const navigate = useNavigate();
  const t = useT(messages);
  const { data: digest } = useQuery(digestQuery);
  const me = useAvailability(user.id);
  const away = isAway(me);
  return (
    <DropdownMenu>
      {pill ? (
        // Figma « Compte »: a white pill, your avatar and name.
        <DropdownMenuTrigger className="relative flex h-[38px] min-w-0 flex-1 items-center gap-2 rounded-full border border-border bg-background py-1 pr-3.5 pl-1 text-left text-sm leading-5 outline-none transition-colors hover:bg-secondary focus-visible:ring-3 focus-visible:ring-ring/30 aria-expanded:bg-secondary">
          <PersonAvatar person={{ id: user.id, name: user.name, image: user.image ?? null }} className="size-7" />
          <span className="min-w-0 flex-1 truncate">{user.name}</span>
          {away && <MoonIcon role="img" aria-label={availabilityLabel(me) ?? t.dnd} className="size-3.5 shrink-0 text-destructive" />}
        </DropdownMenuTrigger>
      ) : (
        <DropdownMenuTrigger render={<SidebarMenuButton tooltip={user.name} />}>
          <PersonAvatar person={{ id: user.id, name: user.name, image: user.image ?? null }} className="size-5" />
          <span>{user.name}</span>
          {away && <MoonIcon role="img" aria-label={availabilityLabel(me) ?? t.dnd} className="ml-auto size-3.5 text-destructive" />}
        </DropdownMenuTrigger>
      )}
      <DropdownMenuContent side="top" align="start" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => openProfile(user.id)}>
            <UserIcon className="text-muted-foreground" /> {t.profile}
          </DropdownMenuItem>
          <DndMenu userId={user.id} />
          <DropdownMenuItem onClick={() => openSettings()}>
            <SlidersIcon className="text-muted-foreground" /> {t.settings}
            <DropdownMenuShortcut>
              <ShortcutKeys shortcut={shortcuts.settings} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => setOverlay("help")}>
            <KeyboardIcon className="text-muted-foreground" /> {t.shortcuts}
            <DropdownMenuShortcut>
              <ShortcutKeys shortcut={shortcuts.help} />
            </DropdownMenuShortcut>
          </DropdownMenuItem>
          {digest && (
            <DropdownMenuItem onClick={() => setDigestOpen(true)}>
              <FileTextIcon className="text-muted-foreground" /> {t.digest}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => setWhatsNewOpen(true)}>
            <SparklesIcon className="text-muted-foreground" /> {t.whatsNew}
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
        <MoonIcon className={on ? "text-destructive" : "text-muted-foreground"} /> {t.dnd}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {on ? (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{availabilityLabel(status)}</DropdownMenuLabel>
            <DropdownMenuItem onClick={() => change.mutate(null)}>{t.dndOff}</DropdownMenuItem>
          </DropdownMenuGroup>
        ) : (
          schedule &&
          dndPresets(schedule).map((p) => (
            <DropdownMenuItem key={p.label} onClick={() => change.mutate(p.until)}>
              {p.label}
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => openSettings("availability")}>{t.schedule}</DropdownMenuItem>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}
