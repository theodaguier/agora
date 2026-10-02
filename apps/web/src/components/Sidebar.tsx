import { defineMessages, useT } from "@/i18n";
import { auth, common, conversations } from "@agora/core/i18n";
import { useEventText } from "@/i18n/events";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { FileTextIcon, KeyboardIcon, GridIcon, InboxIcon, TaskListIcon, LogOutIcon, MoonIcon, PlusIcon, SearchIcon, SlidersIcon, SparklesIcon, UserIcon } from "@/components/icons";
import { useState, type DragEvent, type KeyboardEvent, type MouseEvent, type PointerEvent } from "react";
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
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { authClient } from "@/lib/auth";
import { openProfile } from "@/lib/profile";
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
  },
  fr: {
    ...conversations.fr,
    signOut: auth.fr.signOut,
    searchConversation: "Rechercher une conversation",
    openTasks: (n: number) => `${n} tâche${n > 1 ? "s" : ""} en cours`,
    inbox: "Boîte de réception",
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
  },
});

/** The list's width until dragged, and how far it can be dragged (px). */
export const SIDEBAR_WIDTH = 320;
const SIDEBAR_MIN = 240;
const SIDEBAR_MAX = 480;
const clampWidth = (px: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(px)));

/**
 * Desktop: shadcn sidebar that collapses to an icon rail (⌘B), its edge dragged to widen it.
 * Mobile: the list is the home screen, full width, and hides as soon as a thread is open.
 */
