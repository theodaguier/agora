import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { ModelLogo } from "@/components/ProviderLogo";
import { providerName } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { ListCard, ListCardHeader, ListCardRows } from "@/components/list-card";
import { CardContent, CardDescription, CardTitle } from "@/components/ui/card";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, type AdminModels, type AdminUser } from "@/lib/api";
import { adminModelsQuery, adminUsersQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { HostClis, LocalModels } from "./HostModels";
import { Providers } from "./Providers";
import { LoadError, Loading, SectionHeader } from "./ui";

const messages = defineMessages({
  en: {
    title: "Models",
    accessTitle: "Models allowed per person",
    text: "Your agents' AI providers, and which models each employee can pick. New models are allowed by default.",
    listFailed: "Hermes couldn't list the models.",
    unreachable: (n: number) =>
      n === 1 ? "1 agent didn't respond: its models are missing." : `${n} agents didn't respond: their models are missing.`,
    all: "All models",
    none: "No models",
    some: (n: number, total: number) => `${n} of ${total} models`,
    edit: "Edit",
    editOf: (name: string) => `Models available to ${name}`,
    search: "Search for a model…",
    noMatch: "No model matches.",
    allOf: (provider: string) => `All ${provider} models`,
  },
  fr: {
    title: "Modèles",
    accessTitle: "Modèles autorisés par personne",
    text: "Les fournisseurs d'IA de tes agents, et les modèles que chaque salarié peut choisir. Les nouveaux modèles sont autorisés d'office.",
    listFailed: "Hermes n'a pas pu donner la liste des modèles.",
    unreachable: (n: number) =>
      n === 1 ? "Un agent n'a pas répondu : ses modèles manquent." : `${n} agents n'ont pas répondu : leurs modèles manquent.`,
    all: "Tous les modèles",
    none: "Aucun modèle",
    some: (n: number, total: number) => `${n} modèle${n > 1 ? "s" : ""} sur ${total}`,
    edit: "Modifier",
    editOf: (name: string) => `Modèles accessibles à ${name}`,
    search: "Chercher un modèle…",
    noMatch: "Aucun modèle ne correspond.",
    allOf: (provider: string) => `Tous les modèles ${provider}`,
  },
});

const key = (provider: string, id: string) => `${provider}::${id}`;

export function Models() {
  const t = useT(messages);
  const qc = useQueryClient();
  const { data: users = [], isPending: usersPending } = useQuery(adminUsersQuery);
  const { data, isPending, error } = useQuery(adminModelsQuery);
  const save = useMutation({
    mutationFn: ({ userId, blocked }: { userId: string; blocked: string[] }) =>
      api(`/admin/users/${userId}/models`, { method: "PUT", body: JSON.stringify({ blocked }) }),
    onMutate: ({ userId, blocked }) => {
      qc.setQueryData<AdminModels>(adminModelsQuery.queryKey, (d) => d && { ...d, blocked: { ...d.blocked, [userId]: blocked } });
    },
    // The conversations' model picker updates too.
    onSettled: () => Promise.all([qc.invalidateQueries({ queryKey: adminModelsQuery.queryKey }), qc.invalidateQueries({ queryKey: ["models"] })]),
  });

  const blockedOf = (userId: string) => new Set(data?.blocked[userId] ?? []);
  /** Allows (allowed) or forbids these models for an employee. */
  const set = (userId: string, models: string[], allowed: boolean) => {
    const blocked = blockedOf(userId);
    for (const m of models) allowed ? blocked.delete(m) : blocked.add(m);
    save.mutate({ userId, blocked: [...blocked] });
  };

  return (
    <>
      <SectionHeader title={t.title} text={t.text} />
      <Providers />
      <ListCard>
        <ListCardHeader>
          <CardTitle>{t.accessTitle}</CardTitle>
          {data && data.unreachable > 0 && <CardDescription>{t.unreachable(data.unreachable)}</CardDescription>}
        </ListCardHeader>
        {isPending || usersPending ? (
          <CardContent className="py-(--card-spacing)">
            <Loading />
          </CardContent>
        ) : !data ? (
          <CardContent className="py-(--card-spacing)">
            <LoadError error={error} text={t.listFailed} />
          </CardContent>
        ) : (
          <ListCardRows>
            {users.map((u) => (
              <UserModels key={u.id} user={u} providers={data.providers.filter((p) => !p.onlyFor || p.onlyFor === u.id)} blocked={blockedOf(u.id)} onChange={(models, allowed) => set(u.id, models, allowed)} />
            ))}
          </ListCardRows>
        )}
      </ListCard>
      <LocalModels />
      <HostClis />
    </>
  );
}

function UserModels({
  user: u,
  providers,
  blocked,
  onChange,
}: {
  user: AdminUser;
  providers: AdminModels["providers"];
  blocked: Set<string>;
  onChange: (models: string[], allowed: boolean) => void;
}) {
  const t = useT(messages);
  const ids = providers.flatMap((p) => p.models.map((m) => key(p.provider, m.id)));
  const allowed = ids.filter((id) => !blocked.has(id)).length;
  const summary = allowed === 0 ? t.none : allowed === ids.length ? t.all : t.some(allowed, ids.length);

  return (
    <Item size="xs">
      <ItemMedia>
        <PersonAvatar person={u} className="size-6" />
      </ItemMedia>
      <ItemContent>
        <ItemTitle>{u.name}</ItemTitle>
        <ItemDescription>{summary}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={t.editOf(u.name)} />}>{t.edit}</PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-80 p-0">
            <Command>
              <CommandInput placeholder={t.search} />
              <CommandList className="max-h-96">
                <CommandEmpty>{t.noMatch}</CommandEmpty>
                {providers.map((p) => {
                  const all = p.models.map((m) => key(p.provider, m.id));
                  const on = all.every((m) => !blocked.has(m));
                  const name = providerName(p.provider);
                  return (
                    <CommandGroup key={p.provider} heading={name}>
                      <CommandItem
                        value={`${p.provider}::*`}
                        keywords={[name, p.provider]}
                        data-checked={on}
                        onSelect={() => onChange(all, !on)}
                      >
                        <ModelLogo provider={p.provider} className="size-4" />
                        <span className="truncate">{t.allOf(name)}</span>
                      </CommandItem>
                      {p.models.map((m) => {
                        const id = key(p.provider, m.id);
                        return (
                          <CommandItem
                            key={id}
                            value={id}
                            keywords={[m.id, m.label ?? "", name, p.provider]}
                            data-checked={!blocked.has(id)}
                            onSelect={() => onChange([id], blocked.has(id))}
                          >
                            <ModelLogo model={m.id} provider={p.provider} />
                            <span className="truncate">{m.label ?? m.id}</span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  );
                })}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </ItemActions>
    </Item>
  );
}
