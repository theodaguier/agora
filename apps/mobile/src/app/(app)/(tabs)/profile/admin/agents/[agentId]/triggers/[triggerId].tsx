import { agentTriggers, common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button } from "heroui-native";
import { useState } from "react";
import { AdminGate, ErrorAlert, FormField, FormInput, FormTextArea, Intro, LoadingRows, Section, SettingsRow, SettingsScroll, SwitchRow, useAdminToast } from "@/components/admin/ui";
import { headerIcon } from "@/components/header-button";
import { agentTriggersQuery } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { haptic, withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import type { BotWebhook } from "@agora/core";

/* WebhookForm and the « created » dialog of apps/web/src/components/admin/AgentWebhooks.tsx, as a pushed screen. */

export default function AgentTriggerScreen() {
  const { agentId, triggerId } = useLocalSearchParams<{ agentId: string; triggerId: string }>();
  const isNew = triggerId === "new";
  const { data, error } = useQuery({ ...agentTriggersQuery(agentId), enabled: !isNew });
  const hook = isNew ? null : data?.find((x) => x.id === triggerId);
  return (
    <AdminGate>
      {isNew || hook ? (
        <TriggerForm key={hook?.id ?? "new"} agentId={agentId} hook={hook ?? null} />
      ) : (
        <SettingsScroll>{error ? <ErrorAlert error={error} /> : <LoadingRows rows={3} avatar={false} />}</SettingsScroll>
      )}
    </AdminGate>
  );
}

function TriggerForm({ agentId, hook }: { agentId: string; hook: BotWebhook | null }) {
  const t = tr(agentTriggers);
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const [name, setName] = useState(hook?.name ?? "");
  const [instructions, setInstructions] = useState(hook?.instructions ?? "");
  const [dedupeField, setDedupeField] = useState(hook?.dedupeField ?? "");
  const [autoMerge, setAutoMerge] = useState(hook?.autoMerge ?? false);
  /** Address of the trigger just created: shown this once, in place of the form. */
  const [created, setCreated] = useState<string | null>(null);
  const path = `/agents/${agentId}/webhooks`;
  const save = useMutation({
    mutationFn: () => {
      const body = JSON.stringify({ name: name.trim(), instructions: instructions.trim(), dedupeField: dedupeField.trim(), autoMerge });
      return hook ? api(`${path}/${hook.id}`, { method: "PATCH", body }).then(() => undefined) : api<{ url: string }>(path, { method: "POST", body }).then((r) => r.url);
    },
    onSuccess: async (url) => {
      await qc.invalidateQueries({ queryKey: agentTriggersQuery(agentId).queryKey });
      if (url) {
        haptic.success();
        setCreated(url);
      } else {
        toast.success(c.saved);
        router.back();
      }
    },
    onError: (e) => toast.failed(e),
  });
  const valid = !!name.trim() && !!instructions.trim();
  const dirty = !hook || name !== hook.name || instructions !== hook.instructions || dedupeField !== (hook.dedupeField ?? "") || autoMerge !== hook.autoMerge;

  if (created)
    return (
      <>
        <Stack.Screen.Title>{t.createdTitle}</Stack.Screen.Title>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={t.done} variant="prominent" onPress={withTap(() => router.back())} />
        </Stack.Toolbar>
        <SettingsScroll>
          <Intro>{t.createdBody}</Intro>
          <Section>
            <SettingsRow label={t.address} hint={created}>
              <Button
                size="sm"
                variant="secondary"
                onPress={withTap(async () => {
                  await Clipboard.setStringAsync(created);
                  haptic.success();
                  toast.info(c.copied);
                })}
              >
                {t.copy}
              </Button>
            </SettingsRow>
          </Section>
        </SettingsScroll>
      </>
    );

  return (
    <>
      <Stack.Screen.Title>{hook ? t.editTitle : t.add}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={save.isPending ? c.saving : c.save}
          disabled={!valid || !dirty || save.isPending}
          variant="prominent"
          onPress={withTap(() => save.mutate())}
        />
      </Stack.Toolbar>
      <SettingsScroll>
        {!hook && <Intro>{t.intro}</Intro>}
        <FormField label={t.name} required>
          <FormInput value={name} onChangeText={setName} maxLength={120} placeholder={t.namePlaceholder} returnKeyType="next" />
        </FormField>
        <FormField label={t.instructions} required>
          <FormTextArea value={instructions} onChangeText={setInstructions} maxLength={4000} placeholder={t.instructionsPlaceholder} scrollEnabled={false} />
        </FormField>
        <FormField label={t.field} help={t.fieldHelp}>
          <FormInput value={dedupeField} onChangeText={setDedupeField} maxLength={200} placeholder={t.fieldPlaceholder} autoCapitalize="none" autoCorrect={false} spellCheck={false} />
        </FormField>
        <Section footer={t.autoMergeHelp}>
          <SwitchRow title={t.autoMerge} value={autoMerge} onChange={setAutoMerge} />
        </Section>
        {hook && <Intro>{t.runsAs(hook.owner)}</Intro>}
      </SettingsScroll>
    </>
  );
}
