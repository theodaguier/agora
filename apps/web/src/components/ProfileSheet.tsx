import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ClockIcon, ToolIcon } from "@/components/icons";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { ConversationAvatar, PersonAvatar, StatusAvatar, useStatusLabel } from "@/components/ConversationAvatar";
import { conversationTitle } from "@/lib/participants";
import { WorkingOn } from "@/components/WorkingOn";
import { RoutineActions, useToggleRoutine } from "@/components/RoutineDialog";
import { TaskList } from "@/components/TaskList";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Spinner } from "@/components/ui/spinner";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type AgentProfile, type UserProfile } from "@/lib/api";
import { linkClass } from "@/lib/links";
import { closeProfile, useProfileTarget } from "@/lib/profile";
import { agentActivityQuery, agentProfileQuery, conversationsQuery, userProfileQuery, type AgentActivity } from "@/lib/queries";
import { dividerLabel } from "@/lib/dates";
import { scheduleLabel } from "@/lib/routines";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";
import { dateFormat } from "@/lib/intl";

const messages = defineMessages({
  en: {
    profile: "Profile",
    unavailable: "Profile unavailable.",
    noTasks: "No tasks.",
    message: (name: string) => `Message ${name}`,
    openFailed: "Couldn't open the conversation.",
    email: "Email",
    memberSince: "Member since",
    common: (n: number) => `Conversations in common · ${n}`,
    tasks: "Tasks",
    members: (n: number) => `${n} members`,
    bot: "Bot",
    botSince: (date: string) => `Bot · since ${date}`,
    botTasks: "Tasks it created",
    noBotTasks: "It hasn't created any tasks yet.",
    now: "Right now",
    idle: "Not working on anything right now.",
    elsewhere: "Working in a conversation you're not part of.",
    alsoElsewhere: (n: number) => (n === 1 ? "And in another conversation you're not part of." : `And in ${n} other conversations you're not part of.`),
    using: "Using",
    writing: "Writing a reply",
    routines: "Routines",
    noRoutines: "No routines in your conversations.",
    next: (when: string) => `Next: ${when}`,
    paused: "Paused",
    conversation: "Conversation",
  },
  fr: {
    profile: "Profil",
    unavailable: "Profil indisponible.",
    noTasks: "Aucune tâche.",
    message: (name: string) => `Écrire à ${name}`,
    openFailed: "Impossible d'ouvrir la conversation.",
    email: "Email",
    memberSince: "Membre depuis",
    common: (n: number) => `Conversations en commun · ${n}`,
    tasks: "Tâches",
    members: (n: number) => `${n} membres`,
    bot: "Bot",
    botSince: (date: string) => `Bot · depuis ${date}`,
    botTasks: "Tâches qu'il a créées",
    noBotTasks: "Il n'a encore créé aucune tâche.",
    now: "En ce moment",
    idle: "Ne travaille sur rien en ce moment.",
    elsewhere: "Travaille dans une conversation dont tu ne fais pas partie.",
    alsoElsewhere: (n: number) =>
      n === 1 ? "Et dans une autre conversation dont tu ne fais pas partie." : `Et dans ${n} autres conversations dont tu ne fais pas partie.`,
    using: "Utilise",
    writing: "Rédige une réponse",
    routines: "Routines",
    noRoutines: "Aucune routine dans tes conversations.",
    next: (when: string) => `Prochaine : ${when.charAt(0).toLowerCase()}${when.slice(1)}`,
    paused: "En pause",
    conversation: "Conversation",
  },
});

/** A colleague's profile (who they are, what they work on, the conversations you share) or a bot's (the tasks it created). */
export function ProfileSheet() {
  const target = useProfileTarget();
  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && closeProfile()}>
      <SheetContent className="w-full gap-0 bg-background data-[side=right]:sm:max-w-md">
        {target?.kind === "user" && <Profile key={target.id} userId={target.id} />}
        {target?.kind === "agent" && <BotProfile key={target.id} agentId={target.id} />}
      </SheetContent>
    </Sheet>
  );
}

function Profile({ userId }: { userId: string }) {
  const { user: me } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  const { data: person, error } = useQuery(userProfileQuery(userId));
  const self = userId === me.id;

  return (
    <>
      <SheetHeader className="gap-3 border-b border-border/60 px-5 py-5 pr-14">
        {person ? (
          <PersonHeader person={person} self={self} />
        ) : (
          <div className="flex items-center gap-3">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <SheetTitle className="sr-only">{t.profile}</SheetTitle>
              <SheetDescription className="sr-only">{t.profile}</SheetDescription>
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        )}
        {person && <WorkingOn userId={userId} />}
      </SheetHeader>

      {error ? (
        <p role="alert" className="px-5 py-4 text-sm text-destructive">
          {t.unavailable}
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-6 px-5 pb-10 pt-4">
            {person && <Details person={person} />}
            {!self && <CommonConversations userId={userId} />}
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">{t.tasks}</h3>
              <TaskList userId={userId} empty={t.noTasks} />
            </section>
          </div>
        </ScrollArea>
      )}
    </>
  );
}

