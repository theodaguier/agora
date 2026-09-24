import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Description, FieldError, Label, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { AdminGate, ErrorAlert, SettingsScroll, Intro, LoadingRows, useAdminToast } from "@/components/admin/ui";
import { agentMemoryQuery } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* AgentMemory of apps/web/src/components/admin/AgentSoul.tsx: Hermes built-in memory, entries separated by "§". */

const t = defineMessages({
  en: {
    title: "Memory",
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
    title: "Mémoire",
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

export default function AgentMemoryScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const memory = useQuery(agentMemoryQuery(agentId));
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        {memory.data ? (
          <MemoryEditor agentId={agentId} saved={memory.data} />
        ) : memory.isPending ? (
          <SettingsScroll>
            <LoadingRows rows={3} avatar={false} />
          </SettingsScroll>
        ) : (
          <SettingsScroll>
            <ErrorAlert error={memory.error} />
          </SettingsScroll>
        )}
      </AdminGate>
    </>
  );
}

function MemoryEditor({ agentId, saved }: { agentId: string; saved: { notes: string; users: string } }) {
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  // Only what was typed: an untouched field follows the saved text when it's reloaded.
  const [draft, setDraft] = useState<{ notes?: string; users?: string }>({});
  const notes = draft.notes ?? saved.notes;
  const users = draft.users ?? saved.users;
  const setNotes = (notes: string) => setDraft((d) => ({ ...d, notes }));
  const setUsers = (users: string) => setDraft((d) => ({ ...d, users }));
  const dirty = notes !== saved.notes || users !== saved.users;
  const save = useMutation({
    mutationFn: () => api(`/admin/hermes/agents/${agentId}/memory`, { method: "PUT", body: JSON.stringify({ notes, users }) }),
    onSuccess: () => {
      toast.success(c.saved);
      return qc.invalidateQueries({ queryKey: agentMemoryQuery(agentId).queryKey });
    },
    onError: (e) => toast.failed(e),
  });

  const field = (label: string, hint: string, value: string, set: (v: string) => void, limit: number) => (
    // Past the advised length, the count turns into the field's error (the web shows it in warning color).
    <TextField isInvalid={value.length > limit}>
      <Label>{label}</Label>
      <Description>{hint}</Description>
      <TextArea value={value} onChangeText={set} placeholder={t.empty} autoCorrect={false} scrollEnabled={false} />
      {value.length > limit ? <FieldError>{t.advised(value.length, limit)}</FieldError> : <Description>{t.advised(value.length, limit)}</Description>}
    </TextField>
  );

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? c.saving : c.save} disabled={!dirty || save.isPending} variant="prominent" onPress={withTap(() => save.mutate())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{t.memoryIntro}</Intro>
        {field(t.notes, t.notesHint, notes, setNotes, 2200)}
        {field(t.users, t.usersHint, users, setUsers, 1375)}
      </SettingsScroll>
    </>
  );
}
