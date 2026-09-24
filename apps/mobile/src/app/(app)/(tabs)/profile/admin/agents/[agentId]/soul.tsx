import { soulTemplate } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Label, TextArea, TextField } from "heroui-native";
import { useState } from "react";
import { confirmAction } from "@/components/confirm-action";
import { AdminGate, ErrorAlert, SettingsScroll, Intro, LoadingRows, useAdminToast } from "@/components/admin/ui";
import { adminAgentsQuery, orgQuery, soulQuery, type AdminAgent } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { headerIcon } from "@/components/header-button";
import { MenuButton } from "@/components/menus";
import { withTap } from "@/lib/haptics";

/* AgentSoul of apps/web/src/components/admin/AgentSoul.tsx */

const t = defineMessages({
  en: {
    title: "Personality",
    soulIntro: "The agent's identity, role and tone (the SOUL.md file of its Hermes profile). Applied from the next message.",
    replaceConfirm: "Replace the current text with the template?",
    replaceBody: "What you wrote will be lost unless you copy it first.",
    replaceAction: "Replace",
    fromTemplate: "Start from the template",
    more: "More",
  },
  fr: {
    title: "Personnalité",
    soulIntro: "Identité, rôle et ton de l'agent (fichier SOUL.md de son profil Hermes). Pris en compte dès le message suivant.",
    replaceConfirm: "Remplacer le texte actuel par le modèle ?",
    replaceBody: "Ce que tu as écrit sera perdu, sauf si tu le copies avant.",
    replaceAction: "Remplacer",
    fromTemplate: "Partir du modèle",
    more: "Plus",
  },
});

export default function AgentSoulScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const agent = useQuery(adminAgentsQuery).data?.find((a) => a.id === agentId);
  const soul = useQuery(soulQuery(agentId));
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        {soul.data && agent ? (
          <SoulEditor key={agent.id} agent={agent} saved={soul.data.value} />
        ) : soul.isPending ? (
          <SettingsScroll>
            <LoadingRows rows={3} avatar={false} />
          </SettingsScroll>
        ) : (
          <SettingsScroll>
            <ErrorAlert error={soul.error} />
          </SettingsScroll>
        )}
      </AdminGate>
    </>
  );
}

function SoulEditor({ agent, saved }: { agent: AdminAgent; saved: string }) {
  const c = tr(common);
  const qc = useQueryClient();
  const toast = useAdminToast();
  const { data: org } = useQuery(orgQuery);
  // Only what was typed: untouched, the editor follows the saved text when it's reloaded.
  const [draft, setDraft] = useState<string | null>(null);
  const value = draft ?? saved;
  const dirty = value !== saved;
  const save = useMutation({
    mutationFn: () => api(`/admin/hermes/agents/${agent.id}/soul`, { method: "PUT", body: JSON.stringify({ value }) }),
    onSuccess: () => {
      toast.success(c.saved);
      return qc.invalidateQueries({ queryKey: soulQuery(agent.id).queryKey });
    },
    onError: (e) => toast.failed(e),
  });

  const applyTemplate = async () => {
    if (value.trim() && !(await confirmAction({ title: t.replaceConfirm, description: t.replaceBody, action: t.replaceAction }))) return;
    setDraft(soulTemplate({ name: agent.name, org: org?.name ?? "Agora", locale: org?.locale ?? "fr" }));
  };

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <MenuButton icon="ellipsis" label={t.more} actions={[{ label: t.fromTemplate, icon: "doc.text", onPress: applyTemplate }]} />
        </Stack.Toolbar.View>
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? c.saving : c.save} disabled={!dirty || save.isPending} variant="prominent" onPress={withTap(() => save.mutate())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{t.soulIntro}</Intro>
        <TextField>
          <Label>SOUL.md</Label>
          <TextArea
            value={value}
            onChangeText={setDraft}
            maxLength={20_000}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            scrollEnabled={false}
          />
        </TextField>
      </SettingsScroll>
    </>
  );
}
