import { modelName } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, FieldError, Input } from "heroui-native";
import { useState } from "react";
import { AdminGate, ErrorAlert, FieldRow, Intro, LoadingRows, Section, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { providerName } from "@/components/profile/usage-format";
import { PRICE_FIELDS, pricesMessages, pricesQuery, type ModelPriceRow, type Price } from "@/components/profile/usage-prices";
import { api } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* PriceRow of apps/web/src/components/Usage.tsx (admin): one model's prices, as a form sheet. */

export default function UsagePrice() {
  const { provider, model } = useLocalSearchParams<{ provider: string; model: string }>();
  const { data, error } = useQuery(pricesQuery);
  const matches = data?.filter((r) => r.provider === provider && r.model === model) ?? [];
  const row = matches.find((r) => r.source === "admin") ?? matches[0];
  return (
    <>
      <Stack.Screen options={{ title: model ? modelName(model) : "" }} />
      <AdminGate>
        {row ? (
          <PriceForm key={`${row.provider}::${row.model}::${row.source}`} row={row} />
        ) : (
          <SettingsScroll>{error ? <ErrorAlert error={error} /> : <LoadingRows avatar={false} rows={4} />}</SettingsScroll>
        )}
      </AdminGate>
    </>
  );
}

function PriceForm({ row }: { row: ModelPriceRow }) {
  const t = pricesMessages;
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const initial = Object.fromEntries(PRICE_FIELDS.map((k) => [k, row.price ? String(row.price[k]) : ""])) as Record<(typeof PRICE_FIELDS)[number], string>;
  const [draft, setDraft] = useState(initial);
  const dirty = PRICE_FIELDS.some((k) => draft[k] !== initial[k]);
  const parsed = Object.fromEntries(PRICE_FIELDS.map((k) => [k, Number(draft[k].replace(",", ".") || "0")])) as Price;
  const invalid = (k: (typeof PRICE_FIELDS)[number]) => !Number.isFinite(parsed[k]) || parsed[k] < 0;
  const valid = PRICE_FIELDS.every((k) => !invalid(k));

  const done = async () => {
    await qc.invalidateQueries({ queryKey: ["usage"] });
    router.back();
  };
  const save = useMutation({
    mutationFn: () => api("/usage/prices", { method: "PUT", body: JSON.stringify({ provider: row.provider, model: row.model, ...parsed }) }),
    // Toasts show once the sheet is closed; a failure stays inline, in the sheet.
    onSuccess: () => {
      toast.success();
      return done();
    },
  });
  const reset = useMutation({
    mutationFn: () => api(`/usage/prices?${new URLSearchParams({ provider: row.provider, model: row.model })}`, { method: "DELETE" }),
    onSuccess: () => {
      toast.success(t.resetDone);
      return done();
    },
  });
  const error = save.error ?? reset.error;

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? t.saving : t.save} disabled={!dirty || !valid || save.isPending} variant="prominent" onPress={withTap(() => save.mutate())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{`${providerName(row.provider)}, ${t.priceSource[row.source].toLowerCase()}\n${t.pricesIntro}`}</Intro>
        <Section footer={row.source === "engine" ? t.engineNote : undefined}>
          {PRICE_FIELDS.map((k) => (
            <FieldRow key={k} label={t[k]} invalid={invalid(k)}>
              <Input
                variant="secondary"
                value={draft[k]}
                onChangeText={(v) => setDraft((d) => ({ ...d, [k]: v }))}
                placeholder={row.catalogue ? String(row.catalogue[k]) : "0"}
                keyboardType="decimal-pad"
              />
            </FieldRow>
          ))}
        </Section>
        <FieldError isInvalid={!!error}>{error?.message}</FieldError>
        {row.source === "admin" && !dirty && (
          <Button
            variant="danger-soft"
            size="lg"
            isDisabled={reset.isPending}
            onPress={withTap(async () => (await confirmAction({ title: t.resetTitle(row.model), description: t.resetBody, action: t.reset })) && reset.mutate())}
          >
            {t.reset}
          </Button>
        )}
      </SettingsScroll>
    </>
  );
}
