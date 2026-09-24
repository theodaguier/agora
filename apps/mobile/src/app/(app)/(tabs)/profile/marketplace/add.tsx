import { guessIntegrationType, type IntegrationType } from "@agora/core";
import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import * as Linking from "expo-linking";
import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { Alert, Button, Card, Description, Input, Label, LinkButton, TextField, Typography } from "heroui-native";
import { useState } from "react";
import { View } from "react-native";
import { AdminGate, ErrorAlert, SettingsScroll, Section } from "@/components/admin/ui";
import { AgentTargets } from "@/components/marketplace/agent-targets";
import { IntegrationTypeSection } from "@/components/marketplace/integration-type";
import { ItemTile } from "@/components/marketplace/item-row";
import { RestartBanner } from "@/components/marketplace/restart-banner";
import { ToggleRow } from "@/components/profile/settings";
import { adminAgentsQuery } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { flagRestart, marketplaceHref, openedItem, waitAction, type Item } from "@/lib/marketplace";

/* apps/web/src/components/marketplace/AddSheet.tsx, as a form sheet. */

const t = defineMessages({
  en: {
    enablingFor: (name?: string) => `Enabling for ${name}…`,
    installingConnector: "Installing the connector…",
    installingServer: "Installing the server…",
    installingFor: (name?: string) => `Installing for ${name}…`,
    enablingPlugin: "Enabling the plugin…",
    installingPlugin: "Installing the plugin…",
    mcpSubtitle: "MCP connector · installed for the whole instance",
    registrySubtitle: (remote: boolean) => `MCP registry · ${remote ? "remote server" : "runs on the Hermes machine"}`,
    skillSubtitle: (source: string) => `Skill · ${source}`,
    pluginSubtitle: "Hermes plugin · loaded by the whole instance",
    skillInstalled: "Skill installed.",
    added: "Added. Restart Hermes (banner above) so agents load it.",
    verdict: (verdict: string) =>
      `Hermes's security check rated this skill “${verdict}” (external install commands, for example). It was allowed under Hermes's policy for this source. Review it before leaving it active.`,
    authorizeBefore: "Then authorize it with",
    authorizeAfter: "on the Hermes server.",
    done: "Done",
    configuration: "Configuration",
    stdioBefore: "This server runs third-party code on the Hermes machine:",
    stdioAfter: ". Check its repository before adding it.",
    token: "Access token",
    tokenHelp: "Sent as an Authorization: Bearer header, stored in Hermes's .env.",
    oauth: "This server requires an OAuth sign-in",
    oauthBefore: "This connector is authorized through OAuth: after installing, run",
    oauthAfter: "on the Hermes server.",
    enableForAgents: "Enable for agents",
    installForAgents: "Install for agents",
    defaultProfile: "The default profile (Server admin) has access automatically.",
    website: "View the page",
  },
  fr: {
    enablingFor: (name?: string) => `Activation pour ${name}…`,
    installingConnector: "Installation du connecteur…",
    installingServer: "Installation du serveur…",
    installingFor: (name?: string) => `Installation pour ${name}…`,
    enablingPlugin: "Activation du plugin…",
    installingPlugin: "Installation du plugin…",
    mcpSubtitle: "Connecteur MCP · installé pour toute l'instance",
    registrySubtitle: (remote: boolean) => `Registre MCP · ${remote ? "serveur distant" : "exécuté sur la machine Hermes"}`,
    skillSubtitle: (source: string) => `Skill · ${source}`,
    pluginSubtitle: "Plugin Hermes · chargé par toute l'instance",
    skillInstalled: "Skill installé.",
    added: "Ajouté. Redémarre Hermes (bandeau ci-dessus) pour que les agents le chargent.",
    verdict: (verdict: string) =>
      `Le contrôle de sécurité de Hermes a classé ce skill « ${verdict} » (commandes d'installation externes, par exemple). Il a été autorisé selon la politique de Hermes pour cette source. Vérifie-le avant de le laisser actif.`,
    authorizeBefore: "Autorise-le ensuite avec",
    authorizeAfter: "sur le serveur Hermes.",
    done: "Terminé",
    configuration: "Configuration",
    stdioBefore: "Ce serveur exécute du code tiers sur la machine Hermes :",
    stdioAfter: ". Vérifie son dépôt avant de l'ajouter.",
    token: "Jeton d'accès",
    tokenHelp: "Envoyé en en-tête Authorization: Bearer, stocké dans le .env de Hermes.",
    oauth: "Ce serveur demande une connexion OAuth",
    oauthBefore: "Ce connecteur s'autorise par OAuth : après l'installation, lance",
    oauthAfter: "sur le serveur Hermes.",
    enableForAgents: "Activer pour les agents",
    installForAgents: "Installer pour les agents",
    defaultProfile: "Le profil par défaut (Admin Serveur) y a accès automatiquement.",
    website: "Voir la page",
  },
});

