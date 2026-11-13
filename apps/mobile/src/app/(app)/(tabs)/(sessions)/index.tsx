import {
  CODE_ENGINE_NAMES,
  codeSessionState,
  codeStatusText,
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
import { BrandLogo } from "@/components/brand-logo";
import { codeSessionHref, ENGINE_PROVIDER, LiveSessionCard, PRIORITY_ICONS, priorityEntries, useDeleteCodeSession, useRefreshCodeSessionsGit, useSetCodePriority } from "@/components/code-session";
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

/*
 * apps/web/src/screens/Sessions.tsx (Figma « Sessions de code »): every code session of your
 * conversations, as Linear lists issues. What waits for your answer first, as cards you decide in;
 * then the groups (by state, priority or project), each a band (its mark, its name, its count in grey)
 * and its lines at a phone's width: priority, state, title, the engine, when, its owner's « … ».
 * « Affichage » holds the view, the grouping, the order and the stopped sessions (shown by default).
 * A line opens the session.
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

/** Leading marks of the grouping and ordering options (web displayIcon), as SF Symbols for the native menu. */
const DISPLAY_ICONS: Record<CodeSessionGrouping | CodeSessionOrdering, string> = {
  state: "circle",
  priority: "exclamationmark.3",
  project: "folder",
  updated: "clock.arrow.circlepath",
  created: "clock",
};

export default function SessionsScreen() {
  const t = tr(codeSessions);
  const c = tr(common);
  const b = t.board;
  const me = useMe();
  const [display, setDisplay] = useState<Display>({ view: "all", group: "state", order: "priority", showStopped: true });
  const update = (patch: Partial<Display>) => setDisplay((d) => ({ ...d, ...patch }));
  const { data: sessions, isPending, isError, refetch } = useQuery(allCodeSessionsQuery);
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
  const row = (s: CodeSession, grouping: CodeSessionGrouping) => <SessionRow key={s.id} session={s} owner={s.requestedBy === me.id} showState={grouping !== "state"} />;

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
                { title: b.groupBy, actions: GROUPINGS.map((g) => ({ label: b.groupings[g], icon: DISPLAY_ICONS[g], checked: display.group === g, onPress: () => update({ group: g }) })) },
                "divider",
                { title: b.orderBy, actions: ORDERINGS.map((o) => ({ label: b.orderings[o], icon: DISPLAY_ICONS[o], checked: display.order === o, onPress: () => update({ order: o }) })) },
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
                {/* What waits for an answer stays a card you decide in, without opening it. */}
                <View className="gap-3 px-4 py-3">
                  {toDecide.map((s) => (
                    <LiveSessionCard key={s.id} session={s} onOpen={() => router.push(codeSessionHref(s.conversationId, s.id))} />
                  ))}
                </View>
                <Separator />
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
  return <ListBand mark={<BrandLogo domain="github.com" fallback={<BranchIcon size={14} className="text-muted" />} className="size-3.5" />} label={(groupKey.split("/").pop() ?? groupKey) || t.board.noProject} count={count} />;
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
 * One session (web SessionRow at a phone's width, where its repository, branch and agent columns are
 * hidden): its priority (a tap, for its owner: the priorities and setting it aside), its state unless
 * the group says it, its title, the engine's logo, when, then its owner's « … » (priority, set aside or
 * bring back, stop while it works, delete), also on a long press.
 */
function SessionRow({ session: s, owner, showState }: { session: CodeSession; owner: boolean; showState: boolean }) {
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
  const priorities = priorityEntries(s, (priority) => setPriority.mutate({ conversationId: s.conversationId, id: s.id, priority }));
  const parkEntry: MenuEntry = !working && { label: s.parked ? t.unpark : t.park, icon: s.parked ? "circle" : "circle.dashed", onPress: () => park.mutate(s) };
  const actions: MenuEntry[] = owner
    ? [
        { submenu: t.priority, icon: PRIORITY_ICONS[s.priority], actions: priorities },
        parkEntry,
        working && { label: stop.isPending ? t.stopping : t.stop, icon: "stop.circle", disabled: stop.isPending, onPress: () => stop.mutate() },
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
        <ListGroup.Item onPress={withTap(() => router.push(codeSessionHref(s.conversationId, s.id)))} accessibilityLabel={`${s.title}, ${codeStatusText(t, s)}`} className="gap-2 py-1.5 pr-2 pl-3">
          <ListGroup.ItemPrefix className="flex-row items-center">
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
          <ListGroup.ItemContent>
            <Typography type="body-sm" numberOfLines={1}>
              {s.title}
            </Typography>
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix className="flex-row items-center gap-3">
            <View accessibilityLabel={CODE_ENGINE_NAMES[s.engine]}>
              <ModelLogo provider={ENGINE_PROVIDER[s.engine]} model={s.engine === "cursor" ? undefined : s.engine} size={14} />
            </View>
            <Typography type="body-xs" className="w-12 text-right text-subtle">
              {listTime(new Date(s.updatedAt))}
            </Typography>
            {owner && <MenuButton icon="ellipsis" label={t.actions} actions={actions} />}
          </ListGroup.ItemSuffix>
        </ListGroup.Item>
      </LongPressMenu>
      <Separator />
    </>
  );
}
