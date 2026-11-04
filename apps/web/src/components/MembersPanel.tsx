import { PanelBar } from "@/components/PaneHeader";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useRouteContext } from "@tanstack/react-router";
import { CloseIcon } from "@/components/icons";
import { useRef, useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { confirmAction } from "@/lib/confirm";
import { useCurrentTaskTitle } from "@/components/WorkingOn";
import { PersonAvatar, StatusAvatar, useStatusLabel } from "@/components/ConversationAvatar";
import { conversationTitle, type Participant } from "@/lib/participants";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Spinner } from "@/components/ui/spinner";
import { api, conversationPath, type AgentSummary, type ConversationDetail, type Person } from "@/lib/api";
import { openAgentProfile, openProfile } from "@/lib/profile";
import { closeOrGoHome, tabPath } from "@/lib/workspace";
import { agentsQuery, conversationQuery, conversationsQuery, usersQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

const messages = defineMessages({
  en: {
    group: "Group",
    hidePanel: "Hide panel",
    groupName: "Group name",
    untitled: "Untitled group",
    members: (n: number) => `Members (${n})`,
    bot: "Bot",
    me: (name: string) => `${name} (you)`,
    creator: "Created the group",
    leave: "Leave group",
    actionFailed: "Couldn't do that.",
    left: (title: string) => `You left “${title}”.`,
    remove: (name: string) => `Remove ${name}`,
    openProfile: (name: string) => `See ${name}'s profile and tasks`,
    addToGroup: "Add to group…",
    noMatch: "No one matches.",
    everyoneHere: "Everyone is already here.",
    listsUnavailable: "Colleagues and bots are unreachable for now.",
    bots: "Bots",
    colleagues: "Colleagues",
    addFailed: "Couldn't add them.",
    leaveTitle: (group: string) => `Leave "${group}"?`,
    leaveBody: "You'll no longer see its messages. Someone in the group can add you back.",
    leaveLastBody: "You're the last member: the group and its messages will be deleted.",
    leaveAction: "Leave",
    removeTitle: (name: string) => `Remove ${name} from the group?`,
    removeBody: "They'll no longer see its messages. You can add them back later.",
    removeBotBody: "It will no longer answer here. You can add it back later.",
    removeAction: "Remove",
  },
  fr: {
    group: "Groupe",
    hidePanel: "Masquer le panneau",
    groupName: "Nom du groupe",
    untitled: "Groupe sans nom",
    members: (n: number) => `Membres (${n})`,
    bot: "Bot",
    me: (name: string) => `${name} (toi)`,
    creator: "A créé le groupe",
    leave: "Quitter le groupe",
    actionFailed: "Action impossible.",
    left: (title: string) => `Tu as quitté « ${title} ».`,
    remove: (name: string) => `Retirer ${name}`,
    openProfile: (name: string) => `Voir le profil et les tâches de ${name}`,
    addToGroup: "Ajouter au groupe…",
    noMatch: "Personne ne correspond.",
    everyoneHere: "Tout le monde est déjà là.",
    listsUnavailable: "Collègues et bots injoignables pour le moment.",
    bots: "Bots",
    colleagues: "Collègues",
    addFailed: "Ajout impossible.",
    leaveTitle: (group: string) => `Quitter « ${group} » ?`,
    leaveBody: "Tu ne verras plus ses messages. Un membre du groupe pourra te rajouter.",
    leaveLastBody: "Tu es le dernier membre : le groupe et ses messages seront supprimés.",
    leaveAction: "Quitter",
    removeTitle: (name: string) => `Retirer ${name} du groupe ?`,
    removeBody: "Cette personne ne verra plus les messages du groupe. Tu pourras la rajouter plus tard.",
    removeBotBody: "Il ne répondra plus ici. Tu pourras le rajouter plus tard.",
    removeAction: "Retirer",
  },
});

/** Group panel: name, members (employees and bots), add, remove, leave. */
export function MembersPanel({ conversation: conv, onClose }: { conversation: ConversationDetail; onClose: () => void }) {
  const { user } = useRouteContext({ from: "/app" });
  const qc = useQueryClient();
  const navigate = useNavigate();
  const t = useT(messages);
  const c = useT(common);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(conv.title ?? "");
  const canRemove = conv.createdBy === user.id || user.role === "admin";

  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: conversationQuery(conv.id).queryKey }),
      qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }),
    ]);

  const rename = useMutation({
    mutationFn: (next: string) => api(conversationPath(conv.id), { method: "PATCH", body: JSON.stringify({ title: next }) }),
    onSuccess: () => {
      setEditing(false);
      return refresh();
    },
    meta: { success: c.saved, error: t.actionFailed },
  });

  // Escape unmounts the input, which can still fire blur: don't save then.
  const cancelled = useRef(false);
  const cancel = () => {
    cancelled.current = true;
    setEditing(false);
  };
  const save = () => {
    if (cancelled.current) return;
    const next = title.trim();
    if (next === (conv.title ?? "")) setEditing(false);
    else rename.mutate(next);
  };

  const remove = useMutation({
    mutationFn: (m: { kind: "user" | "agent"; id: string }) =>
      api(conversationPath(conv.id, `/members/${m.kind}/${encodeURIComponent(m.id)}`), { method: "DELETE" }),
    onSuccess: async (_, m) => {
      if (m.kind === "user" && m.id === user.id) {
        await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
        closeOrGoHome(tabPath.conversation(conv.id), () => navigate({ to: "/" }));
        return;
      }
      await refresh();
    },
    meta: {
      success: (_: unknown, m: { kind: "user" | "agent"; id: string }) => (m.kind === "user" && m.id === user.id ? t.left(conv.title || t.untitled) : c.removed),
      error: t.actionFailed,
    },
  });

  return (
    <aside className="flex h-full w-full flex-col bg-background">
      <PanelBar title={t.group} closeLabel={t.hidePanel} onClose={onClose} />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4">
        {editing ? (
          // Inline editing in the title's exact spot: Enter or clicking away saves, Escape cancels.
          <Input
            autoFocus
            value={title}
            maxLength={80}
            disabled={rename.isPending}
            onChange={(e) => setTitle(e.target.value)}
            onFocus={(e) => e.currentTarget.select()}
            onBlur={save}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") cancel();
            }}
            placeholder={t.groupName}
            aria-label={t.groupName}
          />
        ) : (
          <Button
            variant="ghost"
            onClick={() => {
              cancelled.current = false;
              setTitle(conv.title ?? "");
              setEditing(true);
            }}
            className="w-full justify-start"
          >
            <span className="truncate">{conv.title || t.untitled}</span>
          </Button>
        )}

        <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm text-muted-foreground">{t.members(conv.members.length + conv.agents.length)}</h2>
          <AddMembers conversation={conv} />
        </div>

        <ItemGroup className="gap-1">
          {conv.agents.map((a) => (
            <Row
              key={a.id}
              p={{ kind: "agent", agent: a }}
              name={a.name}
              hint={t.bot}
              onOpen={() => openAgentProfile(a.id)}
              onRemove={
                canRemove
                  ? async () =>
                      (await confirmAction({ title: t.removeTitle(a.name), description: t.removeBotBody, action: t.removeAction })) &&
                      remove.mutate({ kind: "agent", id: a.id })
                  : undefined
              }
            />
          ))}
          {conv.members.map((m) => (
            <Row
              key={m.id}
              p={{ kind: "user", person: m }}
              name={m.id === user.id ? t.me(m.name) : m.name}
              hint={m.id === conv.createdBy ? t.creator : undefined}
              onOpen={() => openProfile(m.id)}
              onRemove={
                canRemove && m.id !== user.id
                  ? async () =>
                      (await confirmAction({ title: t.removeTitle(m.name), description: t.removeBody, action: t.removeAction })) &&
                      remove.mutate({ kind: "user", id: m.id })
                  : undefined
              }
            />
          ))}
        </ItemGroup>
        </div>

        <Button
          variant="destructive"
          onClick={async () =>
            (await confirmAction({
              title: t.leaveTitle(conversationTitle(conv, user.id)),
              description: conv.members.length <= 1 ? t.leaveLastBody : t.leaveBody,
              action: t.leaveAction,
            })) && remove.mutate({ kind: "user", id: user.id })
          }
          className="w-full"
        >
          {t.leave}
        </Button>
      </div>
    </aside>
  );
}

