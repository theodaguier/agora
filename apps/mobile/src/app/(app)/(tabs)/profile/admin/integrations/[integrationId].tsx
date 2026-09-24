import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Description, Input, Label, LinkButton, TextField, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import {
  applyIntegrations,
  integrationsMessages as t,
  integrationsQuery,
  SPECS,
  useDisconnect,
  type AppIntegration,
  type FieldSpec,
  type IntegrationId,
} from "@/components/admin/integrations";
import { AdminGate, ErrorAlert, LoadingRows, SecretInput, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* IntegrationDialog of apps/web/src/components/admin/AppIntegrations.tsx, as a form sheet. */

export default function IntegrationSheet() {
  const { integrationId } = useLocalSearchParams<{ integrationId: string }>();
  const { data, error } = useQuery(integrationsQuery);
  const integration = data?.find((i) => i.id === integrationId);
  const spec = integrationId in SPECS ? SPECS[integrationId as IntegrationId] : undefined;
  return (
    <>
      <Stack.Screen options={{ title: spec ? t.dialogTitle(spec.name) : "" }} />
      <AdminGate>
        {integration ? (
          <IntegrationForm key={integration.id} integration={integration} />
        ) : error ? (
          <SettingsScroll>
            <ErrorAlert error={error} />
          </SettingsScroll>
        ) : (
          <SettingsScroll>
            <LoadingRows rows={2} avatar={false} />
          </SettingsScroll>
        )}
      </AdminGate>
    </>
  );
}

function IntegrationForm({ integration }: { integration: AppIntegration }) {
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const spec = SPECS[integration.id];
  // Secrets start empty (only their preview is known); the other values are prefilled.
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(spec.fields.map((f) => [f.name, f.secret ? "" : (integration.values[f.name] ?? "")])),
  );
  const toast = useAdminToast();
  const save = useMutation({
    mutationFn: () => api<AppIntegration[]>(`/admin/integrations/${integration.id}`, { method: "PUT", body: JSON.stringify(values) }),
    onSuccess: (list) => {
      applyIntegrations(qc, list);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.success(t.connectedTo(spec.name));
      router.back();
    },
    onError: (e) => toast.failed(e),
  });
  const { ask, remove } = useDisconnect(() => router.back());
  // A secret already set can stay empty: the server keeps it.
  const required = (f: FieldSpec) => !(f.secret && integration.values[f.name]);
  const valid = spec.fields.every((f) => !required(f) || values[f.name]?.trim());
  const submit = () => valid && !save.isPending && save.mutate();

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? t.checking : c.save} disabled={!valid || save.isPending} variant="prominent" onPress={withTap(submit)} />
      </Stack.Toolbar>
      <SettingsScroll>
        <View className="items-start gap-1 px-4">
          <Typography.Paragraph type="body-sm" color="muted">
            {t.dialogText}
          </Typography.Paragraph>
          <LinkButton size="sm" accessibilityRole="link" onPress={withTap(() => Linking.openURL(spec.docs))}>
            {t.getKey(spec.name)}
          </LinkButton>
        </View>

        {spec.fields.map((f, n) => {
          const preview = f.secret ? integration.values[f.name] : undefined;
          const last = n === spec.fields.length - 1;
          const props = {
            value: values[f.name] ?? "",
            onChangeText: (v: string) => setValues((xs) => ({ ...xs, [f.name]: v })),
            placeholder: f.placeholder,
            autoFocus: n === 0,
            autoCapitalize: "none" as const,
            autoCorrect: false,
            spellCheck: false,
            returnKeyType: last ? ("done" as const) : ("next" as const),
            onSubmitEditing: last ? submit : undefined,
          };
          return (
            <TextField key={f.name} isRequired={required(f)}>
              <Label>{t.fields[f.name]!}</Label>
              {f.secret ? <SecretInput {...props} showLabel={t.show} hideLabel={t.hide} /> : <Input {...props} />}
              <Description>{preview ? t.keep(preview) : t.help[f.name]}</Description>
            </TextField>
          );
        })}

        {integration.source === "app" && (
          <Button variant="danger-soft" size="lg" isDisabled={remove.isPending || save.isPending} onPress={withTap(() => ask(integration.id))}>
            {t.disconnect}
          </Button>
        )}
      </SettingsScroll>
    </>
  );
}
