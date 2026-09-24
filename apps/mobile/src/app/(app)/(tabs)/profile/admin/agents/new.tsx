import { soulTemplate } from "@agora/core";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack, useRouter } from "expo-router";
import { Button, Description, FieldError, Input, Label, TextArea, TextField, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { AvatarPicker } from "@/components/agents-admin/avatar-picker";
import { ModelList } from "@/components/agents-admin/model-list";
import { AdminGate, SettingsScroll, Section, useAdminToast } from "@/components/admin/ui";
import {
  adminAgentsQuery,
  agentHref,
  agentModelQuery,
  avatarColors,
  isDefaultProfile,
  orgQuery,
  PROFILE_PATTERN,
  type AdminAgent,
} from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { defineMessages } from "@/lib/i18n";
import { agentsQuery } from "@/lib/queries";
import type { AvatarShape } from "@/lib/types";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* The web's CreateAgent (apps/web/src/components/admin/Agents.tsx), with the model and personality set right away. */

const t = defineMessages({
  en: {
    newAgent: "New agent",
    agentName: "Agent name",
    profile: "Hermes profile",
    profilePattern: "lowercase letters, digits and hyphens",
    profilePlaceholder: "hermes-profile",
    profileHelp: "The Hermes profile is created from the default profile (model, tools, skills), then editable here.",
    creating: "Creating the Hermes profile…",
    configuring: "Applying the model and personality…",
    create: "Create agent",
    cancel: "Cancel",
    defaultModel: "Default model",
    personality: "Personality",
    soulIntro: "The agent's identity, role and tone (the SOUL.md file of its Hermes profile). Leave empty to keep the default profile's.",
    fromTemplate: "Start from the template",
  },
  fr: {
    newAgent: "Nouvel agent",
    agentName: "Nom de l'agent",
    profile: "Profil Hermes",
    profilePattern: "minuscules, chiffres et tirets",
    profilePlaceholder: "profil-hermes",
    profileHelp: "Le profil Hermes est créé à partir du profil par défaut (modèle, outils, skills), puis modifiable ici.",
    creating: "Création du profil Hermes…",
    configuring: "Application du modèle et de la personnalité…",
    create: "Créer l'agent",
    cancel: "Annuler",
    defaultModel: "Modèle par défaut",
    personality: "Personnalité",
    soulIntro: "Identité, rôle et ton de l'agent (fichier SOUL.md de son profil Hermes). Laisse vide pour garder celui du profil par défaut.",
    fromTemplate: "Partir du modèle",
  },
});

/** "Léa Martin" → "lea-martin": a profile name suggested from the agent's name until it's edited. */
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

export default function NewAgentScreen() {
  return (
    <>
      <Stack.Screen options={{ title: t.newAgent }} />
      <AdminGate>
        <CreateAgent />
      </AdminGate>
    </>
  );
}

function CreateAgent() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const { data: org } = useQuery(orgQuery);
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  // New profiles start from the default one: its model list is the one to pick from.
  const base = agents.find(isDefaultProfile) ?? agents[0];
  const models = useQuery({ ...agentModelQuery(base?.id ?? ""), enabled: !!base });

  const [name, setName] = useState("");
  const [profile, setProfile] = useState<string | null>(null);
  const [shape, setShape] = useState<AvatarShape>("bean");
  const [color, setColor] = useState(avatarColors[0]!);
  const [model, setModel] = useState<string | null>(null);
  const [soul, setSoul] = useState("");
  const [progress, setProgress] = useState<string | null>(null);

  const hermesProfile = profile ?? slug(name);
  const profileInvalid = !!hermesProfile && !PROFILE_PATTERN.test(hermesProfile);
  const valid = !!name.trim() && !!hermesProfile && !profileInvalid;

  const create = useMutation({
    mutationFn: async () => {
      setProgress(t.creating);
      const agent = await api<AdminAgent>("/admin/agents", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), hermesProfile, avatarShape: shape, avatarColor: color }),
      });
      setProgress(t.configuring);
      if (model && model !== models.data?.defaultModel) {
        await api(`/admin/hermes/agents/${agent.id}/model`, { method: "PUT", body: JSON.stringify({ model }) });
      }
      if (soul.trim()) await api(`/admin/hermes/agents/${agent.id}/soul`, { method: "PUT", body: JSON.stringify({ value: soul }) });
      return agent;
    },
    onSuccess: (agent) => {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      qc.invalidateQueries({ queryKey: adminAgentsQuery.queryKey });
      qc.invalidateQueries({ queryKey: agentsQuery.queryKey });
      router.back();
      router.push(agentHref(agent.id));
    },
    onError: (e) => toast.failed(e),
    onSettled: () => setProgress(null),
  });

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={t.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={t.create} disabled={!valid || create.isPending} variant="prominent" onPress={withTap(() => create.mutate())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <View className="items-center pt-2">
          <AgentAvatar agent={{ avatar: { shape, color } }} size={88} />
        </View>

        <View className="gap-4">
          <TextField isRequired>
            <Label>{t.agentName}</Label>
            <Input value={name} onChangeText={setName} maxLength={60} autoFocus returnKeyType="next" />
          </TextField>
          <TextField isRequired isInvalid={profileInvalid}>
            <Label>{t.profile}</Label>
            <Input
              value={hermesProfile}
              onChangeText={(v) => setProfile(v.toLowerCase())}
              placeholder={t.profilePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              spellCheck={false}
            />
            {profileInvalid ? <FieldError>{t.profilePattern}</FieldError> : <Description>{t.profileHelp}</Description>}
          </TextField>
        </View>

        <AvatarPicker shape={shape} color={color} onShapeChange={setShape} onColorChange={setColor} />

        {!!models.data?.models.length && (
          <Section title={t.defaultModel} bare>
            <ModelList models={models.data.models} value={model ?? models.data.defaultModel} onChange={setModel} />
          </Section>
        )}

        <TextField>
          <Label>{t.personality}</Label>
          <TextArea
            value={soul}
            onChangeText={setSoul}
            maxLength={20_000}
            autoCapitalize="none"
            autoCorrect={false}
            className="min-h-48"
          />
          <Description>{t.soulIntro}</Description>
        </TextField>
        {!soul.trim() && !!name.trim() && (
          <Button
            variant="secondary"
            size="sm"
            className="self-start"
            onPress={withTap(() => setSoul(soulTemplate({ name: name.trim(), org: org?.name ?? "Agora", locale: org?.locale ?? "fr" })))}
 >
            {t.fromTemplate}
          </Button>
        )}

        {!!progress && (
          <Typography.Paragraph type="body-sm" color="muted" align="center">
            {progress}
          </Typography.Paragraph>
        )}
      </SettingsScroll>
    </>
  );
}