function BotProfile({ agentId }: { agentId: string }) {
  const t = useT(messages);
  const { data: agent, error } = useQuery(agentProfileQuery(agentId));

  return (
    <>
      <SheetHeader className="gap-3 border-b border-border/60 px-5 py-5 pr-14">
        {agent ? (
          <BotHeader agent={agent} />
        ) : (
          <div className="flex items-center gap-3">
            <Skeleton className="size-14 rounded-full" />
            <div className="flex flex-col gap-1.5">
              <SheetTitle className="sr-only">{t.profile}</SheetTitle>
              <SheetDescription className="sr-only">{t.bot}</SheetDescription>
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        )}
      </SheetHeader>

      {error ? (
        <p role="alert" className="px-5 py-4 text-sm text-destructive">
          {t.unavailable}
        </p>
      ) : (
        <ScrollArea className="min-h-0 flex-1">
          <div className="flex flex-col gap-6 px-5 pb-10 pt-4">
            <BotActivity agentId={agentId} />
            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">{t.botTasks}</h3>
              <TaskList agentId={agentId} empty={t.noBotTasks} />
            </section>
          </div>
        </ScrollArea>
      )}
    </>
  );
}

/** What the bot is doing right now and the routines it runs, in your conversations only. */
function BotActivity({ agentId }: { agentId: string }) {
  const t = useT(messages);
  const { data: activity } = useQuery(agentActivityQuery(agentId));
  if (!activity)
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-3 w-24" />
        <Skeleton className="h-10 w-full rounded-lg" />
      </div>
    );
  return (
    <>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t.now}</h3>
        {activity.turns.length ? (
          <ItemGroup className="-mx-2 gap-0.5">
            {activity.turns.map((turn) => (
              <TurnItem key={`${turn.conversationId}:${turn.startedAt}`} turn={turn} />
            ))}
          </ItemGroup>
        ) : (
          <p className="text-sm text-muted-foreground">{activity.elsewhere ? t.elsewhere : t.idle}</p>
        )}
        {activity.turns.length > 0 && activity.elsewhere > 0 && <p className="text-[13px] text-muted-foreground">{t.alsoElsewhere(activity.elsewhere)}</p>}
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-medium text-muted-foreground">{t.routines}</h3>
        {activity.routines.length ? (
          <ItemGroup className="-mx-2 gap-0.5">
            {activity.routines.map((r) => (
              <RoutineItem key={r.id} routine={r} />
            ))}
          </ItemGroup>
        ) : (
          <p className="text-sm text-muted-foreground">{t.noRoutines}</p>
        )}
      </section>
    </>
  );
}

/** Title of one of your conversations, by id. */
function useConversationTitle(conversationId: string) {
  const { user: me } = useRouteContext({ from: "/app" });
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const c = conversations.find((x) => x.id === conversationId);
  return c ? conversationTitle(c, me.id) : null;
}

function TurnItem({ turn }: { turn: AgentActivity["turns"][number] }) {
  const t = useT(messages);
  const title = useConversationTitle(turn.conversationId);
  return (
    <Item
      size="sm"
      className="px-2 py-1.5"
      render={<Link to="/c/$conversationId" params={{ conversationId: turn.conversationId }} onClick={() => closeProfile()} />}
    >
      <ItemMedia>
        <Spinner className="size-4 text-muted-foreground" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">{title ?? t.conversation}</ItemTitle>
        <ItemDescription className="flex items-center gap-1.5">
          {turn.tool ? (
            <>
              {t.using}
              <Badge variant="secondary" className="h-auto gap-1 rounded-md px-1.5 py-0.5 font-mono text-[12px] font-normal text-foreground/80">
                <ToolIcon name={turn.tool} className="size-3.5" />
                {turn.tool}
              </Badge>
            </>
          ) : (
            t.writing
          )}
        </ItemDescription>
      </ItemContent>
    </Item>
  );
}

function RoutineItem({ routine }: { routine: AgentActivity["routines"][number] }) {
  const t = useT(messages);
  const title = useConversationTitle(routine.conversationId);
  const toggle = useToggleRoutine(routine.conversationId, routine);
  const when = routine.enabled ? (routine.nextRunAt ? t.next(dividerLabel(new Date(routine.nextRunAt))) : null) : t.paused;
  return (
    <div className="flex items-start gap-1">
      <Item
        size="sm"
        className="min-w-0 flex-1 items-start px-2 py-1.5"
        render={<Link to="/c/$conversationId" params={{ conversationId: routine.conversationId }} onClick={() => closeProfile()} />}
      >
        <ItemMedia className="pt-0.5">
          <ClockIcon className={cn("size-4", routine.enabled ? "text-success" : "text-muted-foreground")} />
        </ItemMedia>
        <ItemContent className="min-w-0 gap-0.5">
          <ItemTitle className="w-full truncate font-normal">{routine.name}</ItemTitle>
          <ItemDescription className="text-[13px]">{[scheduleLabel(routine), when].filter(Boolean).join(" · ")}</ItemDescription>
          {title && <ItemDescription className="truncate text-[13px]">{title}</ItemDescription>}
          {toggle.error && <p className="text-[13px] text-destructive">{toggle.error.message}</p>}
        </ItemContent>
      </Item>
      <div className="pt-1">
        <RoutineActions conversationId={routine.conversationId} routine={routine} toggle={toggle} />
      </div>
    </div>
  );
}

