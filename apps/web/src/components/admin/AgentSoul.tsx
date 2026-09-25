import { confirmAction } from "@/lib/confirm";
import { soulTemplate } from "@agora/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { orgQuery } from "@/lib/org";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { ErrorText, Loading } from "./ui";

const messages = defineMessages({
  en: {
    soulIntro: "The agent's identity, role and tone (the SOUL.md file of its Hermes profile). Applied from the next message.",
    replaceConfirm: "Replace the current text with the template?",
    replaceBody: "What you wrote will be lost unless you copy it first.",
    replaceAction: "Replace",
    useTemplate: "Start from the template",
    advised: (length: number, limit: number) => `${length} / ${limit} chars recommended`,
    empty: "Empty for now.",
    memoryIntro:
      "What the agent has remembered about itself over conversations. One entry per block, separated by a “§” line. You can correct or erase them.",
    notes: "Agent notes",
    notesHint: "Facts, conventions, things learned (MEMORY.md).",
    users: "User profiles",
    usersHint: "What it knows about employees, shared by all (USER.md).",
  },
  fr: {
    soulIntro: "Identité, rôle et ton de l'agent (fichier SOUL.md de son profil Hermes). Pris en compte dès le message suivant.",
    replaceConfirm: "Remplacer le texte actuel par le modèle ?",
    replaceBody: "Ce que tu as écrit sera perdu, sauf si tu le copies avant.",
    replaceAction: "Remplacer",
    useTemplate: "Partir du modèle",
    advised: (length: number, limit: number) => `${length} / ${limit} car. conseillés`,
    empty: "Vide pour l'instant.",
    memoryIntro:
      "Ce que l'agent a retenu de lui-même au fil des conversations. Une entrée par bloc, séparées par une ligne « § ». Tu peux corriger ou effacer.",
    notes: "Notes de l'agent",
    notesHint: "Faits, conventions, choses apprises (MEMORY.md).",
    users: "Profils des utilisateurs",
    usersHint: "Ce qu'il sait des salariés, commun à tous (USER.md).",
  },
});


export function AgentSoul({ agentId, agentName }: { agentId: string; agentName: string }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const { data: org } = useQuery(orgQuery);
  const key = ["hermes", "soul", agentId];
  const { data, isPending, error } = useQuery({ queryKey: key, queryFn: () => api<{ value: string }>(`/admin/hermes/agents/${agentId}/soul`) });
  const [value, setValue] = useState("");
  useEffect(() => {
    if (data) setValue(data.value);
  }, [data]);
  const save = useMutation({
    mutationFn: () => api(`/admin/hermes/agents/${agentId}/soul`, { method: "PUT", body: JSON.stringify({ value }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    meta: { success: c.saved },
  });
  if (isPending) return <Loading />;
  if (!data) return <ErrorText error={error} />;
  const dirty = value !== data.value;

  return (
    <FieldGroup>
      <FieldDescription>{t.soulIntro}</FieldDescription>
      <Textarea
        aria-label="SOUL.md"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={20_000}
        className="h-96 resize-y field-sizing-fixed"
      />
      <Field orientation="horizontal">
        <Button
          variant="outline"
          size="sm"
          onClick={async () => (!value.trim() || (await confirmAction({ title: t.replaceConfirm, description: t.replaceBody, action: t.replaceAction }))) && setValue(soulTemplate({ name: agentName, org: org?.name ?? "Agora", locale: org?.locale ?? "fr" }))}
        >
          {t.useTemplate}
        </Button>
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {c.save}
        </Button>
      </Field>
    </FieldGroup>
  );
}

/** Hermes built-in memory: entries separated by "§", reread at the start of each session. */
export function AgentMemory({ agentId }: { agentId: string }) {
  const t = useT(messages);
  const c = useT(common);
  const qc = useQueryClient();
  const key = ["hermes", "agent-memory", agentId];
  const { data, isPending, error } = useQuery({
    queryKey: key,
    queryFn: () => api<{ notes: string; users: string }>(`/admin/hermes/agents/${agentId}/memory`),
  });
  const [notes, setNotes] = useState("");
  const [users, setUsers] = useState("");
  useEffect(() => {
    if (data) {
      setNotes(data.notes);
      setUsers(data.users);
    }
  }, [data]);
  const save = useMutation({
    mutationFn: () => api(`/admin/hermes/agents/${agentId}/memory`, { method: "PUT", body: JSON.stringify({ notes, users }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    meta: { success: c.saved },
  });
  if (isPending) return <Loading />;
  if (!data) return <ErrorText error={error} />;
  const dirty = notes !== data.notes || users !== data.users;

  const field = (id: string, label: string, hint: string, value: string, set: (v: string) => void, limit: number) => (
    <Field>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{hint}</FieldDescription>
      </FieldContent>
      <Textarea id={id} value={value} onChange={(e) => set(e.target.value)} placeholder={t.empty} className="h-44 resize-y field-sizing-fixed" />
      <FieldDescription className={cn(value.length > limit && "text-warning")}>{t.advised(value.length, limit)}</FieldDescription>
    </Field>
  );

  return (
    <FieldGroup>
      <FieldDescription>{t.memoryIntro}</FieldDescription>
      {field("agent-memory-notes", t.notes, t.notesHint, notes, setNotes, 2200)}
      {field("agent-memory-users", t.users, t.usersHint, users, setUsers, 1375)}
      <Field orientation="horizontal">
        <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {c.save}
        </Button>
      </Field>
    </FieldGroup>
  );
}
