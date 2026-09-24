import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Label, ListGroup, TextField, Typography } from "heroui-native";
import { useState } from "react";
import { AdminGate, ErrorAlert, Intro, LoadingRows, PressableRow, SearchBox, SecretInput, Section, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { defaultModelHref, providersMessages as t, refreshProviders } from "@/components/admin/providers";
import { headerIcon } from "@/components/header-button";
import { api } from "@/lib/api";
import { providersQuery, type AiProvider } from "@/lib/admin";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/* PickDialog and KeyDialog of apps/web/src/components/admin/Providers.tsx, as a form sheet. */

export default function ProviderKeyScreen() {
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const { data, error } = useQuery(providersQuery);
  const provider = slug ? data?.providers.find((p) => p.slug === slug && p.keyEnv) : undefined;
  return (
    <>
      <Stack.Screen options={{ title: provider ? t.keyTitle(provider.name) : t.pickTitle }} />
      <AdminGate>
        {!data ? (
          <SettingsScroll>
            <ErrorAlert error={error} />
            {!error && <LoadingRows rows={4} avatar={false} />}
          </SettingsScroll>
        ) : provider ? (
          // Nothing works yet without a default model: chain on to it.
          <KeyForm provider={provider} next={!data.providers.some((p) => p.configured && p.slug === data.current.provider)} />
        ) : (
          <PickList providers={data.providers.filter((p) => p.keyEnv && !p.configured)} />
        )}
      </AdminGate>
    </>
  );
}

function PickList({ providers }: { providers: AiProvider[] }) {
  const c = tr(common);
  const router = useRouter();
  const [q, setQ] = useState("");
  const list = providers.filter((p) => `${p.name} ${p.slug}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{t.pickText}</Intro>
        <SearchBox value={q} onChange={setQ} placeholder={t.search} />
        {list.length ? (
          <Section>
            {list.map((p) => (
              <PressableRow key={p.slug} onPress={() => router.setParams({ slug: p.slug })}>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{p.name}</ListGroup.ItemTitle>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix />
              </PressableRow>
            ))}
          </Section>
        ) : (
          <Typography.Paragraph type="body-sm" color="muted" className="px-4">
            {t.noMatch}
          </Typography.Paragraph>
        )}
      </SettingsScroll>
    </>
  );
}

function KeyForm({ provider, next }: { provider: AiProvider; next: boolean }) {
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const [value, setValue] = useState("");
  const valid = value.trim().length >= 8;
  const save = useMutation({
    mutationFn: () => api(`/admin/hermes/providers/${provider.slug}/key`, { method: "PUT", body: JSON.stringify({ apiKey: value.trim() }) }),
    onSuccess: async () => {
      await refreshProviders(qc);
      toast.success(t.keySaved, provider.name);
      if (next) router.replace(defaultModelHref(provider.slug));
      else router.back();
    },
    onError: (e) => toast.failed(e),
  });

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={save.isPending ? t.checking : c.save}
          disabled={!valid || save.isPending}
          variant="prominent"
          onPress={withTap(() => save.mutate())}
        />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{save.isPending ? t.checking : t.keyText}</Intro>
        <TextField isRequired isDisabled={save.isPending}>
          <Label>{t.apiKey(provider.keyEnv!)}</Label>
          <SecretInput value={value} onChangeText={setValue} autoFocus onSubmitEditing={() => valid && save.mutate()} />
        </TextField>
      </SettingsScroll>
    </>
  );
}

