import { common } from "@agora/core/i18n";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Stack, useLocalSearchParams } from "expo-router";
import { ModelList } from "@/components/agents-admin/model-list";
import { AdminGate, ErrorAlert, SettingsScroll, LoadingRows, Section, useAdminToast } from "@/components/admin/ui";
import { agentModelQuery, type AgentModelOptions } from "@/lib/agents-admin";
import { api } from "@/lib/api";
import { defineMessages, tr } from "@/lib/i18n";

/* ModelSection of apps/web/src/components/admin/AgentDetail.tsx */

const t = defineMessages({
  en: {
    title: "Model",
    modelIntro: "Default model for conversations with this agent. Each employee can pick another one for their thread.",
    modelList: "List provided by Hermes for the provider",
    defaultModel: "Default model",
  },
  fr: {
    title: "Modèle",
    modelIntro: "Modèle utilisé par défaut dans les conversations avec cet agent. Chaque salarié peut en choisir un autre pour son fil.",
    modelList: "Liste fournie par Hermes pour le fournisseur",
    defaultModel: "Modèle par défaut",
  },
});

export default function AgentModelScreen() {
  const { agentId } = useLocalSearchParams<{ agentId: string }>();
  const qc = useQueryClient();
  const toast = useAdminToast();
  const query = agentModelQuery(agentId);
  const { data, isPending, error, refetch } = useQuery(query);
  const save = useMutation({
    mutationFn: (model: string) => api(`/admin/hermes/agents/${agentId}/model`, { method: "PUT", body: JSON.stringify({ model }) }),
    // Checked right away; the list is reread either way.
    onMutate: (model) => qc.setQueryData<AgentModelOptions>(query.queryKey, (d) => d && { ...d, defaultModel: model }),
    onSuccess: (_, model) => toast.success(tr(common).saved, model),
    onError: (e) => toast.failed(e),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: query.queryKey });
      qc.invalidateQueries({ queryKey: ["models"] });
    },
  });

  return (
    <>
      <Stack.Screen.Title>{t.title}</Stack.Screen.Title>
      <AdminGate>
        <SettingsScroll onRefresh={refetch}>
          <ErrorAlert error={error} />
          {isPending ? (
            <LoadingRows rows={4} avatar={false} />
          ) : (
            data && (
              <Section bare title={t.defaultModel} footer={`${t.modelIntro} ${t.modelList} ${data.provider}.`}>
                <ModelList models={data.models} value={data.defaultModel} onChange={(id) => save.mutate(id)} disabled={save.isPending} />
              </Section>
            )
          )}
        </SettingsScroll>
      </AdminGate>
    </>
  );
}
