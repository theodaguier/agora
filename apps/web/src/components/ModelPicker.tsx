import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { modelName } from "@agora/core";
import { reasoning as reasoningMessages } from "@agora/core/i18n";
import { Skeleton } from "@/components/ui/skeleton";
import { defineMessages, useT } from "@/i18n";
import { api, conversationPath, type PickerModel } from "@/lib/api";
import { modelsQuery } from "@/lib/queries";
import { providerName } from "../lib/providers";
import { GroupHeading, ModelMenu, type MenuGroup, type MenuModel, type ModelChoice, type Reasoning } from "./ModelMenu";
import { ModelLogo } from "./ProviderLogo";

const messages = defineMessages({
  en: {
    providerModels: (provider: string) => `${provider} models`,
    byDefault: (model: string) => `Default (${model})`,
  },
  fr: {
    providerModels: (provider: string) => `Modèles ${provider}`,
    byDefault: (model: string) => `Par défaut (${model})`,
  },
});

/** The agent's own model, not a model id. */
const DEFAULT = "\u0001default";
const HERMES = "hermes";

/**
 * Model of this conversation, with its effort and fast mode: among the models Hermes advertises for the
 * agent's provider, the other providers signed in on Hermes, and Claude Code's and Codex's for the
 * subscription holder. The same menu as a code session's (ModelMenu).
 */
export function ModelPicker({
  conversationId,
  open,
  onOpenChange,
}: {
  conversationId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const t = useT(messages);
  const tr = useT(reasoningMessages);
  const { data, isError, isPending } = useQuery(modelsQuery(conversationId));
  const reason = useMutation({
    mutationFn: (next: Reasoning) => api(conversationPath(conversationId, "/reasoning"), { method: "PUT", body: JSON.stringify(next) }),
    onMutate: (next) => qc.setQueryData(modelsQuery(conversationId).queryKey, (d) => d && { ...d, ...next }),
    onSettled: () => qc.invalidateQueries({ queryKey: modelsQuery(conversationId).queryKey }),
    meta: { success: tr.changed },
  });
  const select = useMutation({
    mutationFn: ({ model, provider }: { model: string | null; provider?: string }) =>
      api(conversationPath(conversationId, "/model"), { method: "PUT", body: JSON.stringify({ model, provider }) }),
    onMutate: ({ model, provider }) =>
      qc.setQueryData(modelsQuery(conversationId).queryKey, (d) => d && { ...d, selected: model, selectedProvider: model ? (provider ?? d.provider) : null }),
    onSettled: () => qc.invalidateQueries({ queryKey: modelsQuery(conversationId).queryKey }),
  });

  // Loading: a placeholder the size of the chip, so the composer's toolbar doesn't jump.
  if (isPending) return <Skeleton className="h-7 w-24" />;
  if (isError || !data) return null;

  // Subscription engines (Claude Code, Codex): the chosen one, if the thread is on it.
  const engines = [data.claudeCode, data.codex].filter((e) => !!e);
  const engine = engines.find((e) => data.selectedProvider === e.provider);
  // Chosen model from another Hermes provider signed in on this profile.
  const other = !engine && data.selected && data.selectedProvider && data.selectedProvider !== data.provider ? data.selectedProvider : null;
  // Default model forbidden for this employee: their messages go to the first allowed model.
  const fallback = data.defaultAllowed ? data.defaultModel : (data.models[0]?.id ?? data.defaultModel);
  const value: ModelChoice = engine
    ? { group: engine.provider, id: data.selected! }
    : other
      ? { group: other, id: data.selected! }
      : { group: HERMES, id: data.selected ?? (data.defaultAllowed ? DEFAULT : fallback) };

  const item = (provider: string, m: PickerModel): MenuModel => ({
    id: m.id,
    label: m.label ?? modelName(m.id),
    description: m.description,
    logo: <ModelLogo model={m.id} provider={provider} />,
    efforts: m.efforts,
    fast: m.fast,
  });
  // The model a thread was given, even when no longer listed: shown as it runs.
  const withChosen = (g: MenuGroup): MenuGroup =>
    g.key === value.group && !g.models.some((m) => m.id === value.id) && value.id !== DEFAULT
      ? { ...g, models: [{ id: value.id, label: modelName(value.id) }, ...g.models] }
      : g;
  const agentDefault = data.models.find((m) => m.id === data.defaultModel);
  const groups: MenuGroup[] = [
    {
      key: HERMES,
      heading: <GroupHeading logo={<ModelLogo provider={data.provider} />} label={t.providerModels(providerName(data.provider))} />,
      models: [
        ...(data.defaultAllowed
          ? [{ ...item(data.provider, agentDefault ?? { id: data.defaultModel, reasoning: false }), id: DEFAULT, label: t.byDefault(modelName(data.defaultModel)) }]
          : []),
        ...data.models.map((m) => item(data.provider, m)),
      ],
    },
    ...data.others.map((p) => ({
      key: p.provider,
      heading: <GroupHeading logo={<ModelLogo provider={p.provider} />} label={t.providerModels(providerName(p.provider))} />,
      models: p.models.map((m) => item(p.provider, m)),
    })),
    ...engines.map((e) => ({
      key: e.provider,
      heading: <GroupHeading logo={<ModelLogo provider={e.provider} />} label={e.label} />,
      models: e.models.map((m) => item(e.provider, m)),
    })),
  ].map(withChosen);

  return (
    <ModelMenu
      groups={groups}
      value={value}
      reasoning={{ effort: data.effort ?? null, fast: !!data.fast }}
      open={open}
      onOpenChange={onOpenChange}
      onReasoning={reason.mutate}
      onModel={({ group, id }) => select.mutate(group === HERMES ? { model: id === DEFAULT ? null : id } : { model: id, provider: group })}
    />
  );
}
