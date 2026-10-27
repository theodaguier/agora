import { codeSessionState, groupCodeSessions, inCodeSessionView, type CodePriority, type CodeSession, type CodeSessionGrouping, type CodeSessionOrdering, type CodeSessionState, type CodeSessionView } from "@agora/core";
import { codeSessions } from "@agora/core/i18n";
import { useQuery } from "@tanstack/react-query";
import { router, Stack } from "expo-router";
import { ListGroup, Separator, Skeleton, Typography } from "heroui-native";
import { Fragment, useState } from "react";
import { RefreshControl, ScrollView, View } from "react-native";
import { CodeSessionRow, codeSessionHref, useRefreshCodeSessionsGit } from "@/components/code-session";
import { CodePriorityIcon, CodeStateIcon } from "@/components/code-session-marks";
import { EmptyState } from "@/components/empty-state";
import { FilterTags } from "@/components/filter-tags";
import { TerminalIcon } from "@/components/icons";
import { MenuButton } from "@/components/menus";
import { useMe } from "@/components/server-scope";
import { allCodeSessionsQuery } from "@/lib/code-sessions";
import { usePullToRefresh } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { conversationsQuery } from "@/lib/queries";

/*
 * apps/web/src/screens/Sessions.tsx, Figma Mobile « Sessions »: your code sessions of every conversation,
 * in views (Actives, Finies, Toutes), grouped and ordered as the « Affichage » menu says. A row opens the
 * session's screen.
 */

type Display = { view: CodeSessionView; group: CodeSessionGrouping; order: CodeSessionOrdering; showStopped: boolean };

const VIEWS: CodeSessionView[] = ["active", "finished", "all"];
const GROUPINGS: CodeSessionGrouping[] = ["state", "priority", "project"];
const ORDERINGS: CodeSessionOrdering[] = ["priority", "updated", "created"];

export default function SessionsScreen() {
  const t = tr(codeSessions);
  const me = useMe();
  const [display, setDisplay] = useState<Display>({ view: "active", group: "state", order: "priority", showStopped: false });
  const update = (patch: Partial<Display>) => setDisplay((d) => ({ ...d, ...patch }));
  const { data: sessions, isPending, refetch } = useQuery(allCodeSessionsQuery);
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const pull = usePullToRefresh(refetch);
  useRefreshCodeSessionsGit(sessions);

  const all = sessions ?? [];
  // Counts follow the display: the stopped ones only when they are shown.
  const count = (view: CodeSessionView) =>
    all.filter((s) => {
      const state = codeSessionState(s);
      return inCodeSessionView(state, view) && (display.showStopped || (state !== "stopped" && state !== "failed"));
    }).length;
  const groups = groupCodeSessions(all, display);
  const agentOf = (s: CodeSession) => (s.agentId ? conversations.find((c) => c.id === s.conversationId)?.agents.find((a) => a.id === s.agentId) : undefined);

  return (
    <>
      <Stack.Screen.Title>{t.page.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <MenuButton
            icon="slider.horizontal.3"
            label={t.board.display}
            actions={[
              { title: t.board.groupBy, actions: GROUPINGS.map((g) => ({ label: t.board.groupings[g], checked: display.group === g, onPress: () => update({ group: g }) })) },
              { title: t.board.orderBy, actions: ORDERINGS.map((o) => ({ label: t.board.orderings[o], checked: display.order === o, onPress: () => update({ order: o }) })) },
              "divider",
              { label: t.board.showStopped, checked: display.showStopped, onPress: () => update({ showStopped: !display.showStopped }) },
            ]}
          />
        </Stack.Toolbar.View>
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" className="bg-background" contentContainerClassName="gap-5 pb-10 pt-2" refreshControl={<RefreshControl {...pull} />}>
        {isPending ? (
          <View className="gap-3 px-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-16 w-full rounded-2xl" />
            ))}
          </View>
        ) : !all.length ? (
          <EmptyState icon={TerminalIcon} title={t.page.emptyTitle} description={t.page.empty} />
        ) : (
          <>
            <FilterTags
              accessibilityLabel={t.page.title}
              value={display.view}
              onChange={(view) => update({ view })}
              options={VIEWS.map((v) => ({ id: v, label: v === "all" ? t.board.views[v] : `${t.board.views[v]} ${count(v)}` }))}
            />
            {groups.length ? (
              <View className="gap-5">
                {groups.map((g) => (
                  <View key={g.key || "none"} className="gap-2">
                    <GroupTitle grouping={display.group} groupKey={g.key} count={g.sessions.length} />
                    <ListGroup className="mx-4 overflow-hidden">
                      {g.sessions.map((s, i) => (
                        <Fragment key={s.id}>
                          {i > 0 && <Separator className="ml-16" />}
                          <CodeSessionRow
                            session={s}
                            owner={s.requestedBy === me.id}
                            agent={agentOf(s)}
                            showState={display.group !== "state"}
                            onOpen={() => router.push(codeSessionHref(s.conversationId, s.id))}
                          />
                        </Fragment>
                      ))}
                    </ListGroup>
                  </View>
                ))}
              </View>
            ) : (
              <EmptyState icon={TerminalIcon} description={t.board.empty} />
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

/** Figma « Titre de groupe »: the group's mark, its name and its count; a project shows its repository's name. */
function GroupTitle({ grouping, groupKey, count }: { grouping: CodeSessionGrouping; groupKey: string; count: number }) {
  const t = tr(codeSessions);
  const label =
    grouping === "state"
      ? t.stateGroups[groupKey as CodeSessionState]
      : grouping === "priority"
        ? t.priorities[groupKey as CodePriority]
        : groupKey
          ? (groupKey.split("/").pop() ?? groupKey)
          : t.board.noProject;
  return (
    <View className="flex-row items-center gap-2 px-6">
      {grouping === "state" && <CodeStateIcon state={groupKey as CodeSessionState} size={14} />}
      {grouping === "priority" && <CodePriorityIcon priority={groupKey as CodePriority} size={14} />}
      <Typography type="body-sm" color="muted">
        {label}
      </Typography>
      <Typography type="body-sm" className="text-subtle">
        {count}
      </Typography>
    </View>
  );
}
