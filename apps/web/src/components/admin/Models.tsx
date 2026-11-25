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
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { modelName } from "@agora/core";
import { simple } from "@agora/core/i18n";
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
  // The model an employee's conversations start on, among those allowed; null = each bot's own.
  const setDefault = useMutation({
    mutationFn: ({ userId, model }: { userId: string; model: string | null }) =>
      api(`/admin/users/${userId}/default-model`, { method: "PUT", body: JSON.stringify({ model }) }),
    onMutate: ({ userId, model }) => {
      qc.setQueryData<AdminModels>(adminModelsQuery.queryKey, (d) => {
        if (!d) return d;
        const defaults = { ...d.defaults };
        if (model) defaults[userId] = model;
        else delete defaults[userId];
        return { ...d, defaults };
      });
    },
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: adminModelsQuery.queryKey }),
        qc.invalidateQueries({ queryKey: adminUsersQuery.queryKey }),
        qc.invalidateQueries({ queryKey: ["models"] }),
      ]),
  });
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
              <UserModels
                key={u.id}
                user={u}
                providers={data.providers.filter((p) => !p.onlyFor || p.onlyFor === u.id)}
                blocked={blockedOf(u.id)}
                onChange={(models, allowed) => set(u.id, models, allowed)}
                defaultModel={data.defaults?.[u.id] ?? null}
                onDefault={(model) => setDefault.mutate({ userId: u.id, model })}
              />
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
  defaultModel,
  onDefault,
}: {
  user: AdminUser;
  providers: AdminModels["providers"];
  blocked: Set<string>;
  onChange: (models: string[], allowed: boolean) => void;
  defaultModel: string | null;
  onDefault: (model: string | null) => void;
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
        <DefaultModelSelect providers={providers} blocked={blocked} value={defaultModel} onChange={onDefault} name={u.name} />
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

const AGENT_DEFAULT = "\u0001agent";

/** An employee's default model (Figma « Mode simple », web — Modèles par personne): the allowed ones, by provider. */
function DefaultModelSelect({
  providers,
  blocked,
  value,
  onChange,
  name,
}: {
  providers: AdminModels["providers"];
  blocked: Set<string>;
  value: string | null;
  onChange: (model: string | null) => void;
  name: string;
}) {
  const ts = useT(simple);
  const groups = providers
    .map((p) => ({ provider: p.provider, models: p.models.filter((m) => !blocked.has(key(p.provider, m.id))) }))
    .filter((p) => p.models.length);
  const labelOf = (v: string) => {
    if (v === AGENT_DEFAULT) return ts.agentDefault;
    const [provider, id] = v.split("::") as [string, string];
    return providers.find((p) => p.provider === provider)?.models.find((m) => m.id === id)?.label ?? modelName(id);
  };
  return (
    <Select value={value ?? AGENT_DEFAULT} onValueChange={(v) => v != null && onChange(v === AGENT_DEFAULT ? null : (v as string))}>
      <SelectTrigger size="sm" aria-label={`${ts.defaultModel}, ${name}`} title={ts.defaultModelHint} className="w-44">
        <SelectValue>{(v: string | null) => (v ? labelOf(v) : null)}</SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="end" className="max-h-96 w-64">
        <SelectGroup>
          <SelectItem value={AGENT_DEFAULT}>{ts.agentDefault}</SelectItem>
        </SelectGroup>
        {groups.map((p) => (
          <SelectGroup key={p.provider}>
            <SelectLabel>{providerName(p.provider)}</SelectLabel>
            {p.models.map((m) => (
              <SelectItem key={m.id} value={key(p.provider, m.id)}>
                <ModelLogo model={m.id} provider={p.provider} />
                {m.label ?? modelName(m.id)}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
