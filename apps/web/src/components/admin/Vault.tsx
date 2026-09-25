import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { confirmAction } from "@/lib/confirm";
import { FormLabel } from "@/components/FormLabel";
import { LockIcon, MoreIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Command, CommandGroup, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldDescription, FieldGroup, FieldLegend, FieldSet } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { api, type AdminAgent } from "@/lib/api";
import { adminAgentsQuery } from "@/lib/queries";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { ErrorText, Loading, SectionHeader, useRestartNeeded } from "./ui";

type Secret = { key: string; preview: string | null; description: string; instance: boolean; agents: string[] };

const vaultQuery = { queryKey: ["hermes", "vault"], queryFn: () => api<Secret[]>("/admin/hermes/vault") };

/** Same rule as the api: a shell variable name. */
const KEY = /^[A-Za-z_][A-Za-z0-9_]*$/;

const messages = defineMessages({
  en: {
    title: "Vault",
    text: "The credentials in the agents' .env: API keys, tokens, passwords. The list masks values; the developer view shows them.",
    add: "Add",
    emptyTitle: "No credentials",
    emptyText: "Add an API key or a token so agents can use it.",
    all: "All agents",
    none: "No agents",
    some: (n: number, total: number) => `${n} of ${total} agents`,
    edit: "Edit",
    more: (key: string) => `More actions for ${key}`,
    removeTitle: (key: string) => `Delete ${key}?`,
    removeText: "It's removed from the .env of the instance and of every agent. Agents that use it will stop working until it's added back.",
    newTitle: "New credential",
    editTitle: (key: string) => `Edit ${key}`,
    dialogText: "Written to the Hermes .env files. New agents also get it.",
    name: "Name",
    nameHelp: "Uppercase, digits and _. Paste a KEY=value line to fill both fields.",
    nameInvalid: "Letters, digits and _ only, not starting with a digit.",
    nameTaken: "This name is already in the vault: edit it instead.",
    value: "Value",
    newValue: "New value",
    keepValue: (preview: string) => `Leave empty to keep the current value (${preview}).`,
    show: "Show",
    hide: "Hide",
    agents: "Agents",
    agentsHelp: "Only these agents can read it.",
    main: "Always included",
    allOn: "Give to all agents",
    allOff: "Remove from all agents",
    list: "List",
    developer: "Developer",
    devHelp: "The instance's credentials as a .env file, values in clear. New names go to every agent, a line you delete is removed everywhere.",
    devLabel: "Instance .env",
    reset: "Reset",
    unchanged: "No changes.",
    applied: (a: number, u: number, r: number) =>
      [a && `${a} added`, u && `${u} updated`, r && `${r} deleted`].filter(Boolean).join(", ") + ".",
    removeManyTitle: (n: number) => `Delete ${n} credential${n > 1 ? "s" : ""}?`,
    removeManyText: (keys: string) => `${keys} will be removed from the .env of the instance and of every agent.`,
  },
  fr: {
    title: "Coffre",
    text: "Les credentials des .env des agents : clés d'API, jetons, mots de passe. La liste masque les valeurs, la vue développeur les affiche.",
    add: "Ajouter",
    emptyTitle: "Aucun credential",
    emptyText: "Ajoute une clé d'API ou un jeton pour que les agents puissent s'en servir.",
    all: "Tous les agents",
    none: "Aucun agent",
    some: (n: number, total: number) => `${n} agent${n > 1 ? "s" : ""} sur ${total}`,
    edit: "Modifier",
    more: (key: string) => `Plus d'actions pour ${key}`,
    removeTitle: (key: string) => `Supprimer ${key} ?`,
    removeText: "Il est retiré du .env de l'instance et de tous les agents. Ceux qui s'en servent ne fonctionneront plus tant qu'il n'est pas rajouté.",
    newTitle: "Nouveau credential",
    editTitle: (key: string) => `Modifier ${key}`,
    dialogText: "Écrit dans les .env de Hermes. Les nouveaux agents le reçoivent aussi.",
    name: "Nom",
    nameHelp: "Majuscules, chiffres et _. Colle une ligne CLE=valeur pour remplir les deux champs.",
    nameInvalid: "Lettres, chiffres et _ uniquement, sans chiffre au début.",
    nameTaken: "Ce nom est déjà dans le coffre : modifie-le plutôt.",
    value: "Valeur",
    newValue: "Nouvelle valeur",
    keepValue: (preview: string) => `Laisse vide pour garder la valeur actuelle (${preview}).`,
    show: "Afficher",
    hide: "Masquer",
    agents: "Agents",
    agentsHelp: "Seuls ces agents peuvent le lire.",
    main: "Toujours inclus",
    allOn: "Donner à tous les agents",
    allOff: "Retirer à tous les agents",
    list: "Liste",
    developer: "Développeur",
    devHelp: "Les credentials de l'instance au format .env, valeurs en clair. Un nouveau nom va à tous les agents, une ligne supprimée est retirée partout.",
    devLabel: ".env de l'instance",
    reset: "Réinitialiser",
    unchanged: "Aucun changement.",
    applied: (a: number, u: number, r: number) =>
      [a && `${a} ajouté${a > 1 ? "s" : ""}`, u && `${u} modifié${u > 1 ? "s" : ""}`, r && `${r} supprimé${r > 1 ? "s" : ""}`].filter(Boolean).join(", ") + ".",
    removeManyTitle: (n: number) => `Supprimer ${n} credential${n > 1 ? "s" : ""} ?`,
    removeManyText: (keys: string) => `${keys} ${keys.includes(",") ? "seront retirés" : "sera retiré"} du .env de l'instance et de tous les agents.`,
  },
});

