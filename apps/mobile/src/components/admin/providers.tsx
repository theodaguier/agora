import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useRouter, type Href } from "expo-router";
import { Alert, Button, ListGroup } from "heroui-native";
import { confirmAction } from "@/components/confirm-action";
import { ErrorAlert, LoadingRows, PressableRow, RowMenu, Section, useAdminToast } from "@/components/admin/ui";
import { api } from "@/lib/api";
import { adminModelsQuery, providerName, providersQuery } from "@/lib/admin";
import { withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";

/* Providers of apps/web/src/components/admin/Providers.tsx: API keys of the AI providers and the default model. */

export const providersMessages = defineMessages({
  en: {
    title: "AI providers",
    text: "The accounts your agents think with. A key added here is given to every agent.",
    noneTitle: "No provider connected",
    noneText: "Agents can't reply until you add a provider.",
    defaultModel: "Default model",
    notChosen: "Not chosen: agents without a provider can't reply",
    viaKey: (n: number) => (n === 1 ? "API key · 1 model" : `API key · ${n} models`),
    viaServer: (n: number) => (n === 1 ? "Signed in on the server · 1 model" : `Signed in on the server · ${n} models`),
    add: "Add",
    replaceKey: "Replace key",
    remove: "Remove",
    removed: "Key removed",
    removeTitle: (name: string) => `Remove the ${name} key?`,
    removeText: "It is deleted from every agent. Those using this provider stop replying until you pick another one.",
    pickTitle: "Add a provider",
    pickText: "Providers Hermes can use with an API key.",
    search: "Search (OpenAI, Anthropic, Mistral…)",
    noMatch: "No provider matches.",
    keyTitle: (name: string) => `${name} key`,
    keyText: "Checked with the provider, then given to every agent. Hermes restarts to load it (about 10 seconds).",
    apiKey: (env: string) => `API key (${env})`,
    checking: "Checking and restarting Hermes…",
    keySaved: "Key saved",
    modelText: "Hermes then answers a test message with it. Agents whose provider isn't connected switch to it too.",
    provider: "Provider",
    model: "Model",
    searchModel: "Search for a model…",
    baseUrl: "Custom endpoint",
    baseUrlHelp: "Only for an OpenAI-compatible server of your own.",
    testing: "Testing…",
    useAndTest: "Use and test",
    replies: (reply: string) => `The model replies: “${reply}”`,
    switched: (n: number) => (n === 1 ? "1 agent without a provider now uses it." : `${n} agents without a provider now use it.`),
  },
  fr: {
    title: "Fournisseurs d'IA",
    text: "Les comptes qui font réfléchir tes agents. Une clé ajoutée ici est donnée à tous les agents.",
    noneTitle: "Aucun fournisseur connecté",
    noneText: "Les agents ne peuvent pas répondre tant que tu n'as pas ajouté de fournisseur.",
    defaultModel: "Modèle par défaut",
    notChosen: "Pas choisi : les agents sans fournisseur ne peuvent pas répondre",
    viaKey: (n: number) => `Clé API · ${n} modèle${n > 1 ? "s" : ""}`,
    viaServer: (n: number) => `Connecté sur le serveur · ${n} modèle${n > 1 ? "s" : ""}`,
    add: "Ajouter",
    replaceKey: "Remplacer la clé",
    remove: "Retirer",
    removed: "Clé retirée",
    removeTitle: (name: string) => `Retirer la clé ${name} ?`,
    removeText: "Elle est supprimée de tous les agents. Ceux qui utilisent ce fournisseur ne répondent plus tant que tu n'en choisis pas un autre.",
    pickTitle: "Ajouter un fournisseur",
    pickText: "Les fournisseurs que Hermes sait utiliser avec une clé API.",
    search: "Rechercher (OpenAI, Anthropic, Mistral…)",
    noMatch: "Aucun fournisseur ne correspond.",
    keyTitle: (name: string) => `Clé ${name}`,
    keyText: "Vérifiée auprès du fournisseur, puis donnée à tous les agents. Hermes redémarre pour la charger (une dizaine de secondes).",
    apiKey: (env: string) => `Clé API (${env})`,
    checking: "Vérification et redémarrage de Hermes…",
    keySaved: "Clé enregistrée",
    modelText: "Hermes répond ensuite à un message de test avec ce modèle. Les agents dont le fournisseur n'est pas connecté passent aussi dessus.",
    provider: "Fournisseur",
    model: "Modèle",
    searchModel: "Chercher un modèle…",
    baseUrl: "Point d'accès personnalisé",
    baseUrlHelp: "Seulement pour ton propre serveur compatible OpenAI.",
    testing: "Test en cours…",
    useAndTest: "Utiliser et tester",
    replies: (reply: string) => `Le modèle répond : « ${reply} »`,
    switched: (n: number) =>
      n === 1 ? "1 agent sans fournisseur utilise maintenant ce modèle." : `${n} agents sans fournisseur utilisent maintenant ce modèle.`,
  },
});

export const providerKeyHref = (slug?: string) => `/profile/admin/models/provider${slug ? `?${new URLSearchParams({ slug })}` : ""}` as Href;
export const defaultModelHref = (provider?: string) => `/profile/admin/models/default${provider ? `?${new URLSearchParams({ provider })}` : ""}` as Href;

/** Everything that shows the providers or their models. */
export const refreshProviders = (qc: QueryClient) =>
  Promise.all([
    qc.invalidateQueries({ queryKey: providersQuery.queryKey }),
    qc.invalidateQueries({ queryKey: adminModelsQuery.queryKey }),
    qc.invalidateQueries({ queryKey: ["models"] }),
  ]);

/** Top of Admin › Models: connected providers and the default model. */
export function Providers() {
  const t = providersMessages;
  const c = tr(common);
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useAdminToast();
  const { data, error } = useQuery(providersQuery);
  const remove = useMutation({
    mutationFn: (slug: string) => api(`/admin/hermes/providers/${slug}/key`, { method: "DELETE" }),
    onSuccess: () => toast.success(t.removed),
    onError: (e) => toast.failed(e),
    onSettled: () => refreshProviders(qc),
  });

  if (!data) return error ? <ErrorAlert error={error} /> : <LoadingRows rows={2} avatar={false} />;
  const connected = data.providers.filter((p) => p.configured);
  const current = connected.find((p) => p.slug === data.current.provider);

  return (
    <>
      {connected.length === 0 && (
        <Alert status="danger">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{t.noneTitle}</Alert.Title>
            <Alert.Description>{t.noneText}</Alert.Description>
          </Alert.Content>
        </Alert>
      )}
      <Section
        title={t.title}
        help={t.text}
        action={
          <Button size="sm" variant="ghost" onPress={withTap(() => router.push(providerKeyHref()))}>
            {t.add}
          </Button>
        }
      >
        {connected.length > 0 && (
          <PressableRow onPress={() => router.push(defaultModelHref())}>
            <ListGroup.ItemContent>
              <ListGroup.ItemTitle>{t.defaultModel}</ListGroup.ItemTitle>
              <ListGroup.ItemDescription numberOfLines={1}>{current ? `${providerName(current.slug)} · ${data.current.model}` : t.notChosen}</ListGroup.ItemDescription>
            </ListGroup.ItemContent>
            <ListGroup.ItemSuffix />
          </PressableRow>
        )}
        {connected.map((p) =>
          p.keyEnv ? (
            <RowMenu
              key={p.slug}
              openOnPress
              actions={[
                { label: t.replaceKey, icon: "key", onPress: () => router.push(providerKeyHref(p.slug)) },
                {
                  label: t.remove,
                  icon: "trash",
                  destructive: true,
                  disabled: remove.isPending,
                  onPress: async () => {
                    if (await confirmAction({ title: t.removeTitle(p.name), description: t.removeText, action: t.remove })) remove.mutate(p.slug);
                  },
                },
              ]}
            >
              <PressableRow>
                <ListGroup.ItemContent>
                  <ListGroup.ItemTitle numberOfLines={1}>{p.name}</ListGroup.ItemTitle>
                  <ListGroup.ItemDescription numberOfLines={1}>
                    {remove.isPending && remove.variables === p.slug ? c.inProgress : t.viaKey(p.models.length)}
                  </ListGroup.ItemDescription>
                </ListGroup.ItemContent>
              </PressableRow>
            </RowMenu>
          ) : (
            <ListGroup.Item key={p.slug} disabled>
              <ListGroup.ItemContent>
                <ListGroup.ItemTitle numberOfLines={1}>{p.name}</ListGroup.ItemTitle>
                <ListGroup.ItemDescription numberOfLines={1}>{t.viaServer(p.models.length)}</ListGroup.ItemDescription>
              </ListGroup.ItemContent>
            </ListGroup.Item>
          ),
        )}
      </Section>
    </>
  );
}
