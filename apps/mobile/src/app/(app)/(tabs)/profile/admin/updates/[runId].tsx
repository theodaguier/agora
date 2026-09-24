import { useQuery } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { Accordion, Alert, ListGroup, Typography } from "heroui-native";
import { View } from "react-native";
import { AdminGate, ErrorAlert, LoadingRows, Section, SectionFooter, SettingsScroll } from "@/components/admin/ui";
import { RunStatusChip } from "@/components/admin/updates";
import { dateTime, stepText, updatesMessages } from "@/components/admin/updates-messages";
import { updatesQuery } from "@/lib/admin";
import { locale } from "@/lib/i18n";

/* apps/web/src/components/admin/Updates.tsx `RunRow` (collapsible), as a detail screen that follows the run live. */

export default function RunScreen() {
  const t = updatesMessages;
  const { runId } = useLocalSearchParams<{ runId: string }>();
  const { data, error, refetch } = useQuery({
    ...updatesQuery,
    refetchInterval: (q) => (q.state.data?.history?.find((r) => r.id === runId)?.status === "running" ? 2000 : false),
  });
  const run = data?.history?.find((r) => r.id === runId);
  const failed = run?.contract?.checks.filter((c) => !c.ok) ?? [];
  const time = dateTime();

  return (
    <>
      <Stack.Screen.Title>{run ? `${run.target === "hermes" ? "Hermes" : "Agora"} ${run.to}` : t.history}</Stack.Screen.Title>
      <AdminGate>
        <SettingsScroll onRefresh={refetch}>
          {!run ? (
            error ? (
              <ErrorAlert error={error} />
            ) : (
              <LoadingRows rows={3} avatar={false} />
            )
          ) : (
            <>
              <Section>
                <ListGroup.Item disabled>
                  <ListGroup.ItemContent>
                    <ListGroup.ItemTitle>
                      {run.target === "hermes" ? "Hermes" : "Agora"} {run.from} → {run.to}
                    </ListGroup.ItemTitle>
                    <ListGroup.ItemDescription>
                      {t.trigger[run.trigger]} · {time.format(new Date(run.startedAt))}
                    </ListGroup.ItemDescription>
                  </ListGroup.ItemContent>
                  <ListGroup.ItemSuffix>
                    <RunStatusChip status={run.status} />
                  </ListGroup.ItemSuffix>
                </ListGroup.Item>
              </Section>

              {failed.length > 0 && (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Title>{t.failedChecks}</Alert.Title>
                    {failed.map((c) => (
                      <Alert.Description key={c.name}>{t.checkLine(c.name, c.detail ?? t.checkFailed)}</Alert.Description>
                    ))}
                  </Alert.Content>
                </Alert>
              )}

              {/* The run's log, opened while it runs or when it failed: each step and its time. */}
              <View className="gap-2">
                <Accordion variant="surface" defaultValue={run.status === "succeeded" ? undefined : "steps"}>
                  <Accordion.Item value="steps">
                    <Accordion.Trigger>
                      <Typography className="flex-1">{`${t.steps_} (${run.steps.length})`}</Typography>
                      <Accordion.Indicator />
                    </Accordion.Trigger>
                    <Accordion.Content>
                      <View className="gap-3">
                        {run.steps.map((s, i) => (
                          <View key={i} className="flex-row gap-3">
                            <Typography.Code>{new Date(s.at).toLocaleTimeString(locale)}</Typography.Code>
                            <Typography.Paragraph type="body-sm" color={s.ok === false ? "default" : "muted"} weight={s.ok === false ? "semibold" : undefined} selectable className="flex-1">
                              {stepText(s)}
                            </Typography.Paragraph>
                          </View>
                        ))}
                      </View>
                    </Accordion.Content>
                  </Accordion.Item>
                </Accordion>
                {!!run.backup && <SectionFooter>{t.backup(run.backup)}</SectionFooter>}
              </View>
            </>
          )}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