const envName = (e: string | { name: string }) => (typeof e === "string" ? e : e.name);

export default function AddScreen() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const item = openedItem(key);
  return (
    <>
      <Stack.Screen options={{ title: item?.name ?? "" }} />
      {/* Opened from the list only: after a reload, the item is gone. */}
      <AdminGate>{item ? <AddItem item={item} /> : <Redirect href={marketplaceHref} />}</AdminGate>
    </>
  );
}

function AddItem({ item }: { item: Item }) {
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const { data: agents = [] } = useQuery(adminAgentsQuery);
  const agentName = new Map(agents.map((a) => [a.id, a.name]));
  const [targets, setTargets] = useState<string[]>([]);
  const [progress, setProgress] = useState<string | null>(null);
  const [verdict, setVerdict] = useState<string | null>(null);
  const env = item.kind === "mcp" ? item.entry.required_env.map(envName) : [];
  const reg = item.kind === "registry" ? item.server : null;
  const [values, setValues] = useState<Record<string, string>>({});
  const [oauth, setOauth] = useState(false);
  const isMcp = item.kind === "mcp" || item.kind === "registry";
  const serverName = reg ? reg.hermesName : item.name;
  const perAgent = item.kind !== "plugin";
  const [type, setType] = useState<IntegrationType>(("type" in item && item.type) || guessIntegrationType(item.name, item.description));
  const set = (k: string, v: string) => setValues((xs) => ({ ...xs, [k]: v }));

  const enableFor = async (server: string) => {
    for (const id of targets) {
      setProgress(t.enablingFor(agentName.get(id)));
      await api(`/admin/hermes/agents/${id}/mcp/${server}`, { method: "PUT", body: JSON.stringify({ enabled: true }) });
    }
    flagRestart();
  };

  const add = useMutation({
    mutationFn: async () => {
      if (item.kind === "mcp") {
        setProgress(t.installingConnector);
        const envValues = Object.fromEntries(env.map((k) => [k, values[k] ?? ""]));
        await api("/admin/hermes/mcp/catalog/install", { method: "POST", body: JSON.stringify({ name: item.name, env: envValues, type }) });
        await enableFor(item.name);
      } else if (item.kind === "registry") {
        setProgress(t.installingServer);
        const bearer_token = values.bearer_token;
        const envValues = Object.fromEntries(item.server.env.map((e) => [e.name, values[e.name] ?? ""]).filter(([, v]) => v));
        await api("/admin/hermes/mcp/registry/install", {
          method: "POST",
          body: JSON.stringify({ id: item.server.id, env: envValues, oauth, type, ...(bearer_token ? { bearer_token } : {}) }),
        });
        await enableFor(item.server.hermesName);
      } else if (item.kind === "skill") {
        for (const id of targets) {
          setProgress(t.installingFor(agentName.get(id)));
          const r = await api<{ name?: string }>(`/admin/hermes/agents/${id}/skills-hub/install`, {
            method: "POST",
            body: JSON.stringify({ identifier: item.identifier }),
          });
          if (r?.name) {
            const v = await waitAction(r.name);
            if (v && v !== "SAFE") setVerdict(v);
          }
        }
      } else if (item.plugin) {
        setProgress(t.enablingPlugin);
        await api(`/admin/hermes/plugins/${encodeURIComponent(item.plugin.name)}/enable`, { method: "POST" });
        flagRestart();
      } else {
        setProgress(t.installingPlugin);
        await api("/admin/hermes/plugins/install", { method: "POST", body: JSON.stringify({ identifier: item.identifier }) });
        flagRestart();
      }
    },
    onSuccess: () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
    onSettled: () => {
      setProgress(null);
      qc.invalidateQueries({ queryKey: ["hermes"] });
    },
  });

  // Required fields, as the web form's `required` inputs.
  const missing =
    env.some((k) => !values[k]?.trim()) ||
    !!reg?.env.some((e) => e.required && !values[e.name]?.trim()) ||
    (!!reg?.bearer && !values.bearer_token?.trim()) ||
    (item.kind === "skill" && targets.length === 0);
  const url = (item.kind === "skill" || item.kind === "registry") && item.url;
  const code = (text: string) => <Typography.Code>{text}</Typography.Code>;

  return (
    <SettingsScroll>
      <View className="flex-row items-center gap-4 px-1">
        <ItemTile item={item} size="lg" />
        <View className="min-w-0 flex-1 gap-0.5">
          <Typography.Heading type="h4" numberOfLines={2}>
            {item.name}
          </Typography.Heading>
          <Typography.Paragraph type="body-sm" color="muted">
            {item.kind === "mcp" && t.mcpSubtitle}
            {reg && t.registrySubtitle(reg.transport === "remote")}
            {item.kind === "skill" && t.skillSubtitle(item.source)}
            {item.kind === "plugin" && t.pluginSubtitle}
          </Typography.Paragraph>
        </View>
      </View>
      {!!item.description && <Typography.Paragraph className="px-1">{item.description}</Typography.Paragraph>}
      {url && (
        <LinkButton size="sm" accessibilityRole="link" className="-mt-4 self-start px-1" onPress={withTap(() => Linking.openURL(url))}>
          <LinkButton.Label className="text-link">{t.website}</LinkButton.Label>
        </LinkButton>
      )}

      {add.isSuccess ? (
        <>
          <RestartBanner />
          <Card>
            <Card.Body className="gap-2">
              <Typography.Paragraph>{item.kind === "skill" ? t.skillInstalled : t.added}</Typography.Paragraph>
              {verdict && (
                <Alert status="warning">
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{t.verdict(verdict)}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
              {(oauth || (item.kind === "mcp" && item.entry.auth_type === "oauth")) && (
                <Typography.Paragraph type="body-sm" color="muted">
                  {t.authorizeBefore} {code(`hermes mcp login ${serverName}`)} {t.authorizeAfter}
                </Typography.Paragraph>
              )}
              {item.kind === "mcp" && !!item.entry.post_install && (
                <Typography.Paragraph type="body-sm" color="muted">
                  {item.entry.post_install}
                </Typography.Paragraph>
              )}
            </Card.Body>
            <Card.Footer>
              <Button onPress={withTap(() => router.back())}>{t.done}</Button>
            </Card.Footer>
          </Card>
        </>
      ) : (
        <>
          {env.length > 0 && (
            <View className="gap-3">
              <Typography.Paragraph type="body-sm" color="muted" className="px-4">
                {t.configuration}
              </Typography.Paragraph>
              {env.map((k) => (
                <TextField key={k} isRequired>
                  <Label>{k}</Label>
                  <Input value={values[k] ?? ""} onChangeText={(v) => set(k, v)} autoCapitalize="none" autoCorrect={false} />
                </TextField>
              ))}
            </View>
          )}
          {reg?.transport === "stdio" && (
            <Alert status="warning">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  {t.stdioBefore} {code(reg.command ?? "")}
                  {t.stdioAfter}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}
          {reg && reg.env.length > 0 && (
            <View className="gap-3">
              <Typography.Paragraph type="body-sm" color="muted" className="px-4">
                {t.configuration}
              </Typography.Paragraph>
              {reg.env.map((e) => (
                <TextField key={e.name} isRequired={e.required}>
                  <Label>{e.name}</Label>
                  <Input
                    value={values[e.name] ?? ""}
                    onChangeText={(v) => set(e.name, v)}
                    secureTextEntry={e.secret}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  {!!e.description && <Description>{e.description}</Description>}
                </TextField>
              ))}
            </View>
          )}
          {reg?.bearer && (
            <TextField isRequired>
              <Label>{t.token}</Label>
              <Input
                value={values.bearer_token ?? ""}
                onChangeText={(v) => set("bearer_token", v)}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
              <Description>{t.tokenHelp}</Description>
            </TextField>
          )}
          {reg?.transport === "remote" && !reg.bearer && (
            <Section>
              <ToggleRow title={t.oauth} value={oauth} onChange={setOauth} />
            </Section>
          )}
          {item.kind === "mcp" && item.entry.auth_type === "oauth" && (
            <Alert status="accent">
              <Alert.Indicator />
              <Alert.Content>
                <Alert.Description>
                  {t.oauthBefore} {code(`hermes mcp login ${item.name}`)} {t.oauthAfter}
                </Alert.Description>
              </Alert.Content>
            </Alert>
          )}

          {isMcp && (
            <IntegrationTypeSection value={type} onChange={setType} />
          )}

          {perAgent && (
            <AgentTargets
              legend={isMcp ? t.enableForAgents : t.installForAgents}
              hint={isMcp ? t.defaultProfile : undefined}
              value={targets}
              onChange={setTargets}
              withoutDefault={isMcp}
            />
          )}

          <ErrorAlert error={add.error} />
          <Button size="lg" isDisabled={add.isPending || missing} onPress={withTap(() => add.mutate())}>
            {add.isPending ? (progress ?? "…") : c.add}
          </Button>
        </>
      )}
    </SettingsScroll>
  );
}