function Row(props: { p: Participant; name: string; hint?: string; onOpen?: () => void; onRemove?: () => void }) {
  const t = useT(messages);
  const personId = props.p.kind === "user" ? props.p.person.id : null;
  const working = useCurrentTaskTitle(personId);
  const { data: people = [] } = useQuery(usersQuery);
  /** Their role (developer, spouse…), as set on their profile. */
  const role = personId ? people.find((u) => u.id === personId)?.title : undefined;
  const hint = [props.hint, role, useStatusLabel(props.p), working].filter(Boolean).join(", ");
  return (
    <div role="listitem" className="group flex items-center gap-1">
      {props.onOpen ? (
        <Item size="sm" className="min-w-0 flex-1" render={<button type="button" onClick={props.onOpen} aria-label={t.openProfile(props.name)} />}>
          <RowBody {...props} hint={hint} />
        </Item>
      ) : (
        <Item size="sm" className="min-w-0 flex-1">
          <RowBody {...props} hint={hint} />
        </Item>
      )}
      {props.onRemove && (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t.remove(props.name)}
          onClick={props.onRemove}
          className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
        >
          <CloseIcon />
        </Button>
      )}
    </div>
  );
}

function RowBody(props: { p: Participant; name: string; hint?: string }) {
  return (
    <>
      <ItemMedia>
        <StatusAvatar p={props.p} className="size-8" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{props.name}</ItemTitle>
        {props.hint && <ItemDescription title={props.hint}>{props.hint}</ItemDescription>}
      </ItemContent>
    </>
  );
}

