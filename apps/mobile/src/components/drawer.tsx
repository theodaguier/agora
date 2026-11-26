import { codeSessionState, historyBucket, type HistoryBucket } from "@agora/core";
import { conversations, simple } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { router, Stack, useNavigation } from "expo-router";
import type { DrawerContentComponentProps } from "expo-router/drawer";
import { DrawerActions } from "expo-router/react-navigation";
import { PressableFeedback, Typography } from "heroui-native";
import { useMemo, useState, type ReactNode } from "react";
import { ScrollView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCSSVariable } from "uniwind";
import { ColorDot, ConversationAvatar, PersonAvatar } from "@/components/conversation-avatar";
import { headerIcon } from "@/components/header-button";
import { ComposeIcon, InboxIcon, SearchIcon, SparklesIcon, TaskListIcon, type IconComponent } from "@/components/icons";
import { TerminalIcon } from "@/components/icons/tools";
import { conversationTitle } from "@/components/participants";
import { useMe } from "@/components/server-scope";
import { allCodeSessionsQuery } from "@/lib/code-sessions";
import { digestQuery } from "@/lib/digest";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { useInboxUnread } from "@/lib/inbox";
import { conversationsQuery, tasksQuery } from "@/lib/queries";
import { defaultAssistant, useAssistants, useNewChat, useSimple } from "@/lib/simple";
import type { ConversationSummary } from "@/lib/types";

/*
 * Figma « Mobile — ChatGPT 1:1 (26 nov.) »: the app has no tab bar. The two-line button on the left of
 * each main screen opens this drawer, which pushes the screen aside as ChatGPT's does. It holds the web
 * sidebar (inbox, tasks, code sessions, then the agents, projects and messages); the simple interface's
 * holds its chat history. The account at the bottom opens the settings.
 */

const messages = defineMessages({
  en: { menu: "Menu", inbox: "Inbox", sessions: "Code sessions", digest: "Morning recap", agents: "Agents", projects: "Projects", messages: "Messages", search: "Search" },
  fr: {
    menu: "Menu",
    inbox: "Boîte de réception",
    sessions: "Sessions de code",
    digest: "Récap du matin",
    agents: "Agents",
    projects: "Projets",
    messages: "Messages",
    search: "Rechercher",
  },
});

/** Opens the drawer from any screen inside it (a nested stack's screen bubbles the action up). */
export function useOpenDrawer() {
  const navigation = useNavigation();
  return () => navigation.dispatch(DrawerActions.openDrawer());
}

/** What waits elsewhere, counted on the menu button: unread conversations (but the open one) and the inbox. */
export function useDrawerBadge(current?: string) {
  const chats = useQuery({ ...conversationsQuery, select: (list: ConversationSummary[]) => list.filter((c) => c.unread && c.id !== current).length }).data ?? 0;
  return chats + useInboxUnread();
}

/** The menu button, on the left of every screen of the drawer. */
export function DrawerButton({ current }: { current?: string }) {
  const open = useOpenDrawer();
  const badge = useDrawerBadge(current);
  const t = messages;
  return (
    <Stack.Toolbar placement="left">
      <Stack.Toolbar.Button icon={headerIcon.menu} iconRenderingMode="template" accessibilityLabel={badge ? `${t.menu}, ${badge}` : t.menu} onPress={withTap(open)}>
        {badge > 0 && <Stack.Toolbar.Badge>{String(badge)}</Stack.Toolbar.Badge>}
      </Stack.Toolbar.Button>
    </Stack.Toolbar>
  );
}

/** The drawer's content (the Drawer layout's `drawerContent`). */
export function Sidebar(props: DrawerContentComponentProps) {
  const insets = useSafeAreaInsets();
  const simpleMode = useSimple();
  const close = () => props.navigation.closeDrawer();
  /** The conversation the home shows (its `?c=`), to mark it. */
  const homeRoute = props.state.routes.find((r) => r.name === "(chats)");
  const homeState = homeRoute?.state;
  const current = (homeState?.routes[homeState.index ?? 0]?.params as { c?: string } | undefined)?.c;
  return (
    <View className="flex-1 bg-background" style={{ paddingTop: insets.top + 6 }}>
      {simpleMode ? <SimpleSidebar close={close} current={current} /> : <FullSidebar close={close} current={current} navigate={(name) => props.navigation.navigate(name)} />}
      <Account close={close} bottom={insets.bottom} />
    </View>
  );
}

