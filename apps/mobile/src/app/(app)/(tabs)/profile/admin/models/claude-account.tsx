import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useRouter } from "expo-router";
import { Button, Input, Label, TextField } from "heroui-native";
import { useEffect, useState } from "react";
import { Linking } from "react-native";
import { AdminGate, ErrorAlert, Intro, LoadingRows, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { accountsSaved, ENGINES } from "@/components/admin/models";
import { modelsMessages as t } from "@/components/admin/models-summary";
import { headerIcon } from "@/components/header-button";
import { api } from "@/lib/api";
import type { SubscriptionAccounts } from "@/lib/admin";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/* AddClaudeAccount of apps/web/src/components/admin/HostModels.tsx, as a form sheet. */

export default function ClaudeAccountScreen() {
  return (
    <>
      <Stack.Screen options={{ title: t.addTitle(ENGINES.claude.account) }} />
      <AdminGate>
        <LoginForm />
      </AdminGate>
    </>
  );
}

/** `claude auth login` run by the API: the owner signs in on Claude's page, then pastes the code it shows. */
function LoginForm() {
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const [code, setCode] = useState("");
  const start = useQuery({
    queryKey: ["admin", "host", "claude", "login"],
    queryFn: () => api<{ loginId: string; url: string }>("/admin/host/claude/logins", { method: "POST" }),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  const loginId = start.data?.loginId;
  const finish = useMutation({
    mutationFn: () => api<SubscriptionAccounts>(`/admin/host/claude/logins/${loginId}`, { method: "POST", body: JSON.stringify({ code: code.trim() }) }),
    onSuccess: async (d) => {
      await accountsSaved(qc, "claude", d);
      toast.success(t.accountAdded, d.accounts.at(-1)?.email);
      router.back();
    },
    // That sign-in is over on the API: a new one, whose page gives a new code.
    onError: (e) => {
      toast.failed(e);
      setCode("");
      void start.refetch();
    },
  });
  // Closed before the end: the waiting `claude auth login` is stopped (a no-op once the account is added).
  useEffect(
    () => () => {
      if (loginId) void api(`/admin/host/claude/logins/${loginId}`, { method: "DELETE" }).catch(() => {});
    },
    [loginId],
  );
  const valid = !!loginId && !!code.trim();

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={headerIcon.check}
          iconRenderingMode="template"
          accessibilityLabel={finish.isPending ? t.connecting : t.connect}
          disabled={!valid || finish.isPending}
          variant="prominent"
          onPress={withTap(() => finish.mutate())}
        />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{start.isPending ? t.preparing : finish.isPending ? t.connecting : t.claudeAddText}</Intro>
        {start.isPending ? (
          <LoadingRows rows={2} avatar={false} />
        ) : start.isError ? (
          <ErrorAlert error={start.error} />
        ) : (
          <>
            <Button variant="secondary" className="self-start" onPress={withTap(() => Linking.openURL(start.data.url))}>
              {t.openPage}
            </Button>
            <TextField isRequired isDisabled={finish.isPending}>
              <Label>{t.code}</Label>
              <Input value={code} onChangeText={setCode} autoCapitalize="none" autoCorrect={false} spellCheck={false} onSubmitEditing={() => valid && finish.mutate()} />
            </TextField>
          </>
        )}
      </SettingsScroll>
    </>
  );
}
