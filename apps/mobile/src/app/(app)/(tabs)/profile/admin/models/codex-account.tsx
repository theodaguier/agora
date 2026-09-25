import { common } from "@agora/core/i18n";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { Stack, useRouter } from "expo-router";
import { Button, Description, Input, Label, TextField } from "heroui-native";
import { useEffect, useRef } from "react";
import { Linking } from "react-native";
import { AdminGate, ErrorAlert, Intro, LoadingRows, SettingsScroll, useAdminToast } from "@/components/admin/ui";
import { accountsSaved, ENGINES } from "@/components/admin/models";
import { modelsMessages as t } from "@/components/admin/models-summary";
import { headerIcon } from "@/components/header-button";
import { api } from "@/lib/api";
import type { SubscriptionAccounts } from "@/lib/admin";
import { withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";

/* AddCodexAccount of apps/web/src/components/admin/HostModels.tsx, as a form sheet. */

export default function CodexAccountScreen() {
  return (
    <>
      <Stack.Screen options={{ title: t.addTitle(ENGINES.codex.account) }} />
      <AdminGate>
        <DeviceLogin />
      </AdminGate>
    </>
  );
}

/**
 * `codex login --device-auth` run by the API: the owner enters the one-time code on OpenAI's page and
 * signs in there; the sign-in ends by itself, this screen follows it.
 */
function DeviceLogin() {
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const start = useQuery({
    queryKey: ["admin", "host", "codex", "login"],
    queryFn: () => api<{ loginId: string; url: string; code: string }>("/admin/host/codex/logins", { method: "POST" }),
    gcTime: 0,
    staleTime: Infinity,
    retry: false,
  });
  const loginId = start.data?.loginId;
  const state = useQuery({
    queryKey: ["admin", "host", "codex", "login", loginId],
    queryFn: () => api<{ state: "pending" | "done" | "failed"; error?: string; accounts?: SubscriptionAccounts }>(`/admin/host/codex/logins/${loginId}`),
    enabled: !!loginId,
    gcTime: 0,
    refetchInterval: (q) => (q.state.data && q.state.data.state !== "pending" ? false : 2000),
  });
  const result = state.data;
  // Once per sign-in, whatever re-renders the screen before it closes.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (result?.state !== "done" || !result.accounts || handled.current === loginId) return;
    handled.current = loginId ?? null;
    void accountsSaved(qc, "codex", result.accounts);
    toast.success(t.accountAdded, result.accounts.accounts.at(-1)?.email);
    router.back();
  }, [result, loginId, qc, toast, router]);
  // Closed before the end: the waiting `codex login` is stopped (a no-op once it ended).
  useEffect(
    () => () => {
      if (loginId) void api(`/admin/host/codex/logins/${loginId}`, { method: "DELETE" }).catch(() => {});
    },
    [loginId],
  );
  const failed = start.isError ? start.error : result?.state === "failed" ? new Error(result.error) : null;
  const shown = start.data;

  return (
    <>
      <Stack.Toolbar placement="left">
        <Stack.Toolbar.Button icon={headerIcon.close} iconRenderingMode="template" accessibilityLabel={c.cancel} onPress={withTap(() => router.back())} />
      </Stack.Toolbar>
      <SettingsScroll>
        <Intro>{start.isPending ? t.preparing : t.codexAddText}</Intro>
        {failed ? (
          <>
            <ErrorAlert error={failed} />
            <Button variant="secondary" className="self-start" onPress={withTap(() => void start.refetch())}>
              {t.retry}
            </Button>
          </>
        ) : !shown ? (
          <LoadingRows rows={2} avatar={false} />
        ) : (
          <>
            <TextField>
              <Label>{t.oneTimeCode}</Label>
              <Input value={shown.code} editable={false} selectTextOnFocus className="font-mono text-2xl" />
              <Description>{t.waiting}</Description>
            </TextField>
            <Button
              variant="tertiary"
              size="sm"
              className="self-start"
              onPress={async () => {
                await Clipboard.setStringAsync(shown.code);
                toast.success(c.copied);
              }}
            >
              {t.copyCode}
            </Button>
            <Button variant="secondary" className="self-start" onPress={withTap(() => Linking.openURL(shown.url))}>
              {t.openPage}
            </Button>
          </>
        )}
      </SettingsScroll>
    </>
  );
}
