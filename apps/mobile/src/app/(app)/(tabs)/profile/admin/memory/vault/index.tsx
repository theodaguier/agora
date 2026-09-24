import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { ListGroup, Typography } from "heroui-native";
import { View } from "react-native";
import { confirmAction } from "@/components/confirm-action";
import { AdminGate, ErrorAlert, SettingsScroll, Intro, LoadingRows, PressableRow, RowMenu, Section, useAdminToast } from "@/components/admin/ui";
import { LockIcon, PlusIcon } from "@/components/icons";
import { RestartBanner } from "@/components/marketplace/restart-banner";
import { adminAgentsQuery, isDefaultProfile } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";
import { flagRestart } from "@/lib/marketplace";
import { secretHref, vaultQuery, vaultRawHref, type Secret } from "@/lib/memory";
import { headerIcon } from "@/components/header-button";
import { MenuButton } from "@/components/menus";
import { withTap } from "@/lib/haptics";

/* apps/web/src/components/admin/Vault.tsx: the list; the dialog is the secret sheet, the developer view its own screen. */

const t = defineMessages({
  en: {
    title: "Vault",
    text: "The credentials in the agents' .env: API keys, tokens, passwords. The list masks values; the developer view shows them.",
    add: "Add",
    emptyTitle: "No credentials",
    emptyText: "Add an API key or a token so agents can use it.",
    all: "All agents",
    none: "No agents",
    some: (n: number, total: number) => `${n} of ${total} agents`,
    edit: "Edit",
    removeTitle: (key: string) => `Delete ${key}?`,
    removeText: "It's removed from the .env of the instance and of every agent. Agents that use it will stop working until it's added back.",
    developer: "Developer",
    more: "More",
    hint: "Touch and hold a credential to delete it.",
  },
  fr: {
    title: "Coffre",
    text: "Les credentials des .env des agents : clés d'API, jetons, mots de passe. La liste masque les valeurs, la vue développeur les affiche.",
    add: "Ajouter",
    emptyTitle: "Aucun credential",
    emptyText: "Ajoute une clé d'API ou un jeton pour que les agents puissent s'en servir.",
    all: "Tous les agents",
    none: "Aucun agent",
    some: (n: number, total: number) => `${n} agent${n > 1 ? "s" : ""} sur ${total}`,
    edit: "Modifier",
    removeTitle: (key: string) => `Supprimer ${key} ?`,
    removeText: "Il est retiré du .env de l'instance et de tous les agents. Ceux qui s'en servent ne fonctionneront plus tant qu'il n'est pas rajouté.",
    developer: "Développeur",
    more: "Plus",
    hint: "Maintiens le doigt sur un credential pour le supprimer.",
  },
});

export default function VaultScreen() {
  const router = useRouter();
  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.View>
          <MenuButton
            icon="ellipsis"
            label={t.more}
            actions={[{ label: t.developer, icon: "chevron.left.forwardslash.chevron.right", onPress: () => router.push(vaultRawHref) }]}
          />
        </Stack.Toolbar.View>
        <Stack.Toolbar.Button icon={headerIcon.plus} iconRenderingMode="template" accessibilityLabel={t.add} onPress={withTap(() => router.push(secretHref()))} />
      </Stack.Toolbar>
      <AdminGate>
        <Vault />
      </AdminGate>
    </>
  );
}

function Vault() {
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const secrets = useQuery(vaultQuery);
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const remove = useMutation({
    mutationFn: (key: string) => api(`/admin/hermes/vault/${encodeURIComponent(key)}`, { method: "DELETE" }),
    onSuccess: () => {
      flagRestart();
      toast.deleted();
    },
    onError: (e) => toast.failed(e),
    onSettled: () => qc.invalidateQueries({ queryKey: vaultQuery.queryKey }),
  });

  const summary = (s: Secret) => {
    const granted = new Set(s.agents);
    const n = agents.filter((a) => granted.has(a.id) || (isDefaultProfile(a) && s.instance)).length;
    return n === 0 ? t.none : n === agents.length ? t.all : t.some(n, agents.length);
  };

  return (
    <SettingsScroll onRefresh={secrets.refetch}>
      <Intro>{t.text}</Intro>
      <RestartBanner />
      <ErrorAlert error={secrets.error} />
      {secrets.isPending ? (
        <LoadingRows rows={4} avatar={false} />
      ) : secrets.data?.length ? (
        <Section footer={t.hint}>
          {secrets.data.map((s) => (
            <RowMenu
              key={s.key}
              actions={[
                { label: t.edit, icon: "pencil", onPress: () => router.push(secretHref(s.key)) },
                {
                  label: c.delete,
                  icon: "trash",
                  destructive: true,
                  onPress: async () => {
                    if (await confirmAction({ title: t.removeTitle(s.key), description: t.removeText, action: c.delete })) remove.mutate(s.key);
                  },
                },
              ]}
 >
              <PressableRow onPress={() => router.push(secretHref(s.key))}>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{s.key}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription numberOfLines={1}>{[s.preview, summary(s)].filter(Boolean).join(" · ")}</ListGroup.ItemDescription>
                </ListGroup.ItemContent>
                <ListGroup.ItemSuffix />
              </PressableRow>
            </RowMenu>
          ))}
        </Section>
      ) : (
        !secrets.error && (
          <View className="items-center gap-2 px-8 py-12">
            <LockIcon className="size-10 text-muted" />
            <Typography.Heading type="h6" align="center">
              {t.emptyTitle}
            </Typography.Heading>
            <Typography.Paragraph type="body-sm" color="muted" align="center">
              {t.emptyText}
            </Typography.Paragraph>
          </View>
        )
      )}
    </SettingsScroll>
  );
}