/** Search (opens the search screen) and a new conversation, at the top as ChatGPT's. */
function Top({ onSearch, onCompose, searchField }: { onSearch?: () => void; onCompose: () => void; searchField?: ReactNode }) {
  const t = messages;
  return (
    <View className="flex-row items-center gap-2.5 px-4 pb-2">
      {searchField ?? (
        <PressableFeedback onPress={withTap(() => onSearch?.())} accessibilityRole="search" accessibilityLabel={t.search} className="h-11 flex-1 flex-row items-center gap-2 rounded-full bg-default px-3.5">
          <SearchIcon size={18} className="text-muted" />
          <Typography color="muted">{t.search}</Typography>
        </PressableFeedback>
      )}
      <PressableFeedback onPress={withTap(onCompose)} accessibilityRole="button" accessibilityLabel={tr(conversations).newConversation} className="size-11 items-center justify-center rounded-full">
        <ComposeIcon size={22} className="text-foreground" />
      </PressableFeedback>
    </View>
  );
}

/** One line of the drawer: an icon or an avatar, the name, a count or an unread dot; the shown one greyed. */
function Row({ icon: Icon, avatar, label, count, unread, selected, bold, onPress }: { icon?: IconComponent; avatar?: ReactNode; label: string; count?: number; unread?: boolean; selected?: boolean; bold?: boolean; onPress: () => void }) {
  return (
    <PressableFeedback onPress={withTap(onPress)} accessibilityRole="button" accessibilityLabel={label} className={`mx-2.5 flex-row items-center gap-3.5 rounded-xl px-3 py-2.5 ${selected ? "bg-default" : ""}`}>
      <View className="size-6 items-center justify-center">{avatar ?? (Icon && <Icon size={20} className="text-foreground" />)}</View>
      <Typography numberOfLines={1} weight={bold || unread ? "semibold" : undefined} className="flex-1">
        {label}
      </Typography>
      {!!count && (
        <Typography type="body-sm" color="muted">
          {count}
        </Typography>
      )}
      {unread && <ColorDot size={8} color="text-brand" />}
    </PressableFeedback>
  );
}

function Head({ children }: { children: string }) {
  return (
    <Typography type="body-xs" weight="semibold" color="muted" className="mx-5 mb-1 mt-5">
      {children}
    </Typography>
  );
}

/** The projects, one row each, unread when one of their discussions is (as the web sidebar). */
function projectRows(rows: (ConversationSummary & { name: string })[]) {
  return rows
    .filter((c) => c.kind === "group" && !c.parentId)
    .map((p) => {
      const inside = [p, ...rows.filter((d) => d.parentId === p.id && !d.archived)];
      return { ...p, lastAt: inside.reduce((a, b) => (b.lastAt > a ? b.lastAt : a), p.lastAt), unread: inside.some((c) => c.unread) };
    })
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime());
}

/** The full interface: the web sidebar. */
function FullSidebar({ close, current, navigate }: { close: () => void; current?: string; navigate: (name: string) => void }) {
  const t = messages;
  const me = useMe();
  const { data: list = [] } = useQuery(conversationsQuery);
  const inbox = useInboxUnread();
  const tasks = useQuery({ ...tasksQuery(me.id), select: (l) => l.filter((x) => x.status !== "done" && x.assignees.some((a) => a.id === me.id)).length }).data ?? 0;
  const waiting = useQuery({ ...allCodeSessionsQuery, select: (l) => l.filter((s) => s.requestedBy === me.id && codeSessionState(s) === "waiting").length }).data ?? 0;
  const { data: digest } = useQuery(digestQuery);
  const rows = useMemo(() => list.filter((c) => !c.archived).map((c) => ({ ...c, name: conversationTitle(c, me.id) })), [list, me.id]);
  const go = (name: string) => {
    navigate(name);
    close();
  };
  const open = (c: ConversationSummary) => {
    router.navigate({ pathname: "/", params: { c: c.id } });
    close();
  };
  const groups = [
    { key: "agents", label: t.agents, rows: rows.filter((c) => c.kind === "direct" && c.agents.length > 0) },
    { key: "projects", label: t.projects, rows: projectRows(rows) },
    { key: "messages", label: t.messages, rows: rows.filter((c) => c.kind === "direct" && c.agents.length === 0) },
  ];
  return (
    <>
      <Top
        onSearch={() => {
          close();
          router.push("/search");
        }}
        onCompose={() => {
          close();
          router.push("/new");
        }}
      />
      <ScrollView className="flex-1" contentContainerClassName="pb-6">
        <Row icon={InboxIcon} label={t.inbox} count={inbox} onPress={() => go("inbox")} />
        <Row icon={TaskListIcon} label={tr(conversations).tasks} count={tasks} onPress={() => go("tasks")} />
        <Row icon={TerminalIcon} label={t.sessions} count={waiting} onPress={() => go("(sessions)")} />
        {!!digest && (
          <Row
            icon={SparklesIcon}
            label={t.digest}
            unread={!digest.seen}
            onPress={() => {
              close();
              router.push("/digest");
            }}
          />
        )}
        {groups.map(
          (g) =>
            g.rows.length > 0 && (
              <View key={g.key}>
                <Head>{g.label}</Head>
                {g.rows.map((c) => (
                  <Row
                    key={c.id}
                    avatar={<ConversationAvatar conversation={c} me={me.id} className="size-6" />}
                    label={c.name}
                    unread={c.unread}
                    selected={c.id === current}
                    onPress={() => {
                      if (g.key !== "projects") return open(c);
                      close();
                      router.push({ pathname: "/project/[projectId]", params: { projectId: c.id } });
                    }}
                  />
                ))}
              </View>
            ),
        )}
      </ScrollView>
    </>
  );
}

