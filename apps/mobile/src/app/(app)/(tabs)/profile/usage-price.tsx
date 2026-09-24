import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Button, Description, FieldError, Input, Label, Spinner, TextField, Typography } from "heroui-native";
import { useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { AdminGate } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { useFeedback } from "@/components/profile/settings";
import { providerName } from "@/components/profile/usage-format";
import { PRICE_FIELDS, pricesMessages, pricesQuery, type ModelPriceRow, type Price } from "@/components/profile/usage-prices";
import { api } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { CheckIcon, CloseIcon } from "@/components/icons";
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
      <Stack.Screen options={{ title: model ?? "" }} />
      <AdminGate>
        {row ? (
          <PriceForm key={`${row.provider}::${row.model}::${row.source}`} row={row} />
        ) : error ? (
          <Alert status="danger" className="m-4">
            <Alert.Indicator />
            <Alert.Content>
              <Alert.Title>{error.message}</Alert.Title>
            </Alert.Content>
          </Alert>
        ) : (
          <Spinner className="mt-24 self-center" />
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
  const feedback = useFeedback();
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
      feedback.saved();
      return done();
    },
  });
  const reset = useMutation({
    mutationFn: () => api(`/usage/prices?${new URLSearchParams({ provider: row.provider, model: row.model })}`, { method: "DELETE" }),
    onSuccess: () => {
      feedback.saved(t.resetDone);
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
      <KeyboardAwareScrollView bottomOffset={24}
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        className="bg-background"
        contentContainerClassName="gap-6 p-4 pb-12"
      >
        <Typography.Paragraph type="body-sm" color="muted" className="px-4">
          {`${providerName(row.provider)} · ${t.priceSource[row.source]}`}
          {"\n"}
          {t.pricesIntro}
        </Typography.Paragraph>
        {PRICE_FIELDS.map((k) => (
          <TextField key={k} isInvalid={invalid(k)}>
            <Label>{t[k]}</Label>
            <Input
              value={draft[k]}
              onChangeText={(v) => setDraft((d) => ({ ...d, [k]: v }))}
              placeholder={row.catalogue ? String(row.catalogue[k]) : "0"}
              keyboardType="decimal-pad"
            />
          </TextField>
        ))}
        {row.source === "engine" && <Description className="px-4">{t.engineNote}</Description>}
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
      </KeyboardAwareScrollView>
    </>
  );
}
