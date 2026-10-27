import { useQuery } from "@tanstack/react-query";
import { Link, useLocation, useRouteContext, useRouter, useSearch } from "@tanstack/react-router";
import { OrgLogo } from "@/components/OrgLogo";
import { Fragment, useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { useDefaultLayout } from "react-resizable-panels";
import { ScreenPage } from "@/components/AgentScreen";
import { CodeSessionPage, isNewCodeSession } from "@/components/CodeSession";
import { AgentAvatar } from "@/components/AgentAvatar";
import { ConversationAvatar } from "@/components/ConversationAvatar";
import { TabChip } from "@/components/TabChip";
import { findPreview, PreviewPage } from "@/components/Preview";
import { CodePriorityIcon, CodeStateIcon } from "@/components/CodeSessionMarks";
import { codeSessionState, type CodeSession } from "@agora/core";
import { useCodeSessionUnread } from "@/lib/code-seen";
import { BrowserIcon, ChatIntegrationIcon, CloseIcon, FileCodeIcon, InboxIcon, PlusIcon, SplitIcon, TaskListIcon, TerminalIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { defineMessages, useT } from "@/i18n";
import { codeSessionsQuery } from "@/lib/code-sessions";
import { conversationTitle } from "@/lib/participants";
import { conversationsQuery, messagesQuery } from "@/lib/queries";
import { useOrgTitle } from "@/lib/org";
import { useTurns } from "@/lib/realtime";
import { cn } from "@/lib/utils";
import { ConversationView } from "@/screens/Conversation";
import { Inbox } from "@/screens/Inbox";
import { NewChat } from "@/screens/NewChat";
import { Sessions } from "@/screens/Sessions";
import { Tasks } from "@/screens/Tasks";
import {
  activateTab,
  clearActive,
  closePane,
  closeTab,
  currentTab,
  draggedTab,
  focusPane,
  loadWorkspace,
  MAX_PANES,
  moveTab,
  openBeside,
  openHere,
  parseTab,
  replaceTab,
  setDraggingTab,
  splitEmpty,
  startTabDrag,
  TAB_DRAG,
  TabPlaceContext,
  tabPath,
  useDraggingTab,
  useWorkspace,
  type Pane,
} from "@/lib/workspace";

const messages = defineMessages({
  en: {
    tabs: "Tabs",
    newTab: "New conversation in a new tab",
    split: "Split view",
    closePane: "Close this pane",
    closeTab: (title: string) => `Close ${title}`,
    newChat: "New conversation",
    tasks: "My tasks",
    sessions: "Sessions",
    inbox: "Inbox",
    screen: "Screen",
    mockup: "Mockup",
    session: "Claude Code",
    newSession: "New Claude Code session",
    loading: "Loading…",
    unavailable: "Conversation unavailable",
    openHere: "Open a conversation here",
    search: "Search conversations",
    none: "No conversation found.",
    conversations: "Conversations",
    dropHint: "Or drag a conversation or a tab here.",
    homeHint: "Pick a conversation in the list, or start one.",
  },
  fr: {
    tabs: "Onglets",
    newTab: "Nouvelle conversation dans un nouvel onglet",
    split: "Diviser la vue",
    closePane: "Fermer ce volet",
    closeTab: (title: string) => `Fermer ${title}`,
    newChat: "Nouvelle conversation",
    tasks: "Mes tâches",
    sessions: "Sessions",
    inbox: "Boîte de réception",
    screen: "Écran",
    mockup: "Maquette",
    session: "Claude Code",
    newSession: "Nouvelle session Claude Code",
    loading: "Chargement…",
    unavailable: "Conversation indisponible",
    openHere: "Ouvre une conversation ici",
    search: "Rechercher une conversation",
    none: "Aucune conversation trouvée.",
    conversations: "Conversations",
    dropHint: "Ou glisse ici une conversation ou un onglet.",
    homeHint: "Choisis une conversation dans la liste, ou démarres-en une.",
  },
});

/** Pane widths remembered in this browser (they fail silently where storage is blocked). */
const layoutStorage = {
  getItem: (key: string) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Kept for this page only.
    }
  },
};

/**
 * Desktop: the panes side by side, the lines between them dragged to share the width, each with its
 * tabs. Keeps the URL and the focused pane's active tab in step (lib/workspace.ts).
 */
