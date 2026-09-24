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