/** Avatar with its status, name (opens the direct conversation, if you may use the bot), and since when it exists. */
function BotHeader({ agent }: { agent: AgentProfile }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const p = { kind: "agent" as const, agent };
  const status = useStatusLabel(p);
  const open = useMutation({
    mutationFn: () => api<{ id: string }>("/conversations/direct", { method: "POST", body: JSON.stringify({ agentId: agent.id }) }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      closeProfile();
      navigate({ to: "/c/$conversationId", params: { conversationId: id } });
    },
  });
  const since = dateFormat({ month: "long", year: "numeric" }).format(new Date(agent.createdAt));

  return (
    <div className="flex items-center gap-3">
      <StatusAvatar p={p} className="size-14" ring="ring-background" />
      <div className="min-w-0">
        <SheetTitle className="truncate text-base">
          {agent.access && !agent.onboarding ? (
            <button
              type="button"
              onClick={() => open.mutate()}
              disabled={open.isPending}
              title={t.message(agent.name)}
              className="max-w-full truncate rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
            >
              {agent.name}
            </button>
          ) : (
            agent.name
          )}
        </SheetTitle>
        <SheetDescription className="truncate">{t.botSince(since)}</SheetDescription>
        {status && <p className="truncate text-xs text-muted-foreground">{status}</p>}
        {open.isError && (
          <p role="alert" className="text-xs text-destructive">
            {t.openFailed}
          </p>
        )}
      </div>
    </div>
  );
}

/** Photo, name (opens the direct conversation), title, handle and presence. */
function PersonHeader({ person, self }: { person: UserProfile; self: boolean }) {
  const t = useT(messages);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const status = useStatusLabel({ kind: "user", person });
  const open = useMutation({
    mutationFn: () => api<{ id: string }>("/conversations/direct", { method: "POST", body: JSON.stringify({ userId: person.id }) }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      closeProfile();
      navigate({ to: "/c/$conversationId", params: { conversationId: id } });
    },
  });
  const subtitle = [person.title, person.username && `@${person.username}`].filter(Boolean).join(" · ");

  return (
    <div className="flex items-center gap-3">
      <PersonAvatar person={person} className="size-14" />
      <div className="min-w-0">
        <SheetTitle className="truncate text-base">
          {self ? (
            person.name
          ) : (
            <button
              type="button"
              onClick={() => open.mutate()}
              disabled={open.isPending}
              title={t.message(person.name.split(" ")[0]!)}
              className="max-w-full truncate rounded-sm text-left underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
            >
              {person.name}
            </button>
          )}
        </SheetTitle>
        <SheetDescription className="truncate">{subtitle}</SheetDescription>
        {status && <p className="truncate text-xs text-muted-foreground">{status}</p>}
        {open.isError && (
          <p role="alert" className="text-xs text-destructive">
            {t.openFailed}
          </p>
        )}
      </div>
    </div>
  );
}

/** Bio, email and join date. */
export function Details({ person }: { person: UserProfile }) {
  const t = useT(messages);
  const since = dateFormat({ month: "long", year: "numeric" }).format(new Date(person.createdAt));
  return (
    <section className="flex flex-col gap-3">
      {person.bio && <p className="whitespace-pre-line text-sm">{person.bio}</p>}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted-foreground">{t.email}</dt>
        <dd className="min-w-0 truncate">
          <a href={`mailto:${person.email}`} className={linkClass}>
            {person.email}
          </a>
        </dd>
        <dt className="text-muted-foreground">{t.memberSince}</dt>
        <dd>{since}</dd>
      </dl>
    </section>
  );
}

/** Group conversations you both belong to. */
export function CommonConversations({ userId }: { userId: string }) {
  const { user: me } = useRouteContext({ from: "/app" });
  const t = useT(messages);
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const shared = conversations.filter((c) => c.kind === "group" && c.members.some((m) => m.id === userId));
  if (!shared.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-medium text-muted-foreground">{t.common(shared.length)}</h3>
      <ItemGroup className="-mx-2 gap-0.5">
        {shared.map((c) => (
          <Item
            key={c.id}
            size="sm"
            className="px-2 py-1.5"
            render={<Link to="/c/$conversationId" params={{ conversationId: c.id }} onClick={() => closeProfile()} />}
          >
            <ItemMedia>
              <ConversationAvatar conversation={c} me={me.id} className="size-9" />
            </ItemMedia>
            <ItemContent className="min-w-0">
              <ItemTitle className="w-full truncate">{conversationTitle(c, me.id)}</ItemTitle>
              <ItemDescription>{t.members(c.members.length + c.agents.length)}</ItemDescription>
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>
    </section>
  );
}
