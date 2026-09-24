import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ControlField, Description, FieldError, Input, Label, LinkButton, ListGroup, TextField, Typography } from "heroui-native";
import { View } from "react-native";
import { useState } from "react";
import { AgentAvatar } from "@/components/agent-avatar";
import { AdminGate, SettingsScroll, Intro, LoadingRows, SecretInput, Section, useAdminToast } from "@/components/admin/ui";
import { adminAgentsQuery, isDefaultProfile, type AdminAgent } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { flagRestart } from "@/lib/marketplace";
import { VAULT_KEY, vaultQuery, type Secret } from "@/lib/memory";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { haptic, withTap } from "@/lib/haptics";

/* SecretDialog of apps/web/src/components/admin/Vault.tsx, as a form sheet. */

const t = defineMessages({
  en: {
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
  },
  fr: {
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
  },
});

export default function SecretScreen() {
  const { key } = useLocalSearchParams<{ key?: string }>();
  const secrets = useQuery(vaultQuery);
  const agents = useQuery(adminAgentsQuery);
  const secret = key ? secrets.data?.find((s) => s.key === key) : undefined;
  return (
    <>
      <Stack.Screen options={{ title: key ? t.editTitle(key) : t.newTitle }} />
      <AdminGate>
        {secrets.data && agents.data && (!key || secret) ? (
          <SecretForm secret={secret} taken={(k) => secrets.data.some((s) => s.key === k)} agents={agents.data} />
        ) : (
          <SettingsScroll>
            <LoadingRows rows={3} avatar={false} />
          </SettingsScroll>
        )}
      </AdminGate>
    </>
  );
}

function SecretForm({ secret, taken, agents }: { secret?: Secret; taken: (key: string) => boolean; agents: AdminAgent[] }) {
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const [key, setKey] = useState(secret?.key ?? "");
  const [value, setValue] = useState("");
  const [picked, setPicked] = useState(() => {
    const granted = new Set(secret?.agents);
    return agents.filter((a) => !isDefaultProfile(a) && (!secret || granted.has(a.id))).map((a) => a.id);
  });
  const save = useMutation({
    mutationFn: () =>
      api(`/admin/hermes/vault/${encodeURIComponent(key)}`, {
        method: "PUT",
        body: JSON.stringify({ ...(value && { value }), agentIds: picked }),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: vaultQuery.queryKey });
      toast.success(c.saved, key);
      flagRestart();
      router.back();
    },
    onError: (e) => toast.failed(e),
  });

  const others = agents.filter((a) => !isDefaultProfile(a));
  const pickedIds = new Set(picked);
  const everything = others.every((a) => pickedIds.has(a.id));
  const toggle = (id: string) => setPicked((xs) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id]));
  const nameError = key && !VAULT_KEY.test(key) ? t.nameInvalid : !secret && taken(key) ? t.nameTaken : null;
  const valid = !!key && !nameError && (secret ? true : !!value);

  /** A whole KEY=value line from a .env, pasted in the name, fills both fields. */
  const onName = (text: string) => {
    const line = text.trim().replace(/^export\s+/, "");
    const m = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(line);
    if (m) {
      setKey(m[1]!.toUpperCase());
      setValue(m[2]!.replace(/^(["'])(.*)\1$/, "$2"));
    } else setKey(text.toUpperCase());
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? c.saving : c.save} disabled={!valid || save.isPending} variant="prominent" onPress={withTap(() => save.mutate())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{t.dialogText}</Intro>
        {!secret && (
          <TextField isRequired isInvalid={!!nameError}>
            <Label>{t.name}</Label>
            <Input
              value={key}
              onChangeText={onName}
              autoFocus
              autoCapitalize="characters"
              autoCorrect={false}
              spellCheck={false}
            />
            {nameError ? <FieldError>{nameError}</FieldError> : <Description>{t.nameHelp}</Description>}
          </TextField>
        )}
        <TextField isRequired={!secret}>
          <Label>{secret ? t.newValue : t.value}</Label>
          <SecretInput value={value} onChangeText={setValue} autoFocus={!!secret} showLabel={t.show} hideLabel={t.hide} />
          {!!secret?.preview && <Description>{t.keepValue(secret.preview)}</Description>}
        </TextField>

        {agents.length > 0 && (
          <Section
            title={t.agents}
            footer={
              <View className="items-start gap-1 px-4">
                <Typography.Paragraph type="body-xs" color="muted">
                  {t.agentsHelp}
                </Typography.Paragraph>
                {others.length > 1 && (
                  <LinkButton size="sm" onPress={withTap(() => setPicked(everything ? [] : others.map((a) => a.id)))}>
                    {everything ? t.allOff : t.allOn}
                  </LinkButton>
                )}
              </View>
            }
          >
            {agents.map((a) => {
              const main = isDefaultProfile(a);
              const checked = main || pickedIds.has(a.id);
              return (
                <ControlField key={a.id} isSelected={checked} isDisabled={main} onSelectedChange={() => (haptic.select(), toggle(a.id))} className="flex-row items-center gap-3 px-4 py-3">
                  <AgentAvatar agent={{ avatar: { shape: a.avatarShape, color: a.avatarColor } }} size={28} />
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>{a.name}</ListGroup.ItemTitle>
                    {main && <ListGroup.ItemDescription>{t.main}</ListGroup.ItemDescription>}
                  </ListGroup.ItemContent>
                  <ControlField.Indicator variant="checkbox" />
                </ControlField>
              );
            })}
          </Section>
        )}
      </SettingsScroll>
    </>
  );
}
