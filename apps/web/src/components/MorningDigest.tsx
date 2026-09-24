import { lazy, Suspense, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouteContext } from "@tanstack/react-router";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { ModelLogo } from "@/components/ProviderLogo";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFormat } from "@/lib/usage-format";
import { coverGradient } from "@/components/WhatsNew";
import { getLocale, useT } from "@/i18n";
import { messages } from "./MorningDigest.messages";
import { api, type AgentSummary, type Digest, type DigestStats } from "@/lib/api";
import { fromDay } from "@/lib/dates";
import { setDigestOpen, useDigestOpen } from "@/lib/digest";
import { MentionText } from "@/lib/mentions";
import { useMentionables } from "@/lib/people";
import { digestQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";
import { isWhatsNewOpen, useWhatsNewOpen } from "@/lib/whats-new";

/** Opens by itself only on the day it was written: an older recap waits in the user menu. */
const FRESH_MS = 20 * 3_600_000;

/** Remembered on the account, so the same recap doesn't open again on another device. */
const markSeen = (id: string) => api("/digest/seen", { method: "PUT", body: JSON.stringify({ id }) }).catch(() => {});

/** Recaps already opened automatically in this tab. */
const opened = new Set<string>();

const NO_AGENTS: AgentSummary[] = [];

// Recharts only loads once the recap is expanded.
const DigestActivity = lazy(() => import("./DigestActivity").then((m) => ({ default: m.DigestActivity })));

type Tab = "team" | "you";

/** Morning recap dialog, in the style of "What's new": opens once per recap, then from the user menu. Mounted once in the shell. */
export function MorningDigest() {
  const { user } = useRouteContext({ from: "/app" });
  const { data: digest } = useQuery(digestQuery);
  const open = useDigestOpen();
  const whatsNewOpen = useWhatsNewOpen();
  const qc = useQueryClient();
  const t = useT(messages);
  const mentionables = useMentionables(digest?.agents ?? NO_AGENTS);
  const [expanded, setExpanded] = useState(false);
  const [tab, setTab] = useState<Tab>("team");

  useEffect(() => {
    if (!digest || digest.seen || whatsNewOpen || isWhatsNewOpen() || opened.has(digest.id)) return;
    // Wait for the changelog to be closed; an account created since has nothing to catch up on.
    if (Date.now() - new Date(digest.createdAt).getTime() > FRESH_MS || new Date(user.createdAt) >= new Date(digest.createdAt)) return;
    opened.add(digest.id);
    setDigestOpen(true);
  }, [digest, whatsNewOpen, user.createdAt]);

  useEffect(() => {
    if (!open) return;
    setExpanded(false);
    setTab("team");
  }, [open]);

  if (!digest) return null;

  const close = () => {
    setDigestOpen(false);
    if (digest.seen) return;
    void markSeen(digest.id).then(() => qc.setQueryData<Digest | null>(digestQuery.queryKey, (d) => d && { ...d, seen: true }));
  };

  const locale = getLocale();
  const day = (d: string, opts: Intl.DateTimeFormatOptions) => fromDay(d).toLocaleDateString(locale, opts);
  const weekly = digest.kind === "weekly";
  // A daily recap covers several days after days without one (the weekend, when only weekdays are scheduled).
  const multiDay = digest.periodStart !== digest.periodEnd;
  const range = `${day(digest.periodStart, { day: "numeric", month: "short" })} – ${day(digest.periodEnd, { day: "numeric", month: "short" })}`;
  const title = weekly ? t.weekly(range) : t.daily(multiDay ? range : day(digest.periodStart, { weekday: "long", day: "numeric", month: "long" }));
  const writtenAt = new Date(digest.createdAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

  const personal = digest.personal;
  const current: Tab = tab === "you" && personal ? "you" : "team";
  const headline = current === "you" ? personal!.headline : digest.team.headline;
  const sections =
    current === "you"
      ? [
          { label: t.attention, items: personal!.attention },
          { label: t.todo, items: personal!.next },
          { label: t.done, items: personal!.done },
        ]
      : [
          { label: t.done, items: digest.team.done },
          { label: t.inProgress, items: digest.team.inProgress },
          { label: t.next, items: digest.team.next },
        ];
  // Recaps written before per-part figures have none.
  const raw = current === "you" ? personal!.stats : digest.stats;
  const stats = raw && "tasks" in raw ? raw : null;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      {/* Title and buttons stay put; everything between them, cover included, scrolls on a short screen. */}
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" initialFocus={false}>
        <DialogHeader className="shrink-0 px-6 pt-6 pb-4">
          <DialogTitle className="pr-8 text-xl font-semibold tracking-tight">{title}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-6 pb-6">
          {/* Capped so it never takes the whole screen; shrinks once the details are shown. */}
          <div
            className={cn(
              "relative w-full shrink-0 overflow-hidden rounded-lg bg-muted transition-[aspect-ratio] duration-200 ease-out",
              expanded ? "aspect-[4/1]" : "aspect-video max-h-[32dvh]",
            )}
          >
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2" style={{ backgroundImage: coverGradient }}>
              <span className={cn("font-mono text-xs tracking-[0.2em] text-muted-foreground uppercase", expanded && "hidden")}>
                {weekly ? t.weeklyLabel : t.dailyLabel}
              </span>
              <span className={cn("font-medium tracking-tight tabular-nums", expanded ? "text-3xl" : "text-4xl sm:text-5xl")}>
                {multiDay ? range : day(digest.periodStart, { day: "numeric", month: "short" })}
              </span>
            </div>
          </div>
          {personal && (
            // Stays in view while the details scroll under it.
            <Tabs value={current} onValueChange={(v) => setTab(v as Tab)} className="sticky -top-px z-10 -my-2 bg-background py-2">
              <TabsList>
                <TabsTrigger value="team">{t.team}</TabsTrigger>
                <TabsTrigger value="you">{t.you}</TabsTrigger>
              </TabsList>
            </Tabs>
          )}
          <DialogDescription className="text-base text-pretty text-foreground">
            <MentionText text={headline} mentionables={mentionables} />
          </DialogDescription>
          {stats && <StatBadges stats={stats} you={current === "you"} />}
          {expanded &&
            sections
              .filter((s) => s.items.length)
              .map((s) => (
                <section key={s.label} className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium">{s.label}</h3>
                  <ul className="flex list-disc flex-col gap-2 pl-5 text-muted-foreground marker:text-muted-foreground/50">
                    {s.items.map((line) => (
                      <li key={line} className="text-pretty">
                        <MentionText text={line} mentionables={mentionables} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
          {expanded && stats && (
            <Suspense fallback={null}>
              <DigestActivity stats={stats} byDay={multiDay} />
            </Suspense>
          )}
          {expanded && stats?.usage && stats.usage.tokens > 0 && <UsageBlock usage={stats.usage} you={current === "you"} />}
          {expanded && current === "team" && !!stats?.people?.length && <People people={stats.people} />}
          <p className="text-sm text-muted-foreground">{t.writtenAt(writtenAt)}</p>
        </div>
        <DialogFooter className="mx-0 mb-0 shrink-0 rounded-b-2xl px-6">
          {expanded ? (
            <Button onClick={close}>{t.close}</Button>
          ) : (
            <>
              <Button variant="outline" onClick={close}>
                {t.skip}
              </Button>
              <Button onClick={() => setExpanded(true)}>{t.learnMore}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The part's figures at a glance. */
function StatBadges({ stats, you }: { stats: DigestStats; you: boolean }) {
  const t = useT(messages);
  const f = useFormat();
  return (
    <div className="flex flex-wrap gap-1.5">
      <Badge variant="secondary">{t.tasksDone(stats.tasks.done)}</Badge>
      {stats.tasks.overdue > 0 && <Badge variant="destructive">{t.overdue(stats.tasks.overdue)}</Badge>}
      {stats.tasks.open > 0 && <Badge variant="outline">{t.open(stats.tasks.open)}</Badge>}
      {stats.messages > 0 && <Badge variant="outline">{t.messages(stats.messages)}</Badge>}
      {you && stats.conversations > 0 && <Badge variant="outline">{t.conversations(stats.conversations)}</Badge>}
      {stats.agents > 0 && <Badge variant="outline">{t.agents(stats.agents)}</Badge>}
      {!!stats.usage?.tokens && (
        <Badge variant="outline" className="tabular-nums">
          {t.tokens(f.compact(stats.usage.tokens))} · {f.cost(stats.usage.cost)}
        </Badge>
      )}
    </div>
  );
}

/** Tokens and estimated cost, split by bot and by model. */
function UsageBlock({ usage, you }: { usage: NonNullable<DigestStats["usage"]>; you: boolean }) {
  const t = useT(messages);
  const f = useFormat();
  const top = usage.byAgent[0]?.tokens || 1;
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{t.usage}</h3>
        <p className="text-xs text-muted-foreground">{you ? t.usageYou : t.usageTeam}</p>
      </div>
      <div className="flex items-baseline gap-4">
        <span className="text-2xl font-medium tracking-tight tabular-nums">{f.compact(usage.tokens)}</span>
        <span className="text-muted-foreground tabular-nums">{f.cost(usage.cost)}</span>
      </div>
      {usage.byAgent.length > 0 && (
        <ul className="flex flex-col gap-2" aria-label={t.byAgent}>
          {usage.byAgent.map((a) => (
            <li key={a.id} className="grid grid-cols-[1.25rem_minmax(0,7rem)_1fr_8.5rem] items-center gap-2 text-sm">
              <AgentAvatar agent={a} className="size-5" />
              <span className="truncate">{a.name}</span>
              <span className="h-1.5 overflow-hidden rounded-full bg-muted">
                <span className="block h-full rounded-full" style={{ width: `${(a.tokens / top) * 100}%`, background: a.avatar.color }} />
              </span>
              <span className="text-right font-mono text-xs text-muted-foreground tabular-nums">
                {f.compact(a.tokens)} · {f.cost(a.cost)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {usage.byModel.length > 0 && (
        <div className="flex flex-wrap gap-1.5" aria-label={t.byModel}>
          {usage.byModel.map((m) => (
            <Badge key={`${m.provider}:${m.model}`} variant="outline" className="tabular-nums">
              <ModelLogo model={m.model} provider={m.provider} className="size-3" />
              {m.model} · {f.compact(m.tokens)}
            </Badge>
          ))}
        </div>
      )}
    </section>
  );
}

/** Members with the most done tasks and messages over the period. */
function People({ people }: { people: NonNullable<DigestStats["people"]> }) {
  const t = useT(messages);
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium">{t.people}</h3>
      <ul className="flex flex-col gap-2">
        {people.map((p) => (
          <li key={p.id} className="flex items-center gap-2 text-sm">
            <PersonAvatar person={p} className="size-5" />
            <span className="min-w-0 flex-1 truncate">{p.name}</span>
            {p.tasksDone > 0 && <Badge variant="secondary">{t.tasksDoneShort(p.tasksDone)}</Badge>}
            {p.messages > 0 && <Badge variant="outline">{t.messages(p.messages)}</Badge>}
          </li>
        ))}
      </ul>
    </section>
  );
}