export function Workspace() {
  const { user } = useRouteContext({ from: "/app" });
  useState(() => {
    loadWorkspace(user.id);
    // Loaded on a page's URL: it takes the place of the tab in front before anything mounts. Swapping
    // it after the first render unmounts a conversation mid-layout (react-resizable-panels then loops).
    openHere(window.location.pathname);
  });
  const w = useWorkspace();
  useLocationSync();
  const { defaultLayout, onLayoutChanged } = useDefaultLayout({ id: "agora-workspace", panelIds: w.panes.map((p) => p.id), storage: layoutStorage });

  // A drag that ends anywhere (dropped outside, cancelled) takes the drop zones away.
  useEffect(() => {
    const end = () => setDraggingTab(false);
    window.addEventListener("dragend", end);
    window.addEventListener("drop", end);
    return () => {
      window.removeEventListener("dragend", end);
      window.removeEventListener("drop", end);
    };
  }, []);

  return (
    <ResizablePanelGroup orientation="horizontal" className="min-w-0 flex-1" defaultLayout={defaultLayout} onLayoutChanged={onLayoutChanged}>
      {w.panes.map((pane, i) => (
        <Fragment key={pane.id}>
          {i > 0 && <ResizableHandle className="w-px bg-border after:w-1.5 focus-visible:ring-0 hover:bg-ring/50 data-[separator=active]:bg-ring/60" />}
          {/* A pane never scrolls itself (the panel's box is overflow: auto): each tab has its own scroller. */}
          <ResizablePanel id={pane.id} minSize={360} style={{ overflow: "clip" }}>
            <PaneView pane={pane} focused={pane.id === w.focused} multiple={w.panes.length > 1} canSplit={w.panes.length < MAX_PANES} />
          </ResizablePanel>
        </Fragment>
      ))}
    </ResizablePanelGroup>
  );
}

/**
 * The URL shows the focused pane's active tab. A link followed (sidebar, mention, inbox, back and
 * forward) opens there; a tab chosen, closed or moved changes the URL. Loaded on a conversation's
 * URL, it opens in a tab next to those kept; loaded on home, the tab left in front comes back.
 */
function useLocationSync() {
  const router = useRouter();
  const path = useLocation({ select: (l) => l.pathname });
  const current = currentTab(useWorkspace());
  const loaded = useRef(false);

  useEffect(() => {
    if (!loaded.current) {
      loaded.current = true;
      if (path === "/") {
        if (current) router.history.replace(current);
        return;
      }
      return openHere(path);
    }
    if (path === "/") clearActive();
    else openHere(path);
  }, [path]);

  const started = useRef(false);
  useEffect(() => {
    if (!started.current) {
      started.current = true;
      return;
    }
    const target = current ?? "/";
    if (target !== router.state.location.pathname) router.history.push(target);
  }, [current]);
}

function PaneView({ pane, focused, multiple, canSplit }: { pane: Pane; focused: boolean; multiple: boolean; canSplit: boolean }) {
  const search = useSearch({ strict: false }) as { m?: string };
  // Tabs already shown stay mounted (behind): their scroll, draft and side panel wait for them.
  const shown = useRef(new Set<string>());
  if (pane.active) shown.current.add(pane.active);
  for (const path of shown.current) if (!pane.tabs.includes(path)) shown.current.delete(path);

  return (
    <div
      data-pane={pane.id}
      className="flex h-full min-w-0 flex-col overflow-hidden bg-background"
      onPointerDownCapture={() => focusPane(pane.id)}
      onFocusCapture={() => focusPane(pane.id)}
    >
      {/* One conversation at a time, as in the Figma: the bar shows once a second tab or pane is opened (⌘-click, drag). */}
      {(multiple || pane.tabs.length > 1) && <TabBar pane={pane} focused={focused} multiple={multiple} canSplit={canSplit} />}
      <div className="relative flex min-h-0 flex-1">
        {pane.tabs
          .filter((path) => shown.current.has(path))
          .map((path) => {
            const active = path === pane.active;
            return (
              <TabPlaceContext.Provider key={path} value={{ paneId: pane.id, current: focused && active, visible: active }}>
                <div className={cn("flex min-h-0 min-w-0 flex-1", !active && "hidden")}>
                  <TabContent path={path} focus={focused && active ? search.m : undefined} />
                </div>
              </TabPlaceContext.Provider>
            );
          })}
        {!pane.active && (
          <TabPlaceContext.Provider value={{ paneId: pane.id, current: focused, visible: true }}>
            {multiple ? <EmptyPane paneId={pane.id} /> : <Home />}
          </TabPlaceContext.Provider>
        )}
        <DropZones paneId={pane.id} />
      </div>
    </div>
  );
}

