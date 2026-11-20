import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { common } from "@agora/core/i18n";
import { useState, type ReactNode } from "react";
import { AgentAvatar } from "@/components/AgentAvatar";
import { PersonAvatar } from "@/components/ConversationAvatar";
import { FormLabel } from "@/components/FormLabel";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, FieldGroup } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { defineMessages, useT } from "@/i18n";
import { api } from "@/lib/api";
import { agentsQuery, conversationsQuery, usersQuery } from "@/lib/queries";

const messages = defineMessages({
  en: {
    title: "New project",
    description: "Its discussions, its context and its data in one place. You can add bots and colleagues later.",
    name: "Name",
    summary: "Description",
    summaryPlaceholder: "What it's about, in one line",
    bots: "Bots",
    botsPlaceholder: "Add bots",
    people: "Colleagues",
    peoplePlaceholder: "Add colleagues",
    none: "Nobody else to add.",
    create: "Create the project",
    failed: "Couldn't create the project.",
  },
  fr: {
    title: "Nouveau projet",
    description: "Ses discussions, son contexte et ses données au même endroit. Tu pourras ajouter des bots et des collègues ensuite.",
    name: "Nom",
    summary: "Description",
    summaryPlaceholder: "De quoi il parle, en une ligne",
    bots: "Bots",
    botsPlaceholder: "Ajouter des bots",
    people: "Collègues",
    peoplePlaceholder: "Ajouter des collègues",
    none: "Personne d'autre à ajouter.",
    create: "Créer le projet",
    failed: "Impossible de créer le projet.",
  },
});

/** Creates a project, then opens its page: a name is enough, bots and colleagues can come later. */
export function NewProjectDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open && <NewProjectForm onDone={() => onOpenChange(false)} />}</Dialog>;
}

function NewProjectForm({ onDone }: { onDone: () => void }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: agents = [] } = useQuery(agentsQuery);
  const { data: people = [] } = useQuery(usersQuery);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [agentIds, setAgentIds] = useState<string[]>([]);
  const [userIds, setUserIds] = useState<string[]>([]);
  // A bot still being set up doesn't join groups.
  const bots = agents.filter((a) => !a.onboarding);
  const create = useMutation({
    mutationFn: () =>
      api<{ id: string }>("/conversations/group", {
        method: "POST",
        body: JSON.stringify({ title: title.trim(), description: description.trim(), agentIds, userIds }),
      }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: conversationsQuery.queryKey });
      onDone();
      navigate({ to: "/p/$projectId", params: { projectId: id } });
    },
    meta: { loading: c.creating, error: t.failed },
  });
  const valid = title.trim().length > 0;
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{t.title}</DialogTitle>
        <DialogDescription>{t.description}</DialogDescription>
      </DialogHeader>
      <form
        id="new-project"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && !create.isPending) create.mutate();
        }}
      >
        <FieldGroup>
          <Field>
            <FormLabel htmlFor="project-name" required>
              {t.name}
            </FormLabel>
            <Input id="project-name" autoFocus value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field>
            <FormLabel htmlFor="project-description">{t.summary}</FormLabel>
            <Input id="project-description" value={description} maxLength={200} placeholder={t.summaryPlaceholder} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <PeoplePicker
            id="project-bots"
            label={t.bots}
            placeholder={t.botsPlaceholder}
            empty={t.none}
            items={bots.map((a) => ({ id: a.id, name: a.name, mark: <AgentAvatar agent={a} className="size-4" /> }))}
            value={agentIds}
            onChange={setAgentIds}
          />
          <PeoplePicker
            id="project-people"
            label={t.people}
            placeholder={t.peoplePlaceholder}
            empty={t.none}
            items={people.map((p) => ({ id: p.id, name: p.name, mark: <PersonAvatar person={p} className="size-4" /> }))}
            value={userIds}
            onChange={setUserIds}
          />
        </FieldGroup>
      </form>
      <DialogFooter>
        <DialogClose render={<Button variant="outline" />}>{c.cancel}</DialogClose>
        <Button type="submit" form="new-project" disabled={!valid || create.isPending}>
          {t.create}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/** Several bots or colleagues picked by name: shadcn's multiple combobox, each one a chip with its face. */
function PeoplePicker({
  id,
  label,
  placeholder,
  empty,
  items,
  value,
  onChange,
}: {
  id: string;
  label: string;
  placeholder: string;
  empty: string;
  items: { id: string; name: string; mark: ReactNode }[];
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const anchor = useComboboxAnchor();
  const byId = new Map(items.map((i) => [i.id, i]));
  return (
    <Field>
      <FormLabel htmlFor={id}>{label}</FormLabel>
      <Combobox
        multiple
        autoHighlight
        items={items.map((i) => i.id)}
        value={value}
        onValueChange={(v) => onChange(v as string[])}
        itemToStringLabel={(v) => byId.get(v as string)?.name ?? ""}
      >
        <ComboboxChips ref={anchor}>
          <ComboboxValue>
            {(ids: string[]) => (
              <>
                {ids.map((v) => (
                  <ComboboxChip key={v}>
                    {byId.get(v)?.mark}
                    {byId.get(v)?.name}
                  </ComboboxChip>
                ))}
                <ComboboxChipsInput id={id} placeholder={ids.length ? undefined : placeholder} />
              </>
            )}
          </ComboboxValue>
        </ComboboxChips>
        <ComboboxContent anchor={anchor}>
          <ComboboxEmpty>{empty}</ComboboxEmpty>
          <ComboboxList>
            {(v: string) => (
              <ComboboxItem key={v} value={v}>
                {byId.get(v)?.mark}
                {byId.get(v)?.name}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </Field>
  );
}