export function AppSidebar({ width, onWidthChange }: { width: number; onWidthChange: (px: number) => void }) {
  const { isMobile } = useSidebar();
  const atRoot = useLocation({ select: (l) => l.pathname === "/" });
  if (!isMobile)
    return (
      <Sidebar collapsible="icon">
        <SidebarBody />
        <SidebarResizer width={width} onWidthChange={onWidthChange} />
      </Sidebar>
    );
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
      className="absolute inset-y-0 -right-1 z-20 w-2 cursor-col-resize outline-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:transition-colors hover:after:bg-ring/50 focus-visible:after:bg-ring group-data-[collapsible=icon]:hidden"
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
  const eventText = useEventText();
  const tc = useT(common);
  const t = useT(messages);
  const [market, setMarket] = useState(false);
  const { data: conversations = [], isPending } = useQuery(conversationsQuery);
  const list = conversations
    .map((c) => ({ ...c, name: conversationTitle(c, user.id) }))
    .filter((c) => c.name.toLowerCase().includes(q.toLowerCase()));
  const isAdmin = user.role === "admin";
  const { data: tasks } = useQuery(tasksQuery(user.id));
  // Badge: what you have to do yourself, not what you gave to others.
  const openTasks = tasks?.filter((x) => x.status !== "done" && x.assignees.some((a) => a.id === user.id)).length ?? 0;
  const { data: inbox } = useQuery(inboxQuery());
  const unreadInbox = inbox?.unread ?? 0;

  return (
    <>
      <SidebarHeader>
        <div className="flex items-center justify-between gap-2 group-data-[collapsible=icon]:flex-col">
          {!isMobile && (
            <ShortcutTooltip label={t.toggleSidebar} shortcut={shortcuts.toggleSidebar}>
              <SidebarTrigger aria-label={t.toggleSidebar} />
            </ShortcutTooltip>
          )}
          <ShortcutTooltip label={t.newConversation} shortcut={shortcuts.newConversation}>
            <Button variant="ghost" size="icon-sm" aria-label={t.newConversation} nativeButton={false} render={<Link to="/new" {...tabLink("/new", !isMobile)} />} className="ml-auto group-data-[collapsible=icon]:ml-0">
              <PlusIcon />
            </Button>
          </ShortcutTooltip>
        </div>
        <InputGroup className="h-8 group-data-[collapsible=icon]:hidden">
          <InputGroupInput value={q} onChange={(e) => setQ(e.target.value)} placeholder={tc.search} aria-label={t.searchConversation} />
          <InputGroupAddon>
            <SearchIcon />
          </InputGroupAddon>
        </InputGroup>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu className="group-data-[collapsible=icon]:items-center">
            {isPending && [0, 1, 2].map((i) => (
              <SidebarMenuItem key={i}>
                <SidebarMenuSkeleton showIcon />
              </SidebarMenuItem>
            ))}
            {!isPending && conversations.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-muted-foreground group-data-[collapsible=icon]:hidden">{t.empty}</p>
            )}
            {list.map((c) => {
              const active = conversationId === c.id;
              const path = tabPath.conversation(c.id);
              return (
                <ContextMenu key={c.id} disabled={isMobile}>
                  <ContextMenuTrigger render={<SidebarMenuItem />}>
                    <SidebarMenuButton
                      size="lg"
                      isActive={active}
                      tooltip={c.name}
                      render={<Link to="/c/$conversationId" params={{ conversationId: c.id }} {...tabLink(path, !isMobile)} />}
                      className="h-auto py-2 group-data-[collapsible=icon]:size-12! group-data-[collapsible=icon]:justify-center"
                    >
                      <ConversationAvatar
                        conversation={c}
                        me={user.id}
                        className="size-11"
                        status={active ? "ring-sidebar-accent" : "ring-sidebar"}
                      />
                      <span className="grid min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
                        <span className="truncate font-medium">{c.name}</span>
                        {c.preview && (
                          <span className="truncate text-muted-foreground">
                            {c.preview.fromMe ? t.prefix(tc.you) : c.preview.author && c.kind === "group" && t.prefix(c.preview.author)}
                            {eventText(c.preview.text, c.preview.event).replace(/[*_`#>]/g, "")}
                          </span>
                        )}
                      </span>
                    </SidebarMenuButton>
                    {c.unread && !active && (
                      <SidebarMenuBadge className="top-1/2! -translate-y-1/2">
                        <span className="size-2 rounded-full bg-brand" role="status" aria-label={t.unread} />
                      </SidebarMenuBadge>
                    )}
                  </ContextMenuTrigger>
                  <ContextMenuContent className="w-56">
                    <ContextMenuGroup>
                      <ContextMenuItem onClick={() => openHere(path, true)}>{t.openInTab}</ContextMenuItem>
                      <ContextMenuItem onClick={() => openBeside(path)}>{t.openBeside}</ContextMenuItem>
                    </ContextMenuGroup>
                  </ContextMenuContent>
                </ContextMenu>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu className="group-data-[collapsible=icon]:items-center">
          {isAdmin && (
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={t.marketplace} onClick={() => setMarket(true)}>
                <GridIcon />
                <span>{t.marketplace}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t.inbox} isActive={pathname.startsWith("/inbox")} render={<Link to="/inbox" {...tabLink("/inbox", !isMobile)} />}>
              <InboxIcon />
              <span>{t.inbox}</span>
            </SidebarMenuButton>
            {unreadInbox > 0 && <SidebarMenuBadge aria-label={t.unreadInbox(unreadInbox)}>{unreadInbox}</SidebarMenuBadge>}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t.tasks} isActive={pathname.startsWith("/tasks")} render={<Link to="/tasks" {...tabLink("/tasks", !isMobile)} />}>
              <TaskListIcon />
              <span>{t.tasks}</span>
            </SidebarMenuButton>
            {openTasks > 0 && <SidebarMenuBadge aria-label={t.openTasks(openTasks)}>{openTasks}</SidebarMenuBadge>}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <UserMenu user={user} />
          </SidebarMenuItem>
        </SidebarMenu>
        {market && <Marketplace onClose={() => setMarket(false)} />}
      </SidebarFooter>
    </>
  );
}

function UserMenu({ user }: { user: { id: string; name: string; image?: string | null } }) {
  const navigate = useNavigate();
  const t = useT(messages);
  const { isMobile } = useSidebar();
  const { data: digest } = useQuery(digestQuery);
  const me = useAvailability(user.id);
  const away = isAway(me);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<SidebarMenuButton tooltip={user.name} />}>
        <PersonAvatar person={{ id: user.id, name: user.name, image: user.image ?? null }} className="size-5" />
        <span>{user.name}</span>
        {away && <MoonIcon role="img" aria-label={availabilityLabel(me) ?? t.dnd} className="ml-auto size-3.5 text-destructive" />}
      </DropdownMenuTrigger>
      <DropdownMenuContent side={isMobile ? "top" : "right"} align="end" className="w-56">
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
