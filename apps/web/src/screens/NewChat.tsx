import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import { ChevronLeftIcon, PlusIcon, UsersIcon, CloseIcon, SearchIcon, WarningIcon } from "@/components/icons";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar, StatusAvatar } from "@/components/ConversationAvatar";
import { type Participant } from "@/lib/participants";
import { closeOrGoHome } from "@/lib/workspace";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { api } from "@/lib/api";
import { useOrgTitle } from "@/lib/org";
import { agentsQuery, conversationsQuery, usersQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Row = { key: string; label: string; hint?: string; run: () => void; icon: React.ReactNode };

const participantKey = (p: Participant) => (p.kind === "agent" ? `a:${p.agent.id}` : `u:${p.person.id}`);
const participantName = (p: Participant) => (p.kind === "agent" ? p.agent.name : p.person.name);

const messages = defineMessages({
  en: {
    colleague: "Colleague",
    creatingBot: "Creating Bot…",
    createBot: "Create a new Bot",
    createGroup: "Create a group conversation",
    newConversation: "New conversation",
    to: "To:",
    removeName: (name: string) => `Remove ${name}`,
    addSomeone: "Add someone",
    groupMembers: "Group Bots and colleagues",
    searchOrCreate: "Search or create Bots",
    groupNamePlaceholder: "Group name",
    groupName: "Group name",
    pickTwo: "Pick at least two participants",
    noMatch: "No one matches.",
    noMatchHint: "Check the spelling, or search for another name.",
    noOneLeft: "No one else to add.",
    errorTitle: "List unavailable",
    error: "Bots and colleagues can't be reached right now.",
  },
  fr: {
    colleague: "Collègue",
    creatingBot: "Création du Bot…",
    createBot: "Créer un nouveau Bot",
    createGroup: "Créer une conversation de groupe",
    newConversation: "Nouvelle conversation",
    to: "À :",
    removeName: (name: string) => `Retirer ${name}`,
    addSomeone: "Ajouter quelqu'un",
    groupMembers: "Bots et collègues du groupe",
    searchOrCreate: "Rechercher ou créer des Bots",
    groupNamePlaceholder: "Nom du groupe",
    groupName: "Nom du groupe",
    pickTwo: "Choisis au moins deux participants",
    noMatch: "Personne ne correspond.",
    noMatchHint: "Vérifie l'orthographe, ou cherche un autre nom.",
    noOneLeft: "Personne d'autre à ajouter.",
    errorTitle: "Liste indisponible",
    error: "Les Bots et collègues sont injoignables pour le moment.",
  },
});

/**
 * "To:": find a bot or a colleague, create a bot that configures itself through
 * conversation, or compose a group conversation.
 */
export function NewChat() {
  const { user } = useRouteContext({ from: "/app" });
  const navigate = useNavigate();
  const qc = useQueryClient();
  const t = useT(messages);
  const c = useT(common);
  useOrgTitle(t.newConversation);
  const agentsList = useQuery(agentsQuery);
  const peopleList = useQuery(usersQuery);
  const agents = agentsList.data ?? [];
  const people = peopleList.data ?? [];
  const listPending = agentsList.isPending || peopleList.isPending;
  const listError = agentsList.error ?? peopleList.error;
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState("");
  const [groupMode, setGroupMode] = useState(false);
  const [picked, setPicked] = useState<Participant[]>([]);
  const [title, setTitle] = useState("");

  const goTo = async (conversationId: string) => {
    await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
    navigate({ to: "/c/$conversationId", params: { conversationId } });
  };

  const createBot = useMutation({
    mutationFn: () => api<{ id: string; conversationId: string }>("/agents", { method: "POST" }),
    onSuccess: async ({ conversationId }) => {
      await qc.invalidateQueries({ queryKey: agentsQuery.queryKey });
      await goTo(conversationId);
    },
    meta: { loading: c.creating },
  });

  const openDirect = useMutation({
    mutationFn: (body: { agentId: string } | { userId: string }) =>
      api<{ id: string }>("/conversations/direct", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: ({ id }) => goTo(id),
  });

  const createGroup = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/conversations/group", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim() || undefined,
          userIds: picked.flatMap((p) => (p.kind === "user" ? [p.person.id] : [])),
          agentIds: picked.flatMap((p) => (p.kind === "agent" ? [p.agent.id] : [])),
        }),
      }),
    onSuccess: ({ id }) => goTo(id),
    meta: { loading: c.creating },
  });

  const query = q.trim().toLowerCase();
  const candidates: Participant[] = [
    // A bot still being configured does not join groups.
    ...agents.filter((a) => !(groupMode && a.onboarding)).map((agent) => ({ kind: "agent" as const, agent })),
    ...people.map((person) => ({ kind: "user" as const, person })),
  ].filter((p) => participantName(p).toLowerCase().includes(query) && !picked.some((x) => participantKey(x) === participantKey(p)));

  const pickRow = (p: Participant): Row => ({
    key: participantKey(p),
    label: participantName(p),
    hint: p.kind === "user" ? t.colleague : undefined,
    icon: <StatusAvatar p={p} className="size-8" />,
    run: () => {
      if (groupMode) {
        setPicked((xs) => [...xs, p]);
        setQ("");
        setSelected("");
      } else if (!openDirect.isPending) {
        openDirect.mutate(p.kind === "agent" ? { agentId: p.agent.id } : { userId: p.person.id });
      }
    },
  });

  const rows: Row[] = groupMode
    ? candidates.map(pickRow)
    : [
        ...(user.role === "admin"
          ? [
              {
                key: "create",
                label: createBot.isPending ? t.creatingBot : t.createBot,
                run: () => !createBot.isPending && createBot.mutate(),
                icon: (
                  <Avatar>
                    <AvatarFallback>{createBot.isPending ? <Spinner /> : <PlusIcon />}</AvatarFallback>
                  </Avatar>
                ),
              },
            ]
          : []),
        {
          key: "group",
          label: t.createGroup,
          run: () => {
            setGroupMode(true);
            setQ("");
            setSelected("");
          },
          icon: (
            <Avatar>
              <AvatarFallback>
                <UsersIcon />
              </AvatarFallback>
            </Avatar>
          ),
        },
        ...candidates.map(pickRow),
      ];
  const current = rows.some((r) => r.key === selected) ? selected : (rows[0]?.key ?? "");
  const canCreate = picked.length >= 2 && !createGroup.isPending;

  return (
    <Command
      shouldFilter={false}
      loop
      label={t.newConversation}
      value={current}
      onValueChange={setSelected}
      className="h-full min-w-0 flex-1"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col gap-3 px-4 pt-4 md:pt-10">
      {/* The recipients field, the people picked under it, then the matches. */}
      <InputGroup>
        <InputGroupAddon>
          <InputGroupButton size="icon-xs" nativeButton={false} render={<Link to="/" aria-label={c.back} />} className="md:hidden">
            <ChevronLeftIcon />
          </InputGroupButton>
          <InputGroupText>{t.to}</InputGroupText>
        </InputGroupAddon>
          <CommandPrimitive.Input
            data-slot="input-group-control"
            autoFocus
            key={groupMode ? "group" : "pick"}
            value={q}
            onValueChange={(v) => {
              setQ(v);
              setSelected("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Backspace" && q === "" && picked.length) {
                setPicked((xs) => xs.slice(0, -1));
              } else if (e.key === "Escape") {
                if (groupMode) {
                  setGroupMode(false);
                  setPicked([]);
                  setQ("");
                } else closeOrGoHome("/new", () => navigate({ to: "/" }));
              }
            }}
            placeholder={groupMode ? (picked.length ? t.addSomeone : t.groupMembers) : t.searchOrCreate}
            className="w-full min-w-0 flex-1 text-sm outline-hidden placeholder:text-muted-foreground"
          />
      </InputGroup>

      {picked.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {picked.map((p) => (
            <Badge
              key={participantKey(p)}
              variant="secondary"
              render={<button type="button" aria-label={t.removeName(participantName(p))} onClick={() => setPicked((xs) => xs.filter((x) => participantKey(x) !== participantKey(p)))} />}
            >
              {p.kind === "agent" ? <AgentAvatar agent={p.agent} className="size-4" /> : <PersonAvatar person={p.person} className="size-4" />}
              {participantName(p)}
              <CloseIcon data-icon="inline-end" />
            </Badge>
          ))}
        </div>
      )}

      {groupMode && (
        <div className="flex items-center gap-2">
          <Input
            value={title}
            maxLength={80}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              // This field is not the list's own: its keys don't drive the list.
              e.stopPropagation();
              if (e.key === "Enter" && canCreate) createGroup.mutate();
            }}
            placeholder={t.groupNamePlaceholder}
            aria-label={t.groupName}
          />
          <Button
            disabled={!canCreate}
            onClick={() => createGroup.mutate()}
            title={picked.length < 2 ? t.pickTwo : undefined}
          >
            {createGroup.isPending ? c.creating : c.create}
          </Button>
        </div>
      )}

        <CommandList className="max-h-none min-h-0 flex-1">
          <CommandGroup>
            {rows.map((r) => (
              <CommandItem
                key={r.key}
                value={r.key}
                onSelect={r.run}
                className={cn(r.key === "create" && createBot.isPending && "cursor-progress")}
              >
                {r.icon}
                <span className="grid min-w-0 flex-1">
                  <span className="truncate">{r.label}</span>
                  {r.hint && <span className="truncate text-xs text-muted-foreground">{r.hint}</span>}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
          {listPending ? (
            <div className="flex flex-col gap-2 p-1">
              {[0, 1, 2].map((i) => (
                <Skeleton key={i} className="h-10 w-full" />
              ))}
            </div>
          ) : !candidates.length && listError && !(agents.length + people.length) ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <WarningIcon />
                </EmptyMedia>
                <EmptyTitle>{t.errorTitle}</EmptyTitle>
                <EmptyDescription title={listError.message}>{t.error}</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button
                  variant="secondary"
                  onClick={() => {
                    void agentsList.refetch();
                    void peopleList.refetch();
                  }}
                >
                  {c.retry}
                </Button>
              </EmptyContent>
            </Empty>
          ) : !candidates.length && (query || groupMode) ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>{query ? t.noMatch : t.noOneLeft}</EmptyTitle>
                {query && <EmptyDescription>{t.noMatchHint}</EmptyDescription>}
              </EmptyHeader>
            </Empty>
          ) : null}
        </CommandList>
      </div>
    </Command>
  );
}
