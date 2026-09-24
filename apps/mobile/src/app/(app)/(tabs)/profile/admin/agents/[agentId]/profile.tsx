import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Description, FieldError, Input, Label, TextField } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { AvatarPicker } from "@/components/agents-admin/avatar-picker";
import { AdminGate, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { adminAgentsQuery, type AdminAgent } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { agentsQuery, conversationsQuery } from "@/lib/queries";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* apps/web/src/components/admin/AgentProfile.tsx */

const t = defineMessages({
  en: { title: "Profile", name: "Name", nameRequired: "The agent needs a name.", profile: (p: string) => `Hermes profile: ${p}. Set when the agent was created.` },
  fr: { title: "Profil", name: "Nom", nameRequired: "L'agent a besoin d'un nom.", profile: (p: string) => `Profil Hermes : ${p}. Fixé à la création de l'agent.` },
});

export default function AgentProfileScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const agent = useQuery(adminAgentsQuery).data?.find((a) => a.id === agentId);
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>{agent && <AgentProfile key={agent.id} agent={agent} />}</AdminGate>
    </>
  );
}

/** The agent's name and avatar. The Hermes profile itself does not change after creation. */
function AgentProfile({ agent }: { agent: AdminAgent }) {
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  // Only what was changed: the rest follows the agent when it's reloaded.
  const [draft, setDraft] = useState<{ name?: string; shape?: AdminAgent["avatarShape"]; color?: AdminAgent["avatarColor"] }>({});
  const name = draft.name ?? agent.name;
  const shape = draft.shape ?? agent.avatarShape;
  const color = draft.color ?? agent.avatarColor;
  const setName = (name: string) => setDraft((d) => ({ ...d, name }));
  const setShape = (shape: AdminAgent["avatarShape"]) => setDraft((d) => ({ ...d, shape }));
  const setColor = (color: AdminAgent["avatarColor"]) => setDraft((d) => ({ ...d, color }));
  const dirty = name.trim() !== agent.name || shape !== agent.avatarShape || color !== agent.avatarColor;

  const save = useMutation({
    mutationFn: () =>
      api(`/admin/agents/${encodeURIComponent(agent.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ name: name.trim(), avatarShape: shape, avatarColor: color }),
      }),
    // The name and avatar show up everywhere: list, threads, headers.
    onSuccess: async () => {
      await Promise.all(
        [adminAgentsQuery.queryKey, agentsQuery.queryKey, conversationsQuery.queryKey, ["conversation"]].map((queryKey) => qc.invalidateQueries({ queryKey })),
      );
      toast.success(c.saved);
      router.back();
    },
    onError: (e) => toast.failed(e),
  });

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? c.saving : c.save} disabled={!dirty || !name.trim() || save.isPending} variant="prominent" onPress={withTap(() => save.mutate())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <View className="items-center pt-2">
          <AgentAvatar agent={{ avatar: { shape, color } }} size={88} />
        </View>
        <TextField isRequired isInvalid={!name.trim()}>
          <Label>{t.name}</Label>
          <Input value={name} onChangeText={setName} maxLength={60} returnKeyType="done" />
          {name.trim() ? <Description>{t.profile(agent.hermesProfile)}</Description> : <FieldError>{t.nameRequired}</FieldError>}
        </TextField>
        <AvatarPicker shape={shape} color={color} onShapeChange={setShape} onColorChange={setColor} />
      </SettingsScroll>
    </>
  );
}
