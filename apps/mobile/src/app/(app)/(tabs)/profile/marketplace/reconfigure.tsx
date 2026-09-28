import { common, connectors } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Button, Description, Input, Label, Tabs, TextField, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AdminGate, ErrorAlert, LoadingRows, SettingsScroll } from "@/components/admin/ui";
import { ConnectorField } from "@/components/connector-field";
import { OAuthClientFields } from "@/components/marketplace/oauth-client-fields";
import { EMPTY_OAUTH_CLIENT, needsOwnClient, oauthClientOf } from "@/components/marketplace/oauth-client";
import { useFeedback } from "@/components/profile/settings";
import { api, apiUrl } from "@/lib/api";
import { haptic, withTap } from "@/lib/haptics";
import { tr } from "@/lib/i18n";
import { useMcpOAuth } from "@/lib/marketplace";
import type { McpRequest } from "@/lib/types";

/* apps/web/src/components/marketplace/ReconfigureDialog.tsx, as a form sheet. */

type Auth = McpRequest["auth"];

export default function ReconfigureScreen() {
  const { name = "" } = useLocalSearchParams<{ name?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: tr(connectors).reconfigureName(name) }} />
      <AdminGate>
        <Reconfigure name={name} />
      </AdminGate>
    </>
  );
}

function Reconfigure({ name }: { name: string }) {
  // The connector's request, made from its Hermes declaration the first time.
  const request = useQuery({
    queryKey: ["mcp-reconfigure", name],
    queryFn: () => api<McpRequest>(`/mcp-requests/reconfigure/${encodeURIComponent(name)}`, { method: "POST" }),
    staleTime: Infinity,
    retry: false,
  });
  return (
    <SettingsScroll>
      {request.data ? <Form key={request.data.id} req={request.data} /> : request.error ? <ErrorAlert error={request.error} /> : <LoadingRows rows={2} avatar={false} />}
    </SettingsScroll>
  );
}

function Form({ req }: { req: McpRequest }) {
  const t = tr(connectors);
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const feedback = useFeedback();
  const oauth = useMcpOAuth();
  const [auth, setAuth] = useState<Auth>(req.auth);
  const [token, setToken] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [fileNames, setFileNames] = useState<Record<string, string>>({});
  const [client, setClient] = useState(EMPTY_OAUTH_CLIENT);
  const remote = req.transport === "remote";

  const save = useMutation({
    mutationFn: async () => {
      const install = (body: object) => api<McpRequest>(`/mcp-requests/${req.id}/install`, { method: "POST", body: JSON.stringify({ ...body, ...(remote && { auth }) }) });
      if (remote && auth === "oauth") {
        const oauth_client = oauthClientOf(client);
        await oauth.authorize(req.id, () => install(oauth_client ? { oauth_client } : {}));
        return;
      }
      await install({
        env: Object.fromEntries(Object.entries(values).filter(([, v]) => v)),
        ...(auth === "header" && { bearer_token: token.trim() }),
      });
    },
    onSuccess: () => {
      feedback.saved(t.reconfigured(req.name));
      router.back();
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["hermes"] });
      qc.invalidateQueries({ queryKey: ["mcp-requests"] });
      qc.invalidateQueries({ queryKey: ["mcp-request", req.id] });
      qc.invalidateQueries({ queryKey: ["mcp-reconfigure", req.name] });
    },
  });

  const valid = !remote || auth !== "header" || !!token.trim();

  return (
    <>
      <View className="gap-1 px-1">
        <Typography.Paragraph>{t.reconfigureIntro}</Typography.Paragraph>
        <Typography.Code color="muted">{req.url ?? req.command}</Typography.Code>
      </View>

      {remote ? (
        <>
          <View className="gap-2">
            <Label isRequired>{t.auth}</Label>
            <Tabs value={auth} onValueChange={(v) => (haptic.select(), setAuth(v as Auth))}>
              <Tabs.List>
                <Tabs.Indicator />
                {(["none", "header", "oauth"] as const).map((a) => (
                  <Tabs.Trigger key={a} value={a}>
                    <Tabs.Label>{t.auths[a]}</Tabs.Label>
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </Tabs>
            <Description>{t.remoteNoFiles}</Description>
          </View>
          {auth === "header" && (
            <TextField isRequired>
              <Label>{t.token}</Label>
              <Input value={token} onChangeText={setToken} secureTextEntry autoCapitalize="none" autoCorrect={false} />
              <Description>{t.secretsNote}</Description>
            </TextField>
          )}
          {auth === "oauth" && (
            <OAuthClientFields
              redirectUri={req.redirectUri ?? apiUrl(`/mcp-oauth/callback/${encodeURIComponent(req.name)}`)}
              value={client}
              onChange={setClient}
              required={needsOwnClient(save.error)}
              disabled={save.isPending}
            />
          )}
        </>
      ) : req.env.length ? (
        <View className="gap-3">
          {req.env.map((v) => (
            <ConnectorField
              key={v.name}
              // Left empty, a field keeps its current value.
              field={{ ...v, required: false }}
              value={values[v.name] ?? ""}
              fileName={fileNames[v.name]}
              onChange={(value, fileName) => {
                setValues((vs) => ({ ...vs, [v.name]: value }));
                if (fileName !== undefined) setFileNames((ns) => ({ ...ns, [v.name]: fileName }));
              }}
            />
          ))}
          <Description>
            {t.keepEmpty} {t.secretsNote}
          </Description>
        </View>
      ) : (
        <Typography.Paragraph color="muted" className="px-1">
          {t.noFields}
        </Typography.Paragraph>
      )}

      <ErrorAlert error={save.error} />
      <Button size="lg" isDisabled={save.isPending || !valid} onPress={withTap(() => save.mutate())}>
        {save.isPending ? (oauth.status ?? c.inProgress) : remote && auth === "oauth" ? t.authorize : c.save}
      </Button>
    </>
  );
}
