import {
  CODE_ENGINE_NAMES,
  codeSessionState,
  groupCodeSessions,
  type CodePriority,
  type CodeSession,
  type CodeSessionGrouping,
  type CodeSessionOrdering,
  type CodeSessionState,
  type CodeSessionView,
} from "@agora/core";
import { codeSessions, common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { ListGroup, Separator, Skeleton, Typography } from "heroui-native";
import { useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { useAdminToast } from "@/components/admin/ui";
import { AgentAvatar } from "@/components/agent-avatar";
import { codeSessionHref, ENGINE_PROVIDER, priorityEntries, useDeleteCodeSession, useRefreshCodeSessionsGit, useSetCodePriority } from "@/components/code-session";
import { CodeStateIcon, PriorityMark } from "@/components/code-session-marks";
import { EmptyState } from "@/components/empty-state";
import { BranchIcon, TerminalIcon, WarningIcon } from "@/components/icons";
import { ListBand } from "@/components/list-band";
import { LongPressMenu, MenuButton, TapMenu, type MenuEntry } from "@/components/menus";
import { ModelLogo } from "@/components/model-logo";
import { useMe } from "@/components/server-scope";
import { allCodeSessionsQuery, applyCodeSession, setCodeSessionParked, stopCodeSession } from "@/lib/code-sessions";
import { listTime } from "@/lib/dates";
import { usePullToRefresh, withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";

/*
 * apps/web/src/screens/Sessions.tsx (Figma « Sessions de code »): every code session of your
 * conversations, as Linear lists issues. What waits for your answer first; then the groups (by state,
 * priority or project), each a band (its mark, its name, its count in grey) and its lines: priority,
 * state, title, where it works (repository · branch, in mono), the agent that started it, the engine,
 * when. « Affichage » holds the view, the grouping, the order and the stopped sessions (shown by default).
 * A line opens the session; its owner's « … » is a long press.
 */

const messages = defineMessages({
  en: {
    emptyView: "Switch to another view, or show stopped sessions in Display.",
    errorTitle: "Sessions unavailable",
    error: "Code sessions can't be reached right now.",
  },
  fr: {
    emptyView: "Passe à une autre vue, ou affiche les sessions arrêtées dans Affichage.",
    errorTitle: "Sessions indisponibles",
    error: "Les sessions de code sont injoignables pour le moment.",
  },
});

type Display = { view: CodeSessionView; group: CodeSessionGrouping; order: CodeSessionOrdering; showStopped: boolean };

const VIEWS: CodeSessionView[] = ["active", "parked", "finished", "all"];
const GROUPINGS: CodeSessionGrouping[] = ["state", "priority", "project"];
const ORDERINGS: CodeSessionOrdering[] = ["priority", "updated", "created"];

type Agent = { name: string; avatar: { color: string; shape?: string } };

export default function SessionsScreen() {
  const t = tr(codeSessions);
  const c = tr(common);
  const b = t.board;
  const me = useMe();
  const [display, setDisplay] = useState<Display>({ view: "all", group: "state", order: "priority", showStopped: true });
  const update = (patch: Partial<Display>) => setDisplay((d) => ({ ...d, ...patch }));
  const { data: sessions, isPending, isError, refetch } = useQuery(allCodeSessionsQuery);
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const pull = usePullToRefresh(refetch);
  useRefreshCodeSessionsGit(sessions);

  const all = sessions ?? [];
  // What each view would show, stopped sessions counted only when they are shown.
  const count = (view: CodeSessionView) => groupCodeSessions(all, { ...display, view }).reduce((n, g) => n + g.sessions.length, 0);
  // What waits for an answer comes first; not repeated below.
  const toDecide = display.view === "parked" || display.view === "finished" ? [] : all.filter((s) => codeSessionState(s) === "waiting" && !s.parked);
  const groups = groupCodeSessions(
    all.filter((s) => !toDecide.includes(s)),
    display,
  );
  const agentOf = (s: CodeSession): Agent | undefined => (s.agentId ? conversations.find((x) => x.id === s.conversationId)?.agents.find((a) => a.id === s.agentId) : undefined);
  const row = (s: CodeSession, grouping: CodeSessionGrouping | null) => <SessionRow key={s.id} session={s} owner={s.requestedBy === me.id} agent={agentOf(s)} showState={grouping !== "state"} />;

  return (
    <>
      <Stack.Screen.Title>{t.sessions}</Stack.Screen.Title>
      {all.length > 0 && (
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.View>
            <MenuButton
              icon="slider.horizontal.3"
              label={b.display}
              actions={[
                { title: b.view, actions: VIEWS.map((v) => ({ label: `${b.views[v]} (${count(v)})`, checked: display.view === v, onPress: () => update({ view: v }) })) },
                "divider",
                { title: b.groupBy, actions: GROUPINGS.map((g) => ({ label: b.groupings[g], checked: display.group === g, onPress: () => update({ group: g }) })) },
                "divider",
                { title: b.orderBy, actions: ORDERINGS.map((o) => ({ label: b.orderings[o], checked: display.order === o, onPress: () => update({ order: o }) })) },
                "divider",
                { label: b.showStopped, checked: display.showStopped, onPress: () => update({ showStopped: !display.showStopped }) },
              ]}
            />
          </Stack.Toolbar.View>
        </Stack.Toolbar>
      )}
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="pb-10" refreshControl={<RefreshControl {...pull} />}>
        {isPending ? (
          <View className="gap-2 p-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))}
          </View>
        ) : isError && !all.length ? (
          <EmptyState icon={WarningIcon} title={messages.errorTitle} description={messages.error} action={{ label: c.retry, onPress: () => void refetch() }} />
        ) : !all.length ? (
          <EmptyState mascot="grey" title={t.page.emptyTitle} description={t.page.empty} />
        ) : !groups.length && !toDecide.length ? (
          <EmptyState icon={TerminalIcon} title={b.empty} description={messages.emptyView} />
        ) : (
          <>
            {toDecide.length > 0 && (
              <View accessibilityLabel={t.stateGroups.waiting}>
                <ListBand mark={<CodeStateIcon state="waiting" size={14} />} label={t.stateGroups.waiting} count={toDecide.length} />
                {toDecide.map((s) => row(s, "state"))}
              </View>
            )}
            {groups.map((g) => (
              <View key={g.key || "none"}>
                <GroupBand grouping={display.group} groupKey={g.key} count={g.sessions.length} />
                {g.sessions.map((s) => row(s, display.group))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

/** A group's band: the state's or the priority's mark, or the repository's name for a project. */
function GroupBand({ grouping, groupKey, count }: { grouping: CodeSessionGrouping; groupKey: string; count: number }) {
  const t = tr(codeSessions);
  if (grouping === "state") return <ListBand mark={<CodeStateIcon state={groupKey as CodeSessionState} size={14} />} label={t.stateGroups[groupKey as CodeSessionState]} count={count} />;
  if (grouping === "priority") return <ListBand mark={<PriorityMark priority={groupKey as CodePriority} />} label={t.priorities[groupKey as CodePriority]} count={count} />;
  return <ListBand mark={<BranchIcon size={14} className="text-muted" />} label={(groupKey.split("/").pop() ?? groupKey) || t.board.noProject} count={count} />;
}

/** Sets a session aside (out of the active ones until its next instruction), or brings it back. */
function useSetCodeParked() {
  const t = tr(codeSessions);
  const qc = useQueryClient();
  const toast = useAdminToast();
  return useMutation({
    mutationFn: (s: Pick<CodeSession, "conversationId" | "id" | "parked">) => setCodeSessionParked(s.conversationId, s.id, !s.parked),
    onSuccess: (s) => {
      applyCodeSession(qc, s);
      toast.success(s.parked ? t.parkedNotice : t.unparkedNotice);
    },
    onError: (e) => toast.failed(e),
  });
}

/**
 * One session (web SessionRow): its priority (a tap, for its owner: the priorities and setting it
 * aside), its state unless the group says it, its title, the engine's logo and when; under the title,
 * where it works in mono and the agent that started it. A long press: its owner's « … » (priority, set
 * aside or bring back, stop while it works, delete).
 */
function SessionRow({ session: s, owner, agent, showState }: { session: CodeSession; owner: boolean; agent?: Agent; showState: boolean }) {
  const t = tr(codeSessions);
  const setPriority = useSetCodePriority();
  const park = useSetCodeParked();
  const confirmDelete = useDeleteCodeSession();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const stop = useMutation({
    mutationFn: () => stopCodeSession(s.conversationId, s.id),
    onSuccess: (fresh) => applyCodeSession(qc, fresh),
    onError: (e) => toast.failed(e),
  });
  const state = codeSessionState(s);
  const working = state === "running" || state === "waiting";
  const branch = s.git?.branch ?? s.worktree?.branch;
  const priorities = priorityEntries(s, (priority) => setPriority.mutate({ conversationId: s.conversationId, id: s.id, priority }));
  const parkEntry: MenuEntry = !working && { label: s.parked ? t.unpark : t.park, mark: <CodeStateIcon state={s.parked ? "idle" : "parked"} />, onPress: () => park.mutate(s) };
  const actions: MenuEntry[] = owner
    ? [
        { submenu: t.priority, actions: priorities },
        parkEntry,
        working && { label: stop.isPending ? t.stopping : t.stop, mark: <CodeStateIcon state="stopped" />, disabled: stop.isPending, onPress: () => stop.mutate() },
        "divider",
        { label: t.deleteSession, icon: "trash", destructive: true, onPress: () => void confirmDelete(s) },
      ]
    : [];
  const mark = (
    <View className="size-7 items-center justify-center">
      <PriorityMark priority={s.priority} />
    </View>
  );
  return (
    <>
      <LongPressMenu actions={actions}>
        <ListGroup.Item onPress={withTap(() => router.push(codeSessionHref(s.conversationId, s.id)))} className="items-start gap-3 px-4 py-2">
          <ListGroup.ItemPrefix className="flex-row items-center gap-1">
            {owner ? (
              <TapMenu actions={[...priorities, parkEntry && "divider", parkEntry]} accessibilityLabel={`${t.priority} ${t.priorities[s.priority]}`}>
                {mark}
              </TapMenu>
            ) : (
              <View accessibilityLabel={t.priorities[s.priority]}>{mark}</View>
            )}
            {showState && (
              <View className="size-7 items-center justify-center">
                <CodeStateIcon state={state} />
              </View>
            )}
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent className="gap-0.5 pt-1">
            <Typography type="body-sm" numberOfLines={1}>
              {s.title}
            </Typography>
            <View className="min-w-0 flex-row items-center gap-2.5">
              {s.repo ? (
                <View className="min-w-0 shrink flex-row items-center gap-2">
                  <Typography type="body-xs" color="muted" className="shrink-0 font-mono">
                    {s.repo.split("/").pop()}
                  </Typography>
                  {!!branch && (
                    <View className="min-w-0 shrink flex-row items-center gap-1">
                      <BranchIcon size={12} className="text-subtle" />
                      <Typography type="body-xs" numberOfLines={1} className="min-w-0 shrink font-mono text-subtle">
                        {branch}
                      </Typography>
                    </View>
                  )}
                </View>
              ) : (
                <Typography type="body-xs" className="text-subtle">
                  {t.noRepo}
                </Typography>
              )}
              {agent && (
                <View className="max-w-32 shrink-0 flex-row items-center gap-1.5">
                  <AgentAvatar agent={agent} size={14} />
                  <Typography type="body-xs" color="muted" numberOfLines={1} className="shrink">
                    {agent.name}
                  </Typography>
                </View>
              )}
            </View>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix className="flex-row items-center gap-2 pt-1.5">
            <View accessibilityLabel={CODE_ENGINE_NAMES[s.engine]}>
              <ModelLogo provider={ENGINE_PROVIDER[s.engine]} model={s.engine === "cursor" ? undefined : s.engine} size={14} />
            </View>
            <Typography type="body-xs" className="text-subtle">
              {listTime(new Date(s.updatedAt))}
            </Typography>
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </LongPressMenu>
      <Separator />
    </>
  );
}
