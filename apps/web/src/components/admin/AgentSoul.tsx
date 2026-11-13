import { confirmAction } from "@/lib/confirm";
import { soulTemplate } from "@agora/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAutosave } from "@/lib/autosave";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldContent, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { api } from "@/lib/api";
import { orgQuery } from "@/lib/org";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";
import { LoadError, Loading } from "./ui";

const messages = defineMessages({
  en: {
    soulTitle: "Identity and tone",
    soulIntro: "The agent's identity, role and tone, written in its Hermes profile. Applied from the next message.",
    replaceConfirm: "Replace the current text with the template?",
    replaceBody: "What you wrote will be lost unless you copy it first.",
    replaceAction: "Replace",
    useTemplate: "Start from the template",
    notSaved: "Not saved",
    retry: "Retry",
    advised: (length: number, limit: number) => `${length} / ${limit} chars recommended`,
    empty: "Empty for now.",
    memoryTitle: "What the agent remembers",
    memoryIntro:
      "What the agent has remembered about itself over conversations. One entry per block, separated by a “§” line. You can correct or erase them.",
    notes: "Agent notes",
    notesHint: "Facts, conventions, things learned.",
    users: "User profiles",
    usersHint: "What it knows about employees, shared by all.",
  },
  fr: {
    soulTitle: "Identité et ton",
    soulIntro: "Identité, rôle et ton de l'agent, écrits dans son profil Hermes. Pris en compte dès le message suivant.",
    replaceConfirm: "Remplacer le texte actuel par le modèle ?",
    replaceBody: "Ce que tu as écrit sera perdu, sauf si tu le copies avant.",
    replaceAction: "Remplacer",
    useTemplate: "Partir du modèle",
    notSaved: "Non enregistré",
    retry: "Réessayer",
    advised: (length: number, limit: number) => `${length} / ${limit} car. conseillés`,
    empty: "Vide pour l'instant.",
    memoryTitle: "Ce que l'agent a retenu",
    memoryIntro:
      "Ce que l'agent a retenu de lui-même au fil des conversations. Une entrée par bloc, séparées par une ligne « § ». Tu peux corriger ou effacer.",
    notes: "Notes de l'agent",
    notesHint: "Faits, conventions, choses apprises.",
    users: "Profils des utilisateurs",
    usersHint: "Ce qu'il sait des salariés, commun à tous.",
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
  // The editor starts again from a text set from outside (loaded, saved, the template).
  const [version, setVersion] = useState(0);
  const reset = (text: string) => {
    setValue(text);
    setVersion((v) => v + 1);
  };
  // Loaded once: a save mustn't restart the editor under the cursor.
  const loaded = useRef(false);
  useEffect(() => {
    if (data && !loaded.current) {
      loaded.current = true;
      reset(data.value);
    }
  }, [data]);
  const latest = useRef(value);
  latest.current = value;
  // Saved as it's typed, like a document: no button to forget.
  const autosave = useAutosave(async () => {
    const text = latest.current;
    await api(`/admin/hermes/agents/${agentId}/soul`, { method: "PUT", body: JSON.stringify({ value: text }) });
    qc.setQueryData(key, { value: text });
  }, 1200);
  if (!data) return <CardShell title={t.soulTitle} intro={t.soulIntro}>{isPending ? <Loading /> : <LoadError error={error} />}</CardShell>;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.soulTitle}</CardTitle>
        <CardDescription>{t.soulIntro}</CardDescription>
        <CardAction>
          <Button
            variant="outline"
            size="sm"
            onClick={async () => (!value.trim() || (await confirmAction({ title: t.replaceConfirm, description: t.replaceBody, action: t.replaceAction }))) && (reset(soulTemplate({ name: agentName, org: org?.name ?? "Agora", locale: org?.locale ?? "fr" })), autosave.schedule())}
          >
            {t.useTemplate}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        {/* SOUL.md is Markdown: edited formatted, written back as Markdown. */}
        <RichTextEditor
          key={version}
          initial={{ markdown: value }}
          label={t.soulTitle}
          onChange={(e) => {
            latest.current = e.getMarkdown();
            setValue(latest.current);
            autosave.schedule();
          }}
          className="h-96 overflow-hidden rounded-lg border"
          contentClassName="min-h-full px-4 py-3"
        />
      </CardContent>
      {autosave.status !== "idle" && (
        <CardFooter className="justify-end gap-2 text-xs text-muted-foreground" aria-live="polite">
          {autosave.status === "error" ? (
            <>
              <span className="text-destructive">{t.notSaved}</span>
              <Button variant="outline" size="xs" onClick={() => void autosave.retry()}>
                {t.retry}
              </Button>
            </>
          ) : autosave.status === "saved" ? (
            c.saved
          ) : (
            c.saving
          )}
        </CardFooter>
      )}
    </Card>
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
  if (!data) return <CardShell title={t.memoryTitle} intro={t.memoryIntro}>{isPending ? <Loading /> : <LoadError error={error} />}</CardShell>;
  const dirty = notes !== data.notes || users !== data.users;

  const field = (id: string, file: string, label: string, hint: string, value: string, set: (v: string) => void, limit: number) => (
    <Field>
      <FieldContent>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <FieldDescription>{hint}</FieldDescription>
      </FieldContent>
      <Textarea id={id} title={file} value={value} onChange={(e) => set(e.target.value)} placeholder={t.empty} className="h-44 resize-y field-sizing-fixed" />
      <FieldDescription className={cn(value.length > limit && "text-warning")}>{t.advised(value.length, limit)}</FieldDescription>
    </Field>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.memoryTitle}</CardTitle>
        <CardDescription>{t.memoryIntro}</CardDescription>
      </CardHeader>
      <CardContent>
        <FieldGroup>
          {field("agent-memory-notes", "MEMORY.md", t.notes, t.notesHint, notes, setNotes, 2200)}
          {field("agent-memory-users", "USER.md", t.users, t.usersHint, users, setUsers, 1375)}
        </FieldGroup>
      </CardContent>
      {dirty && (
        <CardFooter className="justify-end">
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? c.saving : c.save}
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

/** The card's title and intro while its content loads or can't be fetched: never a blank tab. */
function CardShell({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{intro}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
