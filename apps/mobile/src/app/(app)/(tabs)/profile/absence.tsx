import { ABSENCE_KINDS, type AbsenceKind } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { Button, Description, Input, Label, Radio, RadioGroup, Separator, Surface, TextField } from "heroui-native";
import { Fragment, useState } from "react";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { confirmAction } from "@/components/confirm-action";
import { absenceMessages } from "@/components/profile/absences";
import { DayPicker } from "@/components/profile/native-pickers";
import { ControlRow, Section, useFeedback } from "@/components/profile/settings";
import { useMe } from "@/components/server-scope";
import { api } from "@/lib/api";
import { fromDay, scheduleSettingsQuery, toDay, type ScheduleSettings } from "@/lib/availability";
import { tr } from "@/lib/i18n";
import { presenceQuery } from "@/lib/presence";
import { CheckIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";

/* apps/web/src/components/AvailabilityEditor.tsx AbsenceForm, plus editing and deleting an existing absence. */

export default function AbsenceScreen() {
  const me = useMe();
  // `userId`: someone else's absence, when an admin edits it (Administration › Users › Availability).
  const params = useLocalSearchParams<{ id?: string; userId?: string }>();
  const id = params.id;
  const userId = params.userId ?? me.id;
  const { data } = useQuery(scheduleSettingsQuery(userId));
  const existing = id ? data?.absences.find((a) => a.id === id) : undefined;
  // An absence to edit waits for the settings; a new one can start right away.
  if (id && !existing) return <Stack.Screen.Title>{absenceMessages.editAbsence}</Stack.Screen.Title>;
  return <AbsenceForm key={existing?.id ?? "new"} userId={userId} existing={existing} />;
}

function AbsenceForm({ userId, existing }: { userId: string; existing?: ScheduleSettings["absences"][number] }) {
  const t = { ...absenceMessages, ...tr(common) };
  const qc = useQueryClient();
  const feedback = useFeedback();
  const today = fromDay(toDay(new Date()));
  const [kind, setKind] = useState<AbsenceKind>(existing?.kind ?? "vacation");
  const [start, setStart] = useState(existing ? fromDay(existing.startOn) : today);
  const [end, setEnd] = useState(existing ? fromDay(existing.endOn) : today);
  const [note, setNote] = useState(existing?.note ?? "");
  const path = `/availability/${encodeURIComponent(userId)}/absences`;

  const done = async () => {
    qc.invalidateQueries({ queryKey: presenceQuery.queryKey });
    await qc.invalidateQueries({ queryKey: scheduleSettingsQuery(userId).queryKey });
    router.back();
  };
  const save = useMutation({
    // No update route: the new version is created first, then the old one deleted, so a failure keeps the old one.
    mutationFn: async () => {
      await api(path, { method: "POST", body: JSON.stringify({ kind, startOn: toDay(start), endOn: toDay(end), note: note.trim() }) });
      if (existing) await api(`${path}/${encodeURIComponent(existing.id)}`, { method: "DELETE" });
    },
    onSuccess: () => {
      feedback.saved();
      return done();
    },
    onError: feedback.failed,
  });
  const remove = useMutation({
    mutationFn: () => api(`${path}/${encodeURIComponent(existing!.id)}`, { method: "DELETE" }),
    onSuccess: () => {
      feedback.saved(t.removed);
      return done();
    },
    onError: feedback.failed,
  });

  return (
    <>
      <Stack.Screen.Title>{existing ? t.editAbsence : t.addAbsence}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.check} iconRenderingMode="template" accessibilityLabel={save.isPending ? t.saving : existing ? t.save : t.add} disabled={save.isPending || remove.isPending} variant="prominent" onPress={withTap(() => save.mutate())} />
      </Stack.Toolbar>
      <KeyboardAwareScrollView bottomOffset={24}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="interactive"
        keyboardShouldPersistTaps="handled"
        className="bg-background"
        contentContainerClassName="gap-8 px-4 pb-12 pt-4"
      >
        {/* A few exclusive choices: a HeroUI RadioGroup in a Surface, as its "basic" example. */}
        <Section header={t.kind} bare>
          <Surface>
            <RadioGroup
              value={kind}
              onValueChange={(v) => {
                Haptics.selectionAsync();
                setKind(v as AbsenceKind);
              }}
            >
              {ABSENCE_KINDS.map((k, i) => (
                <Fragment key={k}>
                  {i > 0 && <Separator className="my-1" />}
                  <RadioGroup.Item value={k}>
                    <Label className="flex-1">{t.kinds[k]}</Label>
                    <Radio />
                  </RadioGroup.Item>
                </Fragment>
              ))}
            </RadioGroup>
          </Surface>
        </Section>

        <Section footer={t.pickDates}>
          <ControlRow title={t.firstDay}>
            <DayPicker
              label={t.firstDay}
              value={start}
              from={today}
              onChange={(d) => {
                setStart(d);
                if (d > end) setEnd(d);
              }}
            />
          </ControlRow>
          <ControlRow title={t.lastDay}>
            <DayPicker key={toDay(start)} label={t.lastDay} value={end < start ? start : end} from={start} onChange={setEnd} />
          </ControlRow>
        </Section>

        <TextField>
          <Label>{t.note}</Label>
          <Input value={note} onChangeText={setNote} maxLength={200} />
          <Description>{t.noteHelp}</Description>
        </TextField>

        {existing && (
          <Button
            variant="danger-soft"
            size="lg"
            isDisabled={remove.isPending}
            onPress={withTap(async () => (await confirmAction({ title: t.removeTitle, description: t.removeBody, action: t.remove })) && remove.mutate())}
          >
            {t.remove}
          </Button>
        )}
      </KeyboardAwareScrollView>
    </>
  );
}