const isMain = (a: AdminAgent) => a.hermesProfile === "default";

export function Vault() {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const flagRestart = useRestartNeeded();
  const { data: secrets, isPending, error } = useQuery(vaultQuery);
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  // null: closed; "": new credential; otherwise the key being edited.
  const [editing, setEditing] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (key: string) => api(`/admin/hermes/vault/${encodeURIComponent(key)}`, { method: "DELETE" }),
    onSuccess: flagRestart,
    onSettled: () => qc.invalidateQueries({ queryKey: vaultQuery.queryKey }),
    meta: { success: c.deleted },
  });

  const summary = (s: Secret) => {
    const granted = new Set(s.agents);
    const n = agents.filter((a) => granted.has(a.id) || (isMain(a) && s.instance)).length;
    return n === 0 ? t.none : n === agents.length ? t.all : t.some(n, agents.length);
  };

  return (
    <>
      <SectionHeader title={t.title} text={t.text} action={t.add} onAction={() => setEditing("")} />
      <Tabs defaultValue="list" className="gap-5">
        <TabsList variant="line" className="w-full justify-start border-b">
          <TabsTrigger value="list">{t.list}</TabsTrigger>
          <TabsTrigger value="developer">{t.developer}</TabsTrigger>
        </TabsList>
        <TabsContent value="developer">
          <DeveloperView />
        </TabsContent>
        <TabsContent value="list" className="flex flex-col gap-2">
          <ErrorText error={error} />
          {isPending ? (
            <Loading />
          ) : secrets?.length ? (
            <ItemGroup className="gap-2">
              {secrets.map((s) => (
                <Item key={s.key} variant="outline">
                  <ItemContent className="min-w-0">
                    <ItemTitle className="font-mono">{s.key}</ItemTitle>
                    <ItemDescription className="truncate">{[s.preview, summary(s)].filter(Boolean).join(" · ")}</ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button variant="outline" size="sm" onClick={() => setEditing(s.key)}>
                      {t.edit}
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label={t.more(s.key)} />}>
                        <MoreIcon />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={async () =>
                            (await confirmAction({ title: t.removeTitle(s.key), description: t.removeText, action: c.delete })) && remove.mutate(s.key)
                          }
                        >
                          {c.delete}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </ItemActions>
                </Item>
              ))}
            </ItemGroup>
          ) : (
            !error && (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <LockIcon />
                  </EmptyMedia>
                  <EmptyTitle>{t.emptyTitle}</EmptyTitle>
                  <EmptyDescription>{t.emptyText}</EmptyDescription>
                </EmptyHeader>
              </Empty>
            )
          )}
        </TabsContent>
      </Tabs>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        {editing !== null && (
          <SecretDialog
            key={editing}
            secret={secrets?.find((s) => s.key === editing)}
            taken={(key) => !!secrets?.some((s) => s.key === key)}
            agents={agents}
            onSaved={() => {
              flagRestart();
              setEditing(null);
            }}
          />
        )}
      </Dialog>
    </>
  );
}