const ORDER: HistoryBucket[] = ["today", "yesterday", "week", "month", "older"];

/** The simple interface: a new chat, then every chat by day (Figma « Mode simple », 9 · Historique). */
function SimpleSidebar({ close, current }: { close: () => void; current?: string }) {
  const t = tr(simple);
  const me = useMe();
  const { data: list = [] } = useQuery(conversationsQuery);
  const agents = useAssistants().data ?? [];
  const newChat = useNewChat();
  const [q, setQ] = useState("");
  const chats = useMemo(() => list.filter((c) => c.kind === "direct" && !!c.preview).map((c) => ({ ...c, name: conversationTitle(c, me.id) })), [list, me.id]);
  const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const shown = chats.filter((c) => words.every((w) => `${c.name} ${c.preview?.text ?? ""}`.toLowerCase().includes(w)));
  const buckets = ORDER.map((b) => ({ key: b, rows: shown.filter((c) => historyBucket(new Date(c.lastAt)) === b) })).filter((b) => b.rows.length);
  const next = defaultAssistant(agents, list);
  const muted = useCSSVariable("--color-muted") as string;
  return (
    <>
      <Top
        onCompose={() => {
          if (next) newChat.mutate(next);
          close();
        }}
        searchField={
          <View className="h-11 flex-1 flex-row items-center gap-2 rounded-full bg-default px-3.5">
            <SearchIcon size={18} className="text-muted" />
            <TextInput value={q} onChangeText={setQ} placeholder={t.search} accessibilityLabel={t.search} className="flex-1 text-base text-foreground" placeholderTextColor={muted} />
          </View>
        }
      />
      <ScrollView className="flex-1" contentContainerClassName="pb-6" keyboardDismissMode="on-drag">
        {buckets.map((b) => (
          <View key={b.key}>
            <Head>{t.history[b.key]}</Head>
            {b.rows.map((c) => (
              <Row
                key={c.id}
                label={c.name}
                unread={c.unread}
                selected={c.id === current}
                onPress={() => {
                  router.navigate({ pathname: "/", params: { c: c.id } });
                  close();
                }}
              />
            ))}
          </View>
        ))}
        {!!words.length && !buckets.length && (
          <Typography color="muted" align="center" className="mt-8">
            {t.noMatch}
          </Typography>
        )}
      </ScrollView>
    </>
  );
}

/** The account at the bottom: opens the settings (the profile). */
function Account({ close, bottom }: { close: () => void; bottom: number }) {
  const me = useMe();
  return (
    <PressableFeedback
      onPress={withTap(() => {
        close();
        router.navigate("/profile");
      })}
      accessibilityRole="button"
      accessibilityLabel={`${me.name}, ${tr(simple).settings}`}
      className="mx-2.5 flex-row items-center gap-3 rounded-xl px-3 py-2.5"
      style={{ marginBottom: Math.max(bottom, 12) }}
    >
      <PersonAvatar person={me} size={32} />
      <Typography weight="medium" numberOfLines={1} className="flex-1">
        {me.name}
      </Typography>
    </PressableFeedback>
  );
}

