import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { useState } from "react";
import { CODE_ENGINE_NAMES, codeStatusText, type CodeSession, type CodeSessionStatus } from "@agora/core";
import { codeSessions, common } from "@agora/core/i18n";
import { ChevronLeftIcon, TerminalIcon } from "@/components/icons";
import { ModelLogo } from "@/components/ProviderLogo";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { EmptyFigure } from "@/components/EmptyFigure";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useT } from "@/i18n";
import { allCodeSessionsQuery } from "@/lib/code-sessions";
import { updateSide } from "@/lib/conversation-side";
import { listTime } from "@/lib/dates";
import { useOrgTitle } from "@/lib/org";
import { conversationTitle } from "@/lib/participants";
import { conversationsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Group = "review" | "running" | "ended";
type Filter = "all" | Group;

/** Rests after its run, its work to read: review. Works or waits on someone: running. Over: ended. */
const groupOf = (s: CodeSessionStatus): Group => (s === "idle" ? "review" : s === "running" || s === "waiting" ? "running" : "ended");
const WEEK = 7 * 86_400_000;

/**
 * Figma « Page Sessions »: every Claude Code session of your conversations, wherever it was started.
 * To review first (it finished its run), then those at work, then the ended ones. A row opens its
 * conversation with the session beside the thread.
 */
export function Sessions() {
  const t = useT(codeSessions);
  const c = useT(common);
  const p = t.page;
  useOrgTitle(p.title);
  const [filter, setFilter] = useState<Filter>("all");
  const { data: sessions = [], isPending } = useQuery(allCodeSessionsQuery);
  const count = (g: Group) => sessions.filter((s) => groupOf(s.status) === g).length;
  const shown = (g: Group) => (filter === "all" || filter === g ? sessions.filter((s) => groupOf(s.status) === g) : []);
  const ended = shown("ended");
  const recent = ended.filter((s) => Date.now() - new Date(s.updatedAt).getTime() < WEEK);
  const older = ended.filter((s) => !recent.includes(s));
  const groups = [
    { key: "review", title: p.review, rows: shown("review") },
    { key: "running", title: p.running, rows: shown("running") },
    { key: "recent", title: p.endedWeek, rows: recent },
    { key: "older", title: p.older, rows: older },
  ].filter((g) => g.rows.length);
  return (
    <section className="flex h-full min-w-0 flex-1 flex-col bg-background">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[720px] flex-col px-4 pt-6 pb-12 md:pt-10">
          <Button variant="ghost" size="icon" nativeButton={false} render={<Link to="/" aria-label={c.back} />} className="-ml-2 mb-2 hover:bg-transparent md:hidden">
            <ChevronLeftIcon className="size-5" />
          </Button>
          <h1 className="text-xl leading-7 font-medium">{p.title}</h1>
          {sessions.length > 0 && (
            <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)} className="mt-3">
              <TabsList>
                {(["all", "review", "running", "ended"] as const).map((f) => (
                  <TabsTrigger key={f} value={f}>
                    {p[f]}
                    {f !== "all" && f !== "ended" && count(f) > 0 && <span className="tabular-nums text-muted-foreground">{count(f)}</span>}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          )}
          {isPending ? (
            <Spinner className="mx-auto mt-16 size-5 text-muted-foreground" />
          ) : !groups.length ? (
            <Empty className="mt-10">
              {sessions.length ? (
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <TerminalIcon />
                  </EmptyMedia>
                  <EmptyTitle>{p.emptyFilter}</EmptyTitle>
                </EmptyHeader>
              ) : (
                <EmptyHeader>
                  <EmptyFigure mascot="grey" />
                  <EmptyTitle>{p.emptyTitle}</EmptyTitle>
                  <EmptyDescription>{p.empty}</EmptyDescription>
                </EmptyHeader>
              )}
            </Empty>
          ) : (
            groups.map((g) => (
              <FieldSet key={g.key} className="mt-8 gap-2">
                <FieldLegend variant="label" className="mb-0 font-normal text-muted-foreground">
                  {g.title}
                </FieldLegend>
                <ItemGroup className="gap-2">
                  {g.rows.map((s) => (
                    <SessionRow key={s.id} session={s} />
                  ))}
                </ItemGroup>
              </FieldSet>
            ))
          )}
        </div>
      </div>
    </section>
  );
}

/** One session: its engine, its title, who started it where and where it stands; when; « Relire » once it rests. */
function SessionRow({ session: s }: { session: CodeSession }) {
  const t = useT(codeSessions);
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const conv = conversations.find((c) => c.id === s.conversationId);
  const agent = s.agentId ? conv?.agents.find((a) => a.id === s.agentId) : undefined;
  const who = agent?.name ?? (s.requestedBy === user.id ? t.page.you : CODE_ENGINE_NAMES[s.engine]);
  const group = groupOf(s.status);
  const where =
    s.status === "waiting"
      ? codeStatusText(t, s)
      : group === "running"
        ? (s.activity ?? codeStatusText(t, s))
      : s.git?.pr
        ? `${t.git.pr(s.git.pr.number)} ${t.git.prState[s.git.pr.state]}`
        : group === "ended"
          ? codeStatusText(t, s)
          : (s.git?.branch ?? (s.todos.length ? t.page.todos(s.todos.filter((x) => x.status === "completed").length, s.todos.length) : null));
  // A direct conversation with the bot is named after it: once is enough.
  const place = conv && conversationTitle(conv, user.id);
  const open = () => {
    updateSide(s.conversationId, (side) => ({ ...side, panel: null, previewKey: null, codeTabs: side.codeTabs.includes(s.id) ? side.codeTabs : [...side.codeTabs, s.id], codeSession: s.id }));
    void navigate({ to: "/c/$conversationId", params: { conversationId: s.conversationId } });
  };
  return (
    <Item variant="outline" render={<button type="button" onClick={open} />} className="text-left hover:bg-muted/60">
      <ItemMedia variant="image" className="rounded-[10px] border border-border">
        <ModelLogo provider={s.engine === "codex" ? "codex" : s.engine === "cursor" ? "cursor" : "claude-code"} className="size-5" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full font-normal">
          <span className="truncate">{s.title}</span>
        </ItemTitle>
        <ItemDescription className="line-clamp-1">
          {[who, place !== who && place].filter(Boolean).join(" · ")}
          {where && (
            <>
              {" · "}
              <span className={cn(s.status === "waiting" && "text-warning-foreground", s.status === "failed" && "text-destructive")}>{where}</span>
            </>
          )}
        </ItemDescription>
      </ItemContent>
      <ItemActions>
        <span className="text-xs text-muted-foreground tabular-nums">{listTime(new Date(s.updatedAt))}</span>
        {group === "review" && (
          <Button variant="secondary" size="sm" nativeButton={false} render={<span />}>
            {t.page.reread}
          </Button>
        )}
      </ItemActions>
    </Item>
  );
}