/** "Ajouter" button: searches bots and colleagues not in the group; several can be added in a row. */
function AddMembers({ conversation: conv }: { conversation: ConversationDetail }) {
  const qc = useQueryClient();
  const t = useT(messages);
  const c = useT(common);
  const [open, setOpen] = useState(false);
  const peopleQ = useQuery(usersQuery);
  const botsQ = useQuery(agentsQuery);
  const people = peopleQ.data ?? noPeople;
  const bots = botsQ.data ?? noBots;
  const loading = peopleQ.isPending || botsQ.isPending;
  const failed = peopleQ.isError && botsQ.isError;
  const botsLeft = bots.filter((b) => !b.onboarding && !conv.agents.some((a) => a.id === b.id));
  const peopleLeft = people.filter((p) => !conv.members.some((m) => m.id === p.id));

  const add = useMutation({
    mutationFn: (body: { userIds: string[]; agentIds: string[] }) => api(conversationPath(conv.id, "/members"), { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: conversationQuery(conv.id).queryKey }),
        qc.invalidateQueries({ queryKey: conversationsQuery.queryKey }),
      ]),
    meta: { success: c.added, error: t.addFailed },
  });
  const pending = add.isPending ? (add.variables.agentIds[0] ?? add.variables.userIds[0]) : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<Button variant="ghost" size="xs" />}>
        {c.add}
      </PopoverTrigger>
      <PopoverContent align="end" sideOffset={6} className="w-64 p-0">
        {/* Filter on the name only: the value holds the id, which must not match. */}
        <Command filter={(_, search, keywords) => (keywords?.some((k) => k.toLowerCase().includes(search.trim().toLowerCase())) ? 1 : 0)}>
          <CommandInput placeholder={t.addToGroup} />
          <CommandList>
            <CommandEmpty>
              {loading ? <Spinner className="mx-auto" /> : failed ? t.listsUnavailable : botsLeft.length + peopleLeft.length ? t.noMatch : t.everyoneHere}
            </CommandEmpty>
            {botsLeft.length > 0 && (
              <CommandGroup heading={t.bots}>
                {botsLeft.map((b) => (
                  <CommandItem
                    key={b.id}
                    value={`bot:${b.id}`}
                    keywords={[b.name]}
                    onSelect={() => !add.isPending && add.mutate({ userIds: [], agentIds: [b.id] })}
                  >
                    <AgentAvatar agent={b} className="size-5" />
                    <span className="truncate">{b.name}</span>
                    {pending === b.id && <Spinner className="ml-auto" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
            {peopleLeft.length > 0 && (
              <CommandGroup heading={t.colleagues}>
                {peopleLeft.map((p) => (
                  <CommandItem
                    key={p.id}
                    value={`user:${p.id}`}
                    keywords={[p.name]}
                    onSelect={() => !add.isPending && add.mutate({ userIds: [p.id], agentIds: [] })}
                  >
                    <PersonAvatar person={p} className="size-5" />
                    <span className="truncate">{p.name}</span>
                    {pending === p.id && <Spinner className="ml-auto" />}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

const noPeople: Person[] = [];
const noBots: AgentSummary[] = [];
