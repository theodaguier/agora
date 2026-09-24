import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Description, Label, Spinner, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { AdminGate, ErrorAlert, SettingsScroll, Intro, useAdminToast } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { companyMemoryQuery } from "@/lib/memory";
import { CheckIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* The api's /admin/memory: a short text added to every agent's context, on every message. */

const t = defineMessages({
  en: {
    title: "Shared memory",
    intro:
      "What every agent knows about the organization, on every message: who you are, what you do, the conventions to follow. Keep it short, it's read each time.",
    placeholder: "We are… Our customers… Always answer in…",
    count: (n: number, max: number) => `${n.toLocaleString("en")} / ${max.toLocaleString("en")} characters`,
  },
  fr: {
    title: "Mémoire partagée",
    intro:
      "Ce que chaque agent sait de l'organisation, à chaque message : qui vous êtes, ce que vous faites, les conventions à suivre. Reste bref, elle est relue à chaque fois.",
    placeholder: "Nous sommes… Nos clients… Réponds toujours en…",
    count: (n: number, max: number) => `${n.toLocaleString("fr")} / ${max.toLocaleString("fr")} caractères`,
  },
});

export default function CompanyMemoryScreen() {
  const memory = useQuery(companyMemoryQuery);
  return (
    <>
      <Stack.Screen options={{ title: t.title }} />
      <AdminGate>
        {memory.data ? (
          <Editor saved={memory.data.value} max={memory.data.max} />
        ) : memory.isPending ? (
          <Spinner className="mt-24 self-center" />
        ) : (
          <SettingsScroll>
            <ErrorAlert error={memory.error} />
          </SettingsScroll>
        )}
      </AdminGate>
    </>
  );
}

function Editor({ saved, max }: { saved: string; max: number }) {
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  // Only what was typed: untouched, the editor follows the saved text when it's reloaded.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;
  const dirty = value !== saved;
  const save = useMutation({
    mutationFn: () => api("/admin/memory", { method: "PUT", body: JSON.stringify({ value }) }),
    onSuccess: () => {
      toast.success(c.saved);
      return qc.invalidateQueries({ queryKey: companyMemoryQuery.queryKey });
    },
    onError: (e) => toast.failed(e),
  });

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? c.saving : c.save} disabled={!dirty || value.length > max || save.isPending} variant="prominent" onPress={withTap(() => save.mutate())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{t.intro}</Intro>
        <TextField>
          <Label>{t.title}</Label>
          <TextArea value={value} onChangeText={setDraft} placeholder={t.placeholder} maxLength={max} scrollEnabled={false} className="min-h-72" />
          <Description>{t.count(value.length, max)}</Description>
        </TextField>
      </SettingsScroll>
    </>
  );
}
