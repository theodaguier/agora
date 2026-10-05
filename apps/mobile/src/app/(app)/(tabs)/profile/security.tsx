import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { router, Stack, type Href } from "expo-router";
import { ListGroup, Typography } from "heroui-native";
import { ErrorAlert, PressableRow, Section, SettingsScroll, SwitchRow, useAdminToast } from "@/components/admin/ui";
import { confirmAction } from "@/components/confirm-action";
import { useMe } from "@/components/server-scope";
import { twoFactorMessages as t, type TwoFactorIntent } from "@/components/two-factor";
import { api } from "@/lib/api";
import { adminOrgQuery, type Org } from "@/lib/admin";
import { orgQuery } from "@/lib/agents-admin";
import { defineMessages } from "@/lib/i18n";

/* The web's Settings › Security tab (Settings.tsx Security, TwoFactor.tsx, admin/Security.tsx). */

const messages = defineMessages({
  en: {
    title: "Security",
    yourAccount: "Your account",
    organization: "Organization",
    require: "Require two-step verification",
    requireHelp: "Every account must turn it on before using Agora, on the web and in the mobile app.",
    ownFirst: "Turn it on for your own account first.",
    confirmTitle: "Require two-step verification?",
    confirmText: "Accounts that haven't turned it on will be asked to, and can't use Agora until they do.",
    confirm: "Require",
    allTools: "Every tool for new bots",
    allToolsHelp: "Each new bot starts with browser, terminal and file writes, with nothing to turn on bot by bot. Existing bots keep their tools.",
    allToolsTitle: "Give new bots every tool?",
    allToolsText: "With the terminal and the browser, a bot acts on the server that hosts Agora. An instruction hidden in a page or a file it reads can push it to.",
    allToolsConfirm: "Turn on",
  },
  fr: {
    title: "Sécurité",
    yourAccount: "Ton compte",
    organization: "Organisation",
    require: "Exiger la validation en deux étapes",
    requireHelp: "Chaque compte doit l'activer avant d'utiliser Agora, sur le web comme dans l'app mobile.",
    ownFirst: "Active-la d'abord sur ton propre compte.",
    confirmTitle: "Exiger la validation en deux étapes ?",
    confirmText: "Les comptes qui ne l'ont pas activée devront le faire, et ne pourront plus utiliser Agora d'ici là.",
    confirm: "Exiger",
    allTools: "Tous les outils pour les nouveaux bots",
    allToolsHelp: "Chaque nouveau bot naît avec le navigateur, le terminal et l'écriture de fichiers, sans rien activer bot par bot. Les bots existants gardent leurs outils.",
    allToolsTitle: "Donner tous les outils aux nouveaux bots ?",
    allToolsText: "Avec le terminal et le navigateur, un bot agit sur le serveur qui héberge Agora. Une instruction cachée dans une page ou un fichier qu'il lit peut l'y pousser.",
    allToolsConfirm: "Activer",
  },
});

const openFlow = (intent: TwoFactorIntent) => router.push({ pathname: "/profile/two-factor", params: { intent } } as unknown as Href);

export default function Security() {
  const me = useMe();
  const enabled = !!me.twoFactorEnabled;
  const required = !!useQuery(orgQuery).data?.requireTwoFactor;

  return (
    <>
      <Stack.Screen.Title>{messages.title}</Stack.Screen.Title>
      <SettingsScroll>
        <Section title={messages.yourAccount} footer={enabled ? (required ? t.requiredHelp : t.onHelp) : t.offHelp}>
          <ListGroup.Item disabled>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{t.title}</ListGroup.ItemTitle>
            </ListGroup.ItemContent>
            <Typography.Paragraph color="muted">{enabled ? t.on : t.off}</Typography.Paragraph>
          </ListGroup.Item>
          {!enabled && (
            <PressableRow onPress={() => openFlow("enable")}>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle className="text-accent">{t.turnOn}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
            </PressableRow>
          )}
          {enabled && (
            <PressableRow
              onPress={async () => {
                if (await confirmAction({ title: t.newCodesTitle, description: t.newCodesDescription, action: t.create })) openFlow("codes");
              }}
            >
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle>{t.newCodes}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
              <ListGroup.ItemSuffix />
            </PressableRow>
          )}
          {enabled && !required && (
            <PressableRow
              onPress={async () => {
                if (await confirmAction({ title: t.offTitle, description: t.offDescription, action: t.turnOff })) openFlow("disable");
              }}
            >
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle className="text-danger">{t.turnOff}</ListGroup.ItemTitle>
              </ListGroup.ItemContent>
            </PressableRow>
          )}
        </Section>
        {me.role === "admin" && <RequireTwoFactor ownEnabled={enabled} />}
        {me.role === "admin" && <NewBotsAllTools />}
      </SettingsScroll>
    </>
  );
}

/** Admin: two-step verification required for every account (middleware.ts of the API). */
function RequireTwoFactor({ ownEnabled }: { ownEnabled: boolean }) {
  const qc = useQueryClient();
  const toast = useAdminToast();
  const { data, error } = useQuery(adminOrgQuery);
  const save = useMutation({
    mutationFn: (requireTwoFactor: boolean) => api<Org>("/admin/org", { method: "PUT", body: JSON.stringify({ requireTwoFactor }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminOrgQuery.queryKey });
      qc.invalidateQueries({ queryKey: orgQuery.queryKey });
      toast.success();
    },
    onError: (e) => toast.failed(e),
  });
  const value = save.isPending ? !!save.variables : !!data?.requireTwoFactor;

  return (
    <Section title={messages.organization} footer={ownEnabled || value ? messages.requireHelp : messages.ownFirst}>
      {error ? <ErrorAlert error={error} /> : null}
      {data && (
        <SwitchRow
          title={messages.require}
          value={value}
          disabled={save.isPending || (!ownEnabled && !value)}
          onChange={async (on) => {
            if (on && !(await confirmAction({ title: messages.confirmTitle, description: messages.confirmText, action: messages.confirm, destructive: false }))) return;
            save.mutate(on);
          }}
        />
      )}
    </Section>
  );
}

/** Admin: new bots are born with every tool instead of confined (sandbox.ts of the API). */
function NewBotsAllTools() {
  const qc = useQueryClient();
  const toast = useAdminToast();
  const { data, error } = useQuery(adminOrgQuery);
  const save = useMutation({
    mutationFn: (newBotsAllTools: boolean) => api<Org>("/admin/org", { method: "PUT", body: JSON.stringify({ newBotsAllTools }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adminOrgQuery.queryKey });
      toast.success();
    },
    onError: (e) => toast.failed(e),
  });
  const value = save.isPending ? !!save.variables : !!data?.newBotsAllTools;

  return (
    <Section footer={messages.allToolsHelp}>
      {error ? <ErrorAlert error={error} /> : null}
      {data && (
        <SwitchRow
          title={messages.allTools}
          value={value}
          disabled={save.isPending}
          onChange={async (on) => {
            if (on && !(await confirmAction({ title: messages.allToolsTitle, description: messages.allToolsText, action: messages.allToolsConfirm, destructive: false }))) return;
            save.mutate(on);
          }}
        />
      )}
    </Section>
  );
}