function SecretDialog({
  secret,
  taken,
  agents,
  onSaved,
}: {
  secret?: Secret;
  taken: (key: string) => boolean;
  agents: AdminAgent[];
  onSaved: () => void;
}) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const [key, setKey] = useState(secret?.key ?? "");
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [picked, setPicked] = useState(() => {
    const granted = secret && new Set(secret.agents);
    return agents.filter((a) => !isMain(a) && (granted ? granted.has(a.id) : true)).map((a) => a.id);
  });
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/hermes/vault/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ ...(value && { value }), agentIds: picked }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: vaultQuery.queryKey });
      onSaved();
    },
    meta: { success: c.saved, error: false },
  });

  const others = agents.filter((a) => !isMain(a));
  const pickedIds = new Set(picked);
  const everything = others.every((a) => pickedIds.has(a.id));
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const nameError = key && !KEY.test(key) ? t.nameInvalid : !secret && taken(key) ? t.nameTaken : null;
  const valid = !!key && !nameError && (secret ? true : !!value);

  return (
    <DialogContent className="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{secret ? t.editTitle(secret.key) : t.newTitle}</DialogTitle>
        <DialogDescription>{t.dialogText}</DialogDescription>
      </DialogHeader>
      <form
        id="vault-secret"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) save.mutate();
        }}
      >
        <FieldGroup className="gap-5">
          {!secret && (
            <Field data-invalid={!!nameError}>
              <FormLabel htmlFor="vault-key" required>
                {t.name}
              </FormLabel>
              <Input
                id="vault-key"
                className="font-mono"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                aria-invalid={!!nameError}
                value={key}
                onChange={(e) => setKey(e.target.value.toUpperCase())}
                onPaste={(e) => {
                  // A whole KEY=value line from a .env fills both fields.
                  const line = e.clipboardData.getData("text").trim().replace(/^export\s+/, "");
                  const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
                  if (!m) return;
                  e.preventDefault();
                  setKey(m[1]!.toUpperCase());
                  setValue(m[2]!.replace(/^(["'])(.*)\1$/, "$2"));
                }}
              />
              <FieldDescription>{nameError ?? t.nameHelp}</FieldDescription>
            </Field>
          )}
          <Field>
            <FormLabel htmlFor="vault-value" required={!secret}>
              {secret ? t.newValue : t.value}
            </FormLabel>
            <InputGroup>
              <InputGroupInput
                id="vault-value"
                className="font-mono"
                type={shown ? "text" : "password"}
                autoComplete="new-password"
                spellCheck={false}
                autoFocus={!!secret}
                value={value}
                onChange={(e) => setValue(e.target.value)}
              />
              <InputGroupAddon align="inline-end">
                <InputGroupButton size="sm" onClick={() => setShown((s) => !s)}>
                  {shown ? t.hide : t.show}
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
            {secret?.preview && <FieldDescription>{t.keepValue(secret.preview)}</FieldDescription>}
          </Field>
          {agents.length > 0 && (
            <FieldSet>
              <FieldLegend variant="label">{t.agents}</FieldLegend>
              <FieldDescription>{t.agentsHelp}</FieldDescription>
              <Command className="rounded-xl border border-border p-1">
                <CommandList className="max-h-60">
                  <CommandGroup>
                    {agents.map((a) => {
                      const main = isMain(a);
                      const checked = main || pickedIds.has(a.id);
                      return (
                        <CommandItem
                          key={a.id}
                          value={a.id}
                          disabled={main}
                          onSelect={() => toggle(a.id)}
                          className="h-10 gap-2.5 rounded-lg px-2 text-sm"
                        >
                          <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} className="size-6" />
                          <span className="flex-1 truncate">{a.name}</span>
                          {main && <span className="text-xs text-muted-foreground">{t.main}</span>}
                          <Checkbox checked={checked} tabIndex={-1} aria-hidden className="pointer-events-none" />
                        </CommandItem>
                      );
                    })}
                  </CommandGroup>
                  {others.length > 1 && (
                    <>
                      <CommandSeparator />
                      <CommandItem value="__all" onSelect={() => setPicked(everything ? [] : others.map((a) => a.id))}>
                        {everything ? t.allOff : t.allOn}
                      </CommandItem>
                    </>
                  )}
                </CommandList>
              </Command>
            </FieldSet>
          )}
          <ErrorText error={save.error} />
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form="vault-secret" disabled={!valid || save.isPending}>
          {save.isPending ? c.saving : c.save}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

type RawResult = { added: string[]; updated: string[]; removed: string[] };

/** Names defined in a .env text, as the api reads them. */
const names = (text: string) =>
  new Set(
    text
      .split(/\r?\n/)
      .map((l) => /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/.exec(l)?.[1])
      .filter((k): k is string => !!k),
  );

/** The instance .env as text: paste a whole file, edit, save. */
function DeveloperView() {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const flagRestart = useRestartNeeded();
  // Values in clear: never kept in the cache once the view is gone.
  const raw = useQuery({
    queryKey: ["hermes", "vault", "raw"],
    queryFn: () => api<{ text: string }>("/admin/hermes/vault/raw"),
    gcTime: 0,
    staleTime: 0,
  });
  const [draft, setDraft] = useState<string | null>(null);
  const original = raw.data?.text ?? "";
  const text = draft ?? original;
  const save = useMutation({
    mutationFn: () => api<RawResult>("/admin/hermes/vault/raw", { method: "PUT", body: JSON.stringify({ text }) }),
    onSuccess: async (r) => {
      if (r.added.length + r.updated.length + r.removed.length) flagRestart();
      await qc.invalidateQueries({ queryKey: vaultQuery.queryKey });
      setDraft(null);
    },
    meta: {
      success: (r: RawResult) =>
        r.added.length + r.updated.length + r.removed.length ? t.applied(r.added.length, r.updated.length, r.removed.length) : t.unchanged,
    },
  });

  if (raw.isPending) return <Loading />;
  if (raw.error) return <ErrorText error={raw.error} />;

  const submit = async () => {
    const kept = names(text);
    const gone = [...names(original)].filter((k) => !kept.has(k));
    if (gone.length && !(await confirmAction({ title: t.removeManyTitle(gone.length), description: t.removeManyText(gone.join(", ")), action: c.delete }))) return;
    save.mutate();
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <FieldGroup className="gap-4">
        <Field>
          <FormLabel htmlFor="vault-raw">{t.devLabel}</FormLabel>
          <FieldDescription>{t.devHelp}</FieldDescription>
          <Textarea
            id="vault-raw"
            className="min-h-64 resize-y font-mono text-[13px] leading-relaxed field-sizing-fixed"
            spellCheck={false}
            autoComplete="off"
            autoCapitalize="off"
            wrap="off"
            placeholder="OPENAI_API_KEY=sk-…"
            value={text}
            onChange={(e) => setDraft(e.target.value)}
          />
        </Field>
        <Field orientation="horizontal">
          <Button type="submit" disabled={draft === null || draft === original || save.isPending}>
            {save.isPending ? c.saving : c.save}
          </Button>
          <Button type="button" variant="outline" disabled={draft === null || save.isPending} onClick={() => setDraft(null)}>
            {t.reset}
          </Button>
        </Field>
      </FieldGroup>
    </form>
  );
}
