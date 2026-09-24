import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { ModelLogo } from "@/components/ProviderLogo";
import { providerName } from "@/lib/providers";
import { Button } from "@/components/ui/button";
import { FieldGroup, FieldSeparator } from "@/components/ui/field";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { api, type AdminModels, type AdminUser } from "@/lib/api";
import { adminModelsQuery, adminUsersQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { HostClis, LocalModels } from "./HostModels";
import { Loading, SectionHeader } from "./ui";

const messages = defineMessages({
  en: {
    title: "Models",
    text: "Which models each employee can pick. New models are allowed by default.",
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
    text: "Quels modèles chaque salarié peut choisir. Les nouveaux modèles sont autorisés d'office.",
    listFailed: "Hermes n'a pas pu donner la liste des modèles.",
    unreachable: (n: number) =>
      `${n === 1 ? "Un agent n'a pas répondu" : `${n} agents n'ont pas répondu`} : ses modèles manquent.`,
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
  const { data: users = [] } = useQuery(adminUsersQuery);
  const { data, isPending, isError } = useQuery(adminModelsQuery);
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
      {isPending ? (
        <Loading />
      ) : isError ? (
        <p className="text-sm text-destructive">{t.listFailed}</p>
      ) : (
        <>
          {data.unreachable > 0 && <p className="mb-3 text-sm text-muted-foreground">{t.unreachable(data.unreachable)}</p>}
          <ItemGroup className="gap-2">
            {users.map((u) => (
              <UserModels key={u.id} user={u} providers={data.providers.filter((p) => !p.onlyFor || p.onlyFor === u.id)} blocked={blockedOf(u.id)} onChange={(models, allowed) => set(u.id, models, allowed)} />
            ))}
          </ItemGroup>
        </>
      )}
      <FieldGroup className="mt-8">
        <LocalModels />
        <FieldSeparator />
        <HostClis />
      </FieldGroup>
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
    <Item variant="outline" role="listitem">
      <ItemMedia>
        <PersonAvatar person={u} className="size-9" />
      </ItemMedia>
      <ItemContent className="min-w-0">
        <ItemTitle className="w-full truncate">{u.name}</ItemTitle>
        <ItemDescription className="truncate">{summary}</ItemDescription>
      </ItemContent>
      <ItemActions>
        <Popover>
          <PopoverTrigger render={<Button variant="outline" size="sm" aria-label={t.editOf(u.name)} />}>{t.edit}</PopoverTrigger>
          <PopoverContent align="end" sideOffset={6} className="w-80 p-0">
            <Command className="p-1.5">
              <CommandInput placeholder={t.search} />
              <CommandList className="max-h-96 pt-1.5">
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
                        className="h-9 gap-2.5 rounded-lg px-2.5 text-sm"
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
                            className="h-9 gap-2.5 rounded-lg pl-9 pr-2.5 text-sm"
                          >
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
