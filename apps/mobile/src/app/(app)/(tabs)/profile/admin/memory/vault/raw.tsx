import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack } from "expo-router";
import { Label, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { confirmAction } from "@/components/confirm-action";
import { AdminGate, ErrorAlert, SettingsScroll, Intro, LoadingRows, useAdminToast } from "@/components/admin/ui";
import { RestartBanner } from "@/components/marketplace/restart-banner";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { flagRestart } from "@/lib/marketplace";
import { envNames, vaultQuery, type RawResult } from "@/lib/memory";
import { CheckIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { MenuButton } from "@/components/menus";
import { withTap } from "@/lib/haptics";

/* DeveloperView of apps/web/src/components/admin/Vault.tsx: the instance .env as text. */

const t = defineMessages({
  en: {
    developer: "Developer",
    devHelp: "The instance's credentials as a .env file, values in clear. New names go to every agent, a line you delete is removed everywhere.",
    devLabel: "Instance .env",
    reset: "Reset",
    more: "More",
    unchanged: "No changes.",
    applied: (a: number, u: number, r: number) => [a && `${a} added`, u && `${u} updated`, r && `${r} deleted`].filter(Boolean).join(", ") + ".",
    removeManyTitle: (n: number) => `Delete ${n} credential${n > 1 ? "s" : ""}?`,
    removeManyText: (keys: string) => `${keys} will be removed from the .env of the instance and of every agent.`,
  },
  fr: {
    developer: "Développeur",
    devHelp: "Les credentials de l'instance au format .env, valeurs en clair. Un nouveau nom va à tous les agents, une ligne supprimée est retirée partout.",
    devLabel: ".env de l'instance",
    reset: "Réinitialiser",
    more: "Plus",
    unchanged: "Aucun changement.",
    applied: (a: number, u: number, r: number) =>
      [a && `${a} ajouté${a > 1 ? "s" : ""}`, u && `${u} modifié${u > 1 ? "s" : ""}`, r && `${r} supprimé${r > 1 ? "s" : ""}`].filter(Boolean).join(", ") + ".",
    removeManyTitle: (n: number) => `Supprimer ${n} credential${n > 1 ? "s" : ""} ?`,
    removeManyText: (keys: string) => `${keys} ${keys.includes(",") ? "seront retirés" : "sera retiré"} du .env de l'instance et de tous les agents.`,
  },
});

export default function VaultRawScreen() {
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  // Values in clear: never kept in the cache once the screen is gone.
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
      const n = r.added.length + r.updated.length + r.removed.length;
      if (n) toast.success(c.saved, t.applied(r.added.length, r.updated.length, r.removed.length));
      else toast.info(t.unchanged);
      if (n) flagRestart();
      await qc.invalidateQueries({ queryKey: vaultQuery.queryKey });
      await raw.refetch();
      setDraft(null);
    },
    onError: (e) => toast.failed(e),
  });

  const submit = async () => {
    const kept = envNames(text);
    const gone = [...envNames(original)].filter((k) => !kept.has(k));
    if (gone.length && !(await confirmAction({ title: t.removeManyTitle(gone.length), description: t.removeManyText(gone.join(", ")), action: c.delete }))) return;
    save.mutate();
  };
  const changed = draft !== null && draft !== original;

  return (
    <>
      <Stack.Screen options={{ title: t.developer }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <MenuButton
            icon="ellipsis"
            label={t.more}
            disabled={draft === null || save.isPending}
            actions={[{ label: t.reset, icon: "arrow.uturn.backward", destructive: true, onPress: () => setDraft(null) }]}
          />
        </Stack.Toolbar.View>
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? c.saving : c.save} disabled={!changed || save.isPending} variant="prominent" onPress={withTap(() => void submit())} />
      </Stack.Toolbar>
      <AdminGate>
        <SettingsScroll>
          <Intro>{t.devHelp}</Intro>
          <RestartBanner />
          <ErrorAlert error={raw.error} />
          {raw.isPending ? (
            <LoadingRows rows={4} avatar={false} />
          ) : (
            !raw.error && (
              <TextField>
                <Label>{t.devLabel}</Label>
                <TextArea
                  value={text}
                  onChangeText={setDraft}
                  placeholder="OPENAI_API_KEY=sk-…"
                  autoCapitalize="none"
                  autoCorrect={false}
                  spellCheck={false}
                  scrollEnabled={false}
                  className="min-h-72"
                />
              </TextField>
            )
          )}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
