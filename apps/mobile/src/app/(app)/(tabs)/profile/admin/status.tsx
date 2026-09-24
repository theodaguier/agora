import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Stack } from "expo-router";
import { Accordion, Alert, Button, Chip, Spinner, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AdminGate, ErrorAlert, Intro, LoadingRows, SectionTitle, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { api } from "@/lib/api";
import { statusQuery, type Check, type CheckState, type Restart } from "@/lib/admin";
import { defineMessages, locale } from "@/lib/i18n";
import { RefreshIcon } from "@/components/icons";
import { headerIcon } from "@/components/header-button";
import { withTap } from "@/lib/haptics";
import { dateFormat } from "@/lib/intl";

/* apps/web/src/components/admin/Status.tsx */

/** Time to wait before checking again; a local process is already back when the request returns. */
const settleMs: Record<Restart, number> = { process: 0, container: 45_000, curator: 1_000 };

const messages = defineMessages({
  en: {
    title: "Status",
    components: "Components",
    intro: "Checks every component of the instance. Refreshed every 30 seconds.",
    refresh: "Check now",
    checking: "Checking…",
    checkedAt: (time: string) => `Checked at ${time}`,
    restart: "Restart",
    restarting: "Restarting…",
    restartFailed: "Couldn't restart.",
    confirm: {
      process: {
        title: (name: string) => `Restart ${name}?`,
        description: "It is stopped then started again, which takes a few seconds. Replies in progress finish first.",
      },
      container: {
        title: (_: string) => "Restart Hermes?",
        description: "The Hermes container and the app server restart: replies in progress are cut off and the app is unavailable for about a minute.",
      },
    },
    summary: { ok: "Everything is running.", warn: "Running, with warnings.", down: "Something is down." } as Record<Exclude<CheckState, "off">, string>,
    states: { ok: "Running", warn: "Degraded", down: "Down", off: "Off" } as Record<CheckState, string>,
    names: {
      database: "Database",
      gateway: "Hermes gateway",
      bots: "Bots",
      dashboard: "Hermes dashboard",
      memory: "Company memory",
      updater: "Update service",
      mail: "Email",
      claudeCode: "Claude Code",
    } as Record<string, string>,
  },
  fr: {
    title: "Statut",
    components: "Composants",
    intro: "Vérifie chaque composant de l'instance. Actualisé toutes les 30 secondes.",
    refresh: "Vérifier",
    checking: "Vérification…",
    checkedAt: (time: string) => `Vérifié à ${time}`,
    restart: "Relancer",
    restarting: "Relance…",
    restartFailed: "Relance impossible.",
    confirm: {
      process: {
        title: (name: string) => `Relancer ${name} ?`,
        description: "Il est arrêté puis redémarré, ce qui prend quelques secondes. Les réponses en cours se terminent d'abord.",
      },
      container: {
        title: (_: string) => "Relancer Hermes ?",
        description: "Le conteneur Hermes et le serveur de l'app redémarrent : les réponses en cours sont coupées et l'app est indisponible environ une minute.",
      },
    },
    summary: { ok: "Tout tourne.", warn: "Ça tourne, avec des alertes.", down: "Quelque chose est en panne." },
    states: { ok: "Opérationnel", warn: "Dégradé", down: "En panne", off: "Inactif" },
    names: {
      database: "Base de données",
      gateway: "Gateway Hermes",
      bots: "Bots",
      dashboard: "Dashboard Hermes",
      memory: "Mémoire de l'organisation",
      updater: "Service de mise à jour",
      mail: "Email",
      claudeCode: "Claude Code",
    },
  },
});

/** The state chip: the only color on the screen, and it carries meaning. */
const chipColor: Record<CheckState, "success" | "warning" | "danger" | "default"> = { ok: "success", warn: "warning", down: "danger", off: "default" };
const alertStatus = { ok: "success", warn: "warning", down: "danger" } as const;

export default function Status() {
  return (
    <>
      <Stack.Screen.Title>{messages.title}</Stack.Screen.Title>
      <AdminGate>
        <StatusReport />
      </AdminGate>
    </>
  );
}

function StatusReport() {
  const t = messages;
  const time = dateFormat(locale, { timeStyle: "medium" });
  const qc = useQueryClient();
  const { data, isFetching, error, refetch } = useQuery({ ...statusQuery, refetchInterval: 30_000 });
  const toast = useAdminToast();
  const [restarting, setRestarting] = useState<string | null>(null);
  const restart = useMutation({
    mutationFn: (check: Check) => api(`/admin/status/${check.id}/restart`, { method: "POST" }),
    onMutate: (check) => setRestarting(check.id),
    onSuccess: async (_, check) => {
      await new Promise((r) => setTimeout(r, settleMs[check.restart!]));
      await qc.invalidateQueries({ queryKey: statusQuery.queryKey });
    },
    onError: (e) => toast.failed(e, t.restartFailed),
    onSettled: () => setRestarting(null),
  });

  const onRestart = async (check: Check) => {
    if (check.restart !== "curator") {
      const copy = t.confirm[check.restart!];
      const name = t.names[check.id === "bots" ? "gateway" : check.id] ?? check.id;
      if (!(await confirmAction({ title: copy.title(name), description: copy.description, action: t.restart }))) return;
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    restart.mutate(check);
  };
  const overall: Exclude<CheckState, "off"> | null = !data
    ? null
    : data.checks.some((c) => c.state === "down")
      ? "down"
      : data.checks.some((c) => c.state === "warn")
        ? "warn"
        : "ok";

  return (
    <>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button icon={headerIcon.refresh} iconRenderingMode="template" accessibilityLabel={isFetching ? t.checking : t.refresh} disabled={isFetching} onPress={withTap(() => refetch())} />
      </Stack.Toolbar>
      <SettingsScroll onRefresh={refetch}>
        <Intro>{t.intro}</Intro>
        {!data || !overall ? (
          error ? (
            <ErrorAlert error={error} />
          ) : (
            <LoadingRows rows={6} avatar={false} />
          )
        ) : (
          <>
            <Alert status={alertStatus[overall]}>
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Title>{t.summary[overall]}</Alert.Title>
                <Alert.Description>{isFetching ? t.checking : t.checkedAt(time.format(new Date(data.checkedAt)))}</Alert.Description>
              </Alert.Content>
            </Alert>

            {/* Each component opens on its technical details, and on its restart when it has one. */}
            <View className="gap-2">
              <SectionTitle>{t.components}</SectionTitle>
              <Accordion selectionMode="multiple" variant="surface">
                {data.checks.map((check) => {
                  const busy = restarting === check.id;
                  const name = t.names[check.id] ?? check.id;
                  return (
                    <Accordion.Item key={check.id} value={check.id}>
                      <Accordion.Trigger>
                        <View className="flex-1 flex-row items-center gap-3">
                          <Typography className="flex-1" numberOfLines={1}>
                            {name}
                          </Typography>
                          {busy ? (
                            <Spinner size="sm" />
                          ) : (
                            <Chip size="sm" variant="soft" color={chipColor[check.state]}>
                              <Chip.Label>{t.states[check.state]}</Chip.Label>
                            </Chip>
                          )}
                        </View>
                        <Accordion.Indicator />
                      </Accordion.Trigger>
                      <Accordion.Content>
                        <View className="items-start gap-3">
                          <Typography.Paragraph type="body-sm" color="muted" selectable>
                            {[check.detail, check.state !== "off" && check.latencyMs !== undefined ? `${check.latencyMs} ms` : null].filter(Boolean).join(" · ") ||
                              t.states[check.state]}
                          </Typography.Paragraph>
                          {!!check.restart && (
                            <Button size="sm" variant="secondary" isDisabled={restarting !== null} onPress={() => onRestart(check)}>
                              {busy ? t.restarting : t.restart}
                            </Button>
                          )}
                        </View>
                      </Accordion.Content>
                    </Accordion.Item>
                  );
                })}
              </Accordion>
            </View>
          </>
        )}
      </SettingsScroll>
    </>
  );
}
