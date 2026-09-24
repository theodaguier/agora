import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import { ChevronLeftIcon, PlusIcon, UsersIcon, CloseIcon } from "@/components/icons";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar, StatusAvatar } from "@/components/ConversationAvatar";
import { type Participant } from "@/lib/participants";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { api } from "@/lib/api";
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
  const { data: agents = [] } = useQuery(agentsQuery);
  const { data: people = [] } = useQuery(usersQuery);
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
                  <span className="grid size-8 place-items-center rounded-full bg-accent text-muted-foreground">
                    {createBot.isPending ? <Spinner /> : <PlusIcon className="size-4" />}
                  </span>
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
            <span className="grid size-8 place-items-center rounded-full bg-accent text-muted-foreground">
              <UsersIcon className="size-4" />
            </span>
          ),
        },
        ...candidates.map(pickRow),
      ];
  const current = rows.some((r) => r.key === selected) ? selected : (rows[0]?.key ?? "");
  const canCreate = picked.length >= 2 && !createGroup.isPending;
  const error = createBot.error ?? openDirect.error ?? createGroup.error;

  return (
    <Command
      shouldFilter={false}
      loop
      label={t.newConversation}
      value={current}
      onValueChange={setSelected}
      className="h-full min-w-0 flex-1 rounded-none! bg-background p-0 text-foreground"
    >
      <header className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-border/60 px-3 py-1.5">
        <Button
          variant="ghost"
          size="icon"
          nativeButton={false}
          render={<Link to="/" aria-label={c.back} />}
          className="-ml-1 rounded-lg hover:bg-transparent md:hidden"
        >
          <ChevronLeftIcon className="size-5" />
        </Button>
        <label className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-[15px]">
          <span className="text-muted-foreground">{t.to}</span>
          {picked.map((p) => (
            <Badge key={participantKey(p)} variant="secondary" className="h-7 gap-1.5 px-1 text-[13px] font-normal">
              <span className="flex">
                {p.kind === "agent" ? <AgentAvatar agent={p.agent} className="size-5" /> : <PersonAvatar person={p.person} className="size-5" />}
              </span>
              {participantName(p)}
              <Button
                variant="ghost"
                size="icon-xs"
                aria-label={t.removeName(participantName(p))}
                onClick={() => setPicked((xs) => xs.filter((x) => participantKey(x) !== participantKey(p)))}
                className="hover:bg-border"
              >
                <CloseIcon />
              </Button>
            </Badge>
          ))}
          <CommandPrimitive.Input
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
                } else navigate({ to: "/" });
              }
            }}
            placeholder={groupMode ? (picked.length ? t.addSomeone : t.groupMembers) : t.searchOrCreate}
            className="min-w-[8rem] flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </label>
      </header>

      {groupMode && (
        <div className="flex max-w-lg items-center gap-2 px-3 pt-3 md:px-4">
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
            className="h-9 border-transparent text-[15px] md:text-[15px]"
          />
          <Button
            disabled={!canCreate}
            onClick={() => createGroup.mutate()}
            title={picked.length < 2 ? t.pickTwo : undefined}
            className="rounded-lg px-3 disabled:opacity-40"
          >
            {createGroup.isPending ? c.creating : c.create}
          </Button>
        </div>
      )}

      <div className="relative px-3 pt-2 md:px-4">
        <CommandList className="max-h-[70vh] max-w-lg rounded-2xl border border-border bg-secondary p-1.5 shadow-2xl shadow-black/50">
          <CommandEmpty>{t.noMatch}</CommandEmpty>
          <CommandGroup>
            {rows.map((r) => (
              <CommandItem
                key={r.key}
                value={r.key}
                onSelect={r.run}
                className={cn("h-12 cursor-pointer", r.key === "create" && createBot.isPending && "cursor-progress")}
              >
                {r.icon}
                <span className="min-w-0 flex-1 truncate">{r.label}</span>
                {r.hint && <span className="shrink-0 text-[13px] text-subtle">{r.hint}</span>}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
        {error && (
          <p role="alert" className="mt-2 text-[13px] text-destructive">
            {error.message}
          </p>
        )}
      </div>
    </Command>
  );
}
