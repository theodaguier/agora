import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Description, Input, Label, ListGroup, Separator, TextField } from "heroui-native";
import { Fragment, useState } from "react";
import { ModelList } from "@/components/agents-admin/model-list";
import { AdminGate, ErrorAlert, Intro, LoadingRows, SearchBox, Section, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { providersMessages as t, refreshProviders } from "@/components/admin/providers";
import { headerIcon } from "@/components/header-button";
import { CheckIcon } from "@/components/icons";
import { api } from "@/lib/api";
import { providersQuery, type AiProviders } from "@/lib/admin";
import { haptic, withTap } from "@/lib/haptics";

/* ModelDialog of apps/web/src/components/admin/Providers.tsx */

export default function DefaultModelScreen() {
  const { provider } = useLocalSearchParams<{ provider?: string }>();
  const { data, error } = useQuery(providersQuery);
  return (
    <>
      <Stack.Screen.Title>{t.defaultModel}</Stack.Screen.Title>
      <AdminGate>
        {data ? (
          <DefaultModelForm data={data} initial={provider} />
        ) : (
          <SettingsScroll>
            <ErrorAlert error={error} />
            {!error && <LoadingRows rows={4} avatar={false} />}
          </SettingsScroll>
        )}
      </AdminGate>
    </>
  );
}

function DefaultModelForm({ data, initial }: { data: AiProviders; initial?: string }) {
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const connected = data.providers.filter((p) => p.configured);
  const [slug, setSlug] = useState(() => connected.find((p) => p.slug === (initial ?? data.current.provider))?.slug ?? connected[0]?.slug ?? "");
  const models = connected.find((p) => p.slug === slug)?.models ?? [];
  const [model, setModel] = useState(() => (models.includes(data.current.model) ? data.current.model : (models[0] ?? "")));
  const [q, setQ] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const apply = useMutation({
    mutationFn: async () => {
      const { switched } = await api<{ switched: number }>("/admin/hermes/providers/default", {
        method: "PUT",
        body: JSON.stringify({ slug, model, ...(baseUrl.trim() ? { baseUrl: baseUrl.trim() } : {}) }),
      });
      const { reply } = await api<{ reply: string }>("/admin/hermes/providers/test", { method: "POST" });
      return { switched, reply };
    },
    onSuccess: ({ switched, reply }) => {
      toast.success(t.replies(reply), switched > 0 ? t.switched(switched) : undefined);
      router.back();
    },
    onError: (e) => toast.failed(e),
    onSettled: () => refreshProviders(qc),
  });

  const pickProvider = (next: string) => {
    haptic.select();
    setSlug(next);
    setModel(connected.find((p) => p.slug === next)?.models[0] ?? "");
    setQ("");
  };
  const shown = models.filter((m) => m.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={apply.isPending ? t.testing : t.useAndTest}
          disabled={!slug || !model || apply.isPending}
          variant="prominent"
          onPress={withTap(() => apply.mutate())}
        />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{apply.isPending ? t.testing : t.modelText}</Intro>
        <Section bare title={t.provider}>
          <ListGroup accessibilityRole="radiogroup">
            {connected.map((p, i) => (
              <Fragment key={p.slug}>
                {i > 0 && <Separator className="mx-4" />}
                <ListGroup.Item
                  disabled={apply.isPending}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: p.slug === slug }}
                  onPress={() => p.slug !== slug && pickProvider(p.slug)}
                >
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle numberOfLines={1}>{p.name}</ListGroup.ItemTitle>
                  </ListGroup.ItemContent>
                  <ListGroup.ItemSuffix>{p.slug === slug ? <CheckIcon className="size-5 text-accent" /> : null}</ListGroup.ItemSuffix>
                </ListGroup.Item>
              </Fragment>
            ))}
          </ListGroup>
        </Section>
        <Section bare title={t.model}>
          {models.length > 8 && <SearchBox value={q} onChange={setQ} placeholder={t.searchModel} />}
          <ModelList models={shown.map((id) => ({ id, reasoning: false }))} value={model} onChange={setModel} disabled={apply.isPending} />
        </Section>
        <TextField isDisabled={apply.isPending}>
          <Label>{t.baseUrl}</Label>
          <Input value={baseUrl} onChangeText={setBaseUrl} placeholder="https://…/v1" autoCapitalize="none" autoCorrect={false} keyboardType="url" />
          <Description>{t.baseUrlHelp}</Description>
        </TextField>
      </SettingsScroll>
    </>
  );
}