function TabContent({ path, focus }: { path: string; focus?: string }) {
  const target = parseTab(path);
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations } = useQuery(conversationsQuery);
  const conv = target && "conversationId" in target ? conversations?.find((c) => c.id === target.conversationId) : undefined;
  const close = () => closeTab(path);
  switch (target?.kind) {
    case "conversation":
      return <ConversationView conversationId={target.conversationId} focus={focus} />;
    case "screen":
      return <ScreenPage conversationId={target.conversationId} title={conv ? conversationTitle(conv, user.id) : ""} onClose={close} />;
    case "code":
      return (
        <CodeSessionPage
          conversationId={target.conversationId}
          sessionId={target.sessionId}
          onClose={close}
          onStarted={(id) => replaceTab(path, tabPath.code(target.conversationId, id))}
        />
      );
    case "preview":
      return <PreviewPage conversationId={target.conversationId} previewKey={target.previewKey} onClose={close} />;
    case "new":
      return <NewChat />;
    case "tasks":
      return <Tasks />;
    case "sessions":
      return <Sessions />;
    case "inbox":
      return <Inbox />;
    default:
      return null;
  }
}

/* ---------- tab bar ---------- */

/** Where a dragged tab would land in the bar: before the first tab whose middle is right of the pointer. */
function dropIndex(bar: HTMLElement, clientX: number) {
  const tabs = [...bar.querySelectorAll<HTMLElement>("[role=tab]")];
  const i = tabs.findIndex((tab) => {
    const r = tab.getBoundingClientRect();
    return clientX < r.left + r.width / 2;
  });
  return i === -1 ? tabs.length : i;
}

function TabBar({ pane, focused, multiple, canSplit }: { pane: Pane; focused: boolean; multiple: boolean; canSplit: boolean }) {
  const t = useT(messages);
  const [over, setOver] = useState(false);
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    if (!e.dataTransfer.types.includes(TAB_DRAG)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setOver(true);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    const path = draggedTab(e);
    setOver(false);
    if (!path) return;
    e.preventDefault();
    moveTab(path, pane.id, dropIndex(e.currentTarget, e.clientX));
    setDraggingTab(false);
  };
  return (
    <div
      role="tablist"
      aria-label={t.tabs}
      onDragOver={onDragOver}
      onDragLeave={(e) => !e.currentTarget.contains(e.relatedTarget as Node | null) && setOver(false)}
      onDrop={onDrop}
      className={cn("flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-border bg-background px-1.5 py-[5px]", over && "bg-muted")}
    >
      {pane.tabs.map((path) => (
        <TabItem key={path} path={path} paneId={pane.id} active={path === pane.active} focused={focused} />
      ))}
      <IconAction
        label={t.newTab}
        onClick={() => {
          focusPane(pane.id);
          openHere("/new", true);
        }}
      >
        <PlusIcon />
      </IconAction>
      <span className="flex-1" />
      {canSplit && (
        <IconAction label={t.split} onClick={() => (focusPane(pane.id), splitEmpty())}>
          <SplitIcon />
        </IconAction>
      )}
      {multiple && (
        <IconAction label={t.closePane} onClick={() => closePane(pane.id)}>
          <CloseIcon />
        </IconAction>
      )}
    </div>
  );
}

