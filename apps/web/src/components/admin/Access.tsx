import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, type AdminAgent, type AdminUser } from "@/lib/api";
import { adminAgentsQuery, adminUsersQuery, agentsQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { SectionHeader } from "./ui";

const messages = defineMessages({
  en: {
    title: "Access",
    text: "Which agents each employee can use.",
    all: "All agents",
    none: "No agents",
    some: (n: number, total: number) => `${n} of ${total} agents`,
    edit: "Edit",
    search: "Search for an agent…",
    noMatch: "No agent matches.",
    agents: "Agents",
    allOn: "Open all agents",
    allOff: "Remove all agents",
    editOf: (name: string) => `Agents available to ${name}`,
  },
  fr: {
    title: "Accès",
    text: "Quels agents chaque salarié peut utiliser.",
    all: "Tous les agents",
    none: "Aucun agent",
    some: (n: number, total: number) => `${n} agent${n > 1 ? "s" : ""} sur ${total}`,
    edit: "Modifier",
    search: "Chercher un agent…",
    noMatch: "Aucun agent ne correspond.",
    agents: "Agents",
    allOn: "Ouvrir tous les agents",
    allOff: "Retirer tous les agents",
    editOf: (name: string) => `Agents accessibles à ${name}`,
  },
});

/** Avatars shown in a row before "+n". */
const STACK = 4;

export function Access() {
  const t = useT(messages);
  const qc = useQueryClient();
  const { data: users = [] } = useQuery(adminUsersQuery);
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const save = useMutation({
    mutationFn: ({ userId, agentIds }: { userId: string; agentIds: string[] }) =>
      api(`/admin/users/${userId}/agents`, { method: "PUT", body: JSON.stringify({ agentIds }) }),
    onMutate: ({ userId, agentIds }) => {
      qc.setQueryData<AdminUser[]>(adminUsersQuery.queryKey, (xs) => xs?.map((u) => (u.id === userId ? { ...u, agents: agentIds } : u)));
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey }),
        qc.invalidateQueries({ queryKey: agentsQuery.queryKey }),
      ]),
  });

  return (
    <>
      <SectionHeader title={t.title} text={t.text} />
      <ItemGroup className="gap-2">
        {users.map((u) => (
          <UserAccess key={u.id} user={u} agents={agents} onChange={(agentIds) => save.mutate({ userId: u.id, agentIds })} />
        ))}
      </ItemGroup>
    </>
  );
}

function UserAccess({ user: u, agents, onChange }: { user: AdminUser; agents: AdminAgent[]; onChange: (agentIds: string[]) => void }) {
  const t = useT(messages);
  // Only agents that still exist count.
  const allowed = new Set(u.agents);
  const mine = agents.filter((a) => allowed.has(a.id));
  const summary = mine.length === 0 ? t.none : mine.length === agents.length ? t.all : t.some(mine.length, agents.length);
  const toggle = (id: string) => onChange(u.agents.includes(id) ? u.agents.filter((x) => x !== id) : [...u.agents, id]);
  const everything = mine.length === agents.length;

  return (
    <Item variant="outline">
      <ItemMedia>
        <PersonAvatar person={u} className="size-9" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle>{u.name}</ItemTitle>
        <ItemDescription>{summary}</ItemDescription>
      </ItemContent>
      <ItemActions className="gap-3">
        {mine.length > 0 && (
          <span aria-hidden className="hidden items-center sm:flex">
            {mine.slice(0, STACK).map((a) => (
              <AgentAvatar
                key={a.id}
                agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }}
                className="-ml-1.5 size-7 rounded-full bg-background ring-2 ring-background first:ml-0"
              />
            ))}
            {mine.length > STACK && (
              <span className="-ml-1.5 grid size-7 place-items-center rounded-full bg-muted text-xs font-medium tabular-nums text-muted-foreground ring-2 ring-background">
                +{mine.length - STACK}
              </span>
            )}
          </span>
        )}
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={t.editOf(u.name)} />}>{t.edit}</PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-72 p-0">
            <Command>
              <CommandInput placeholder={t.search} />
              <CommandList>
                <CommandEmpty>{t.noMatch}</CommandEmpty>
                <CommandGroup heading={t.agents}>
                  {agents.map((a) => (
                    <CommandItem
                      key={a.id}
                      value={a.id}
                      keywords={[a.name]}
                      data-checked={allowed.has(a.id)}
                      onSelect={() => toggle(a.id)}
                    >
                      <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-5" />
                      <span className="truncate">{a.name}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
                <CommandItem
                  value="__all"
                  keywords={[t.allOn, t.allOff]}
                  onSelect={() => onChange(everything ? [] : agents.map((a) => a.id))}
                >
                  {everything ? t.allOff : t.allOn}
                </CommandItem>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </ItemActions>
    </Item>
  );
}
