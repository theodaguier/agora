import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouteContext } from "@tanstack/react-router";
import { Command as CommandPrimitive } from "cmdk";
import { ChevronLeftIcon, PlusIcon, UsersIcon, SearchIcon, WarningIcon } from "@/components/icons";
import { useState } from "react";
import { NewProjectDialog } from "@/components/NewProjectDialog";
import { StatusAvatar } from "@/components/ConversationAvatar";
import { type Participant } from "@/lib/participants";
import { closeOrGoHome } from "@/lib/workspace";
import { Button } from "@/components/ui/button";
import { Command, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupText } from "@/components/ui/input-group";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { api } from "@/lib/api";
import { useOrgTitle } from "@/lib/org";
import { agentsQuery, conversationsQuery, usersQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

type Row = { key: string; label: string; section: "actions" | "bots" | "people"; run: () => void; icon: React.ReactNode };

const participantKey = (p: Participant) => (p.kind === "agent" ? `a:${p.agent.id}` : `u:${p.person.id}`);
const participantName = (p: Participant) => (p.kind === "agent" ? p.agent.name : p.person.name);

const messages = defineMessages({
  en: {
    bots: "Bots",
    colleagues: "Colleagues",
    creatingBot: "Creating Bot…",
    createBot: "Create a new Bot",
    createGroup: "Create a project",
    newConversation: "New conversation",
    to: "To:",
    searchOrCreate: "Search or create Bots",
    noMatch: "No one matches.",
    noMatchHint: "Check the spelling, or search for another name.",
    errorTitle: "List unavailable",
    error: "Bots and colleagues can't be reached right now.",
  },
  fr: {
    bots: "Bots",
    colleagues: "Collègues",
    creatingBot: "Création du Bot…",
    createBot: "Créer un nouveau Bot",
    createGroup: "Créer un projet",
    newConversation: "Nouvelle conversation",
    to: "À :",
    searchOrCreate: "Rechercher ou créer des Bots",
    noMatch: "Personne ne correspond.",
    noMatchHint: "Vérifie l'orthographe, ou cherche un autre nom.",
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
  const [newProject, setNewProject] = useState(false);

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

  const query = q.trim().toLowerCase();
  const candidates: Participant[] = [
    // A bot still being configured does not join groups.
    ...agents.map((agent) => ({ kind: "agent" as const, agent })),
    ...people.map((person) => ({ kind: "user" as const, person })),
  ].filter((p) => participantName(p).toLowerCase().includes(query));

  const pickRow = (p: Participant): Row => ({
    key: participantKey(p),
    label: participantName(p),
    section: p.kind === "agent" ? "bots" : "people",
    icon: <StatusAvatar p={p} className="size-6" />,
    run: () => {
      if (!openDirect.isPending) openDirect.mutate(p.kind === "agent" ? { agentId: p.agent.id } : { userId: p.person.id });
    },
  });

  const rows: Row[] = [
        ...(user.role === "admin"
          ? [
              {
                key: "create",
                label: createBot.isPending ? t.creatingBot : t.createBot,
                section: "actions" as const,
                run: () => !createBot.isPending && createBot.mutate(),
                icon: <span className="flex size-6 items-center justify-center text-muted-foreground">{createBot.isPending ? <Spinner /> : <PlusIcon />}</span>,
              },
            ]
          : []),
        {
          key: "group",
          label: t.createGroup,
          section: "actions" as const,
          run: () => setNewProject(true),
          icon: (
            <span className="flex size-6 items-center justify-center text-muted-foreground">
              <UsersIcon />
            </span>
          ),
        },
    ...candidates.map(pickRow),
  ];
  const current = rows.some((r) => r.key === selected) ? selected : (rows[0]?.key ?? "");

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
            value={q}
            onValueChange={(v) => {
              setQ(v);
              setSelected("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") closeOrGoHome("/new", () => navigate({ to: "/" }));
            }}
            placeholder={t.searchOrCreate}
            className="w-full min-w-0 flex-1 text-sm outline-hidden placeholder:text-muted-foreground"
          />
      </InputGroup>

        <CommandList className="max-h-none min-h-0 flex-1">
          {/* The actions, then one section per kind: who someone is is said once, by its heading. */}
          {(["actions", "bots", "people"] as const).map((section) => {
            const items = rows.filter((r) => r.section === section);
            if (!items.length) return null;
            return (
              <CommandGroup key={section} heading={section === "bots" ? t.bots : section === "people" ? t.colleagues : undefined}>
                {items.map((r) => (
                  <CommandItem
                    key={r.key}
                    value={r.key}
                    onSelect={r.run}
                    className={cn(r.key === "create" && createBot.isPending && "cursor-progress")}
                  >
                    {r.icon}
                    <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  </CommandItem>
                ))}
              </CommandGroup>
            );
          })}
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
          ) : !candidates.length && query ? (
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <SearchIcon />
                </EmptyMedia>
                <EmptyTitle>{t.noMatch}</EmptyTitle>
                <EmptyDescription>{t.noMatchHint}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : null}
        </CommandList>
      </div>
      <NewProjectDialog open={newProject} onOpenChange={setNewProject} />
    </Command>
  );
}
