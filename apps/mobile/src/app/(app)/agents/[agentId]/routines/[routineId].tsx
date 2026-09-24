import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Chip, Description, Input, Label, ListGroup, Radio, RadioGroup, Separator, SkeletonGroup, Surface, TextField, Typography, useToast } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { Section } from "@/components/people/section";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { refreshRoutines, routinePath } from "@/lib/profile";
import { routinesQuery, type Routine } from "@/lib/queries";
import { parseFrequency, scheduleOf, weekdays, type Frequency } from "@/lib/routines";
import { OptionPicker } from "@/components/menus";
import { CheckIcon, CloseIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { haptic, withTap } from "@/lib/haptics";

/* RoutineDialog of apps/web/src/components/RoutineDialog.tsx, as a sheet. */

const messages = defineMessages({
  en: {
    editRoutine: "Edit routine",
    name: "Name",
    frequency: "Frequency",
    modes: { daily: "Every day", weekdays: "Weekdays", weekly: "Some days", custom: "Custom" } as Record<Frequency["mode"], string>,
    time: "Time",
    hour: "Hour",
    minute: "Minutes",
    days: "Days",
    expr: "Schedule",
    exprHint: "Cron expression (0 9 * * *) or Hermes syntax: every 2h, every monday 9am…",
    failed: "Couldn't save the routine.",
    gone: "This routine no longer exists.",
    saved: "Routine saved",
  },
  fr: {
    editRoutine: "Modifier la routine",
    name: "Nom",
    frequency: "Fréquence",
    modes: { daily: "Tous les jours", weekdays: "En semaine", weekly: "Certains jours", custom: "Personnalisée" },
    time: "Heure",
    hour: "Heure",
    minute: "Minutes",
    days: "Jours",
    expr: "Planification",
    exprHint: "Expression cron (0 9 * * *) ou syntaxe Hermes : every 2h, every monday 9am…",
    failed: "Enregistrement impossible.",
    gone: "Cette routine n'existe plus.",
    saved: "Routine enregistrée",
  },
});

export default function RoutineSheet() {
  const { routineId, conversationId } = useLocalSearchParams<{ agentId: string; routineId: string; conversationId: string }>();
  const { data: routines, isPending } = useQuery(routinesQuery(conversationId));
  const routine = routines?.find((r) => r.id === routineId);
  return (
    <>
      <Stack.Screen options={{ title: messages.editRoutine }} />
      {routine ? (
        <RoutineForm conversationId={conversationId} routine={routine} />
      ) : isPending ? (
        <SkeletonGroup isLoading isSkeletonOnly className="gap-3 p-4">
          <SkeletonGroup.Item className="h-4 w-16 rounded-md" />
          <SkeletonGroup.Item className="h-12 w-full rounded-2xl" />
          <SkeletonGroup.Item className="mt-3 h-4 w-24 rounded-md" />
          <SkeletonGroup.Item className="h-48 w-full rounded-2xl" />
        </SkeletonGroup>
      ) : (
        <View className="items-center gap-4 px-6 py-12">
          <Typography color="muted" align="center">
            {messages.gone}
          </Typography>
          <Button variant="secondary" onPress={withTap(() => router.back())}>
            {tr(common).close}
          </Button>
        </View>
      )}
    </>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Hours or minutes of the time: a HeroUI Select of `count` values. */
function TimePart({ label, value, count, onChange }: { label: string; value: number; count: number; onChange: (value: number) => void }) {
  const options = Array.from({ length: count }, (_, i) => ({ value: String(i), label: pad(i) }));
  return (
    <OptionPicker value={String(value)} options={options} label={label} onChange={(v) => onChange(Number(v))} />
  );
}

function RoutineForm({ conversationId, routine }: { conversationId: string; routine: Routine }) {
  const qc = useQueryClient();
  const t = messages;
  const c = tr(common);
  const { toast } = useToast();
  const initial = parseFrequency(routine);
  // The name as typed; untouched, it follows the routine.
  const [typedName, setName] = useState<string | null>(null);
  const name = typedName ?? routine.name;
  const [mode, setMode] = useState<Frequency["mode"]>(initial.mode);
  const [time, setTime] = useState(initial.mode === "custom" ? "09:00" : initial.time);
  const [days, setDays] = useState<number[]>(initial.mode === "weekly" ? initial.days : [1]);
  const chosenDays = new Set(days);
  const [expr, setExpr] = useState(initial.mode === "custom" ? initial.expr : "");
  const [hour, minute] = time.split(":").map(Number) as [number, number];

  const frequency: Frequency = mode === "custom" ? { mode, expr } : mode === "weekly" ? { mode, time, days } : { mode, time };
  const schedule = scheduleOf(frequency);
  const original = scheduleOf(initial);
  const valid = !!name.trim() && (mode !== "custom" || !!expr.trim());

  const save = useMutation({
    mutationFn: (body: { name?: string; schedule?: string }) =>
      api<Routine>(routinePath(conversationId, routine.id), { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: async () => {
      await refreshRoutines(qc, conversationId);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast.show({ variant: "success", label: t.saved });
      router.back();
    },
    onError: (error) => toast.show({ variant: "danger", label: error.message || t.failed }),
  });

  const submit = () => {
    if (!valid || save.isPending) return;
    const next = name.trim();
    save.mutate({ ...(next !== routine.name && { name: next }), ...(schedule !== original && { schedule }) });
  };

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={c.save} disabled={!valid || save.isPending} variant="prominent" onPress={withTap(submit)} />
      </Stack.Toolbar>
      <KeyboardAwareScrollView bottomOffset={24} contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="interactive" keyboardShouldPersistTaps="handled" className="bg-background" contentContainerClassName="gap-6 p-4 pb-12">
        <TextField isRequired>
          <Label>{t.name}</Label>
          <Input value={name} onChangeText={setName} maxLength={120} autoFocus returnKeyType="done" onSubmitEditing={submit} />
        </TextField>

        {/* One frequency among four: a HeroUI RadioGroup, as its example (Surface, items, Separators). */}
        <View className="gap-2">
          <Label>{t.frequency}</Label>
          <Surface>
            <RadioGroup value={mode} onValueChange={(v) => (haptic.select(), setMode(v as Frequency["mode"]))}>
              {(["daily", "weekdays", "weekly", "custom"] as const).map((m, i) => (
                <View key={m}>
                  {i > 0 && <Separator className="my-1" />}
                  <RadioGroup.Item value={m}>
                    <View className="flex-1">
                      <Label>{t.modes[m]}</Label>
                    </View>
                    <Radio />
                  </RadioGroup.Item>
                </View>
              ))}
            </RadioGroup>
          </Surface>
        </View>

        {mode === "weekly" && (
          <View className="gap-2">
            <Label isRequired>{t.days}</Label>
            <View className="flex-row flex-wrap gap-2">
              {weekdays("short").map((d) => {
                const on = chosenDays.has(d.value);
                return (
                  <Chip
                    key={d.value}
                    size="lg"
                    variant={on ? "primary" : "secondary"}
                    color={on ? "accent" : "default"}
                    accessibilityState={{ selected: on }}
                    // At least one day stays selected.
                    onPress={withTap(() => setDays((xs) => (on ? (xs.length > 1 ? xs.filter((x) => x !== d.value) : xs) : [...xs, d.value])))}
                  >
                    <Chip.Label>{d.label.charAt(0).toUpperCase() + d.label.slice(1)}</Chip.Label>
                  </Chip>
                );
              })}
            </View>
          </View>
        )}

        {mode === "custom" ? (
          <TextField isRequired>
            <Label>{t.expr}</Label>
            <Input value={expr} onChangeText={setExpr} maxLength={120} autoCapitalize="none" autoCorrect={false} />
            <Description>{t.exprHint}</Description>
          </TextField>
        ) : (
          <Section>
            <ListGroup.Item disabled>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t.time}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix className="flex-row items-center gap-1">
                <TimePart label={t.hour} value={hour} count={24} onChange={(h) => setTime(`${pad(h)}:${pad(minute)}`)} />
                <Typography weight="semibold">:</Typography>
                <TimePart label={t.minute} value={minute} count={60} onChange={(m) => setTime(`${pad(hour)}:${pad(m)}`)} />
              </ListGroup.ItemSuffix>
            </ListGroup.Item>
          </Section>
        )}

      </KeyboardAwareScrollView>
    </>
  );
}
