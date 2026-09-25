import { defineMessages, useT } from "@/i18n";
import { auth, common, conversations } from "@agora/core/i18n";
import { useEventText } from "@/i18n/events";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation, useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { FileTextIcon, KeyboardIcon, GridIcon, InboxIcon, TaskListIcon, LogOutIcon, MoonIcon, PlusIcon, SearchIcon, SlidersIcon, SparklesIcon, UserIcon } from "@/components/icons";
import { useState } from "react";
import { ConversationAvatar, PersonAvatar } from "@/components/ConversationAvatar";
import { conversationTitle } from "@/lib/participants";
import { Marketplace } from "@/components/marketplace/Marketplace";
import { Button } from "@/components/ui/button";
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
  },
});

/**
 * Desktop: shadcn sidebar that collapses to an icon rail (⌘B). Mobile: the list is the home
 * screen, full width, and hides as soon as a thread is open.
 */
export function AppSidebar() {
  const { isMobile } = useSidebar();
  const atRoot = useLocation({ select: (l) => l.pathname === "/" });
  if (!isMobile) return <Sidebar collapsible="icon"><SidebarBody /></Sidebar>;
  return atRoot ? <Sidebar collapsible="none" className="h-dvh w-full"><SidebarBody /></Sidebar> : null;
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
            <Button variant="ghost" size="icon-sm" aria-label={t.newConversation} nativeButton={false} render={<Link to="/new" />} className="ml-auto group-data-[collapsible=icon]:ml-0">
              <PlusIcon />
            </Button>
          </ShortcutTooltip>
        </div>
        <InputGroup className="group-data-[collapsible=icon]:hidden">
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
              return (
                <SidebarMenuItem key={c.id}>
                  <SidebarMenuButton
                    size="lg"
                    isActive={active}
                    tooltip={c.name}
                    render={<Link to="/c/$conversationId" params={{ conversationId: c.id }} />}
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
                </SidebarMenuItem>
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
            <SidebarMenuButton tooltip={t.inbox} isActive={pathname.startsWith("/inbox")} render={<Link to="/inbox" />}>
              <InboxIcon />
              <span>{t.inbox}</span>
            </SidebarMenuButton>
            {unreadInbox > 0 && <SidebarMenuBadge aria-label={t.unreadInbox(unreadInbox)}>{unreadInbox}</SidebarMenuBadge>}
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip={t.tasks} isActive={pathname.startsWith("/tasks")} render={<Link to="/tasks" />}>
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