function IconAction({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon-xs" aria-label={label} onClick={onClick} className="size-6 shrink-0 rounded-[6px] [&_svg:not([class*='size-'])]:size-4" />}>{children}</TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

/** A tab of a pane, dragged to move it (to another pane, or to a pane's edge to split). */
function TabItem({ path, paneId, active, focused }: { path: string; paneId: string; active: boolean; focused: boolean }) {
  const t = useT(messages);
  const { title, icon, unread, session } = useTabInfo(path);
  // A session's tab gets its dot as the conversation's panel tabs do: something new to read, not in front.
  const sessionUnread = useCodeSessionUnread(session, active);
  return (
    <TabChip
      title={title}
      icon={icon}
      active={active}
      dimmed={!focused}
      unread={unread || sessionUnread}
      closeLabel={t.closeTab(title)}
      onSelect={() => activateTab(paneId, path)}
      onClose={() => closeTab(path)}
      onDragStart={(e) => startTabDrag(e, path)}
    />
  );
}

/** A tab's title and icon, from what the app already has in cache. */
function useTabInfo(path: string): { title: string; icon: ReactNode; unread?: boolean; session?: CodeSession } {
  const t = useT(messages);
  const { user } = useRouteContext({ from: "/app" });
  const target = parseTab(path);
  const conversationId = target && "conversationId" in target ? target.conversationId : "";
  const { data: conversations } = useQuery(conversationsQuery);
  const conv = conversations?.find((c) => c.id === conversationId);
  const name = conv ? conversationTitle(conv, user.id) : conversations ? t.unavailable : t.loading;
  const { data: sessions } = useQuery({ ...codeSessionsQuery(conversationId), enabled: target?.kind === "code" });
  const turns = useTurns(conversationId);
  const { data: thread } = useQuery({ ...messagesQuery(conversationId), enabled: target?.kind === "preview" });
  switch (target?.kind) {
    case "conversation":
      // A bot shows its orb; people and groups the conversation icon (initials can't be read at this size).
      const bot = conv && conv.kind === "direct" && conv.agents.length ? conv.agents[0] : null;
      return { title: name, icon: bot ? <AgentAvatar agent={bot} className="size-4" /> : <ChatIntegrationIcon className="text-muted-foreground" />, unread: conv?.unread };
    case "screen":
      return { title: `${t.screen} · ${name}`, icon: <BrowserIcon /> };
    case "code": {
      const session = sessions?.find((s) => s.id === target.sessionId);
      return {
        title: isNewCodeSession(target.sessionId) ? t.newSession : (session?.title ?? t.session),
        // Figma « Onglet de session »: its priority and its state.
        icon: session ? (
          <>
            <CodePriorityIcon priority={session.priority} />
            <CodeStateIcon state={codeSessionState(session)} />
          </>
        ) : (
          <TerminalIcon />
        ),
        session,
      };
    }
    case "preview":
      return { title: findPreview(target.previewKey, turns, thread ?? [])?.title || t.mockup, icon: <FileCodeIcon /> };
    case "new":
      return { title: t.newChat, icon: <PlusIcon /> };
    case "tasks":
      return { title: t.tasks, icon: <TaskListIcon /> };
    case "sessions":
      return { title: t.sessions, icon: <TerminalIcon /> };
    case "inbox":
      return { title: t.inbox, icon: <InboxIcon /> };
    default:
      return { title: path, icon: null };
  }
}

/* ---------- empty pane, drop zones ---------- */

/** Nothing open, one pane: the organisation, and a new conversation. */
function Home() {
  const t = useT(messages);
  const org = useOrgTitle();
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-background px-4 pb-[8vh]">
      <OrgLogo className="size-16" />
      <p className="text-[15px] leading-[21px]">{org}</p>
      <p className="text-sm text-muted-foreground">{t.homeHint}</p>
      <Button nativeButton={false} render={<Link to="/new" />} className="mt-1">
        {t.newChat}
      </Button>
    </div>
  );
}

/** A pane beside others with nothing in front: the conversations, to open one here. */
function EmptyPane({ paneId }: { paneId: string }) {
  const t = useT(messages);
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations = [] } = useQuery(conversationsQuery);
  useOrgTitle();
  return (
    <div className="flex flex-1 flex-col items-center overflow-y-auto bg-background px-4 pt-[12vh]">
      <div className="w-full max-w-md">
        <p className="mb-1 text-[15px] font-medium">{t.openHere}</p>
        <p className="mb-4 text-sm text-muted-foreground">{t.dropHint}</p>
        <Command className="rounded-xl border border-border">
          <CommandInput placeholder={t.search} />
          <CommandList className="max-h-[50vh]">
            <CommandEmpty>{t.none}</CommandEmpty>
            <CommandGroup heading={t.conversations}>
              {conversations.map((c) => {
                const name = conversationTitle(c, user.id);
                return (
                  <CommandItem key={c.id} value={`${name} ${c.id}`} onSelect={() => moveTab(tabPath.conversation(c.id), paneId)}>
                    <ConversationAvatar conversation={c} me={user.id} className="size-6" />
                    <span className="truncate">{name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </div>
    </div>
  );
}

type Zone = "left" | "center" | "right";

/**
 * While a tab (or a conversation of the sidebar) is dragged: dropped on a pane's left or right
 * edge, it opens in a new pane on that side; in the middle, in this pane.
 */
function DropZones({ paneId }: { paneId: string }) {
  const dragging = useDraggingTab();
  const [zone, setZone] = useState<Zone | null>(null);
  if (!dragging) return null;
  const zoneAt = (e: DragEvent<HTMLDivElement>): Zone => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    return x < 0.3 ? "left" : x > 0.7 ? "right" : "center";
  };
  return (
    <div
      className="absolute inset-0 z-30"
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        setZone(zoneAt(e));
      }}
      onDragLeave={() => setZone(null)}
      onDrop={(e) => {
        const path = draggedTab(e);
        const at = zoneAt(e);
        setZone(null);
        setDraggingTab(false);
        if (!path) return;
        e.preventDefault();
        if (at === "center") moveTab(path, paneId);
        else openBeside(path, paneId, at);
      }}
    >
      {zone && (
        <div
          className={cn(
            "pointer-events-none absolute inset-y-2 rounded-xl border-2 border-dashed border-brand bg-brand/10 transition-[left,right] duration-100",
            zone === "left" && "left-2 right-1/2",
            zone === "right" && "left-1/2 right-2",
            zone === "center" && "inset-x-2",
          )}
        />
      )}
    </div>
  );
}
