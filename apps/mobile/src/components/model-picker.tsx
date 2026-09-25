import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { Button, SearchField, Tabs } from "heroui-native";
import { useState } from "react";
import { FlatList, View } from "react-native";
import { CheckIcon } from "@/components/icons";
import { ModelLogo } from "@/components/model-logo";
import { FloatingMenu, MENU_MAX_HEIGHT, MenuEmpty, MenuRow } from "@/components/slash-menu";
import { api, conversationPath } from "@/lib/api";
import { withTap } from "@/lib/haptics";
import { useAdminToast } from "@/components/admin/ui";
import { defineMessages } from "@/lib/i18n";
import { modelsQuery } from "@/lib/queries";
import type { ModelOptions } from "@/lib/types";

/*
 * apps/web/src/components/ModelPicker.tsx. The trigger is an outline button in the composer's toolbar; the
 * palette floats over the thread like the "/" and "@" menus (components/slash-menu.tsx): the bots' tabs in a
 * group, a search field, then one row per model (its vendor's logo, its provider under it), a check on the
 * current one. The rows are virtualized: a provider such as OpenRouter lists hundreds of models.
 */

const messages = defineMessages({
  en: {
    title: "Choose model",
    search: "Search models",
    empty: "No models.",
    byDefault: (model: string) => `Default (${model})`,
    reasoning: "Reasoning",
    model: "Model",
    models: "Models",
    retry: "Retry",
  },
  fr: {
    title: "Choisir le modèle",
    search: "Rechercher un modèle",
    empty: "Aucun modèle.",
    byDefault: (model: string) => `Par défaut (${model})`,
    reasoning: "Raisonnement",
    model: "Modèle",
    models: "Modèles",
    retry: "Réessayer",
  },
});

/** apps/web/src/components/ProviderLogo.tsx `providerName`: display name of known Hermes providers; the raw slug otherwise. */
const names: Record<string, string> = {
  "claude-code": "Claude Code",
  codex: "Codex",
  anthropic: "Anthropic",
  openai: "OpenAI",
  "openai-codex": "OpenAI Codex",
  gemini: "Google Gemini",
  google: "Google",
  deepseek: "DeepSeek",
  kimi: "Kimi",
  "kimi-coding": "Kimi",
  moonshot: "Moonshot",
  minimax: "MiniMax",
  openrouter: "OpenRouter",
  mistral: "Mistral",
  xai: "xAI",
  qwen: "Qwen",
  nous: "Nous Research",
  copilot: "GitHub Copilot",
  zai: "Z.ai",
  zhipu: "Zhipu",
  huggingface: "Hugging Face",
  ollama: "Ollama",
  lmstudio: "LM Studio",
  "opencode-free": "OpenCode Free",
};

const providerName = (provider: string) => names[provider.toLowerCase()] ?? provider;

/** cmdk's search, simplified: every word of the query appears in the option's value. */
const matches = (value: string, query: string) => {
  const hay = value.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
};

export type Bot = { id: string; name: string };

/** What is chosen for this conversation: a subscription engine (Claude Code, Codex), a model of another provider, the fallback. */
function current(data: ModelOptions) {
  const engines = [data.claudeCode, data.codex].filter((e) => !!e);
  const engine = engines.find((e) => data.selectedProvider === e.provider);
  const engineModel = engine?.models.find((m) => m.id === data.selected);
  // Default model forbidden for this employee: their messages go to the first allowed model.
  const fallback = data.defaultAllowed ? data.defaultModel : (data.models[0]?.id ?? data.defaultModel);
  const label = engine ? `${providerName(engine.provider)} · ${engineModel?.label ?? data.selected}` : (data.selected ?? fallback);
  /** On the composer bar: the model alone, without its vendor ("anthropic/claude-sonnet-4" → "claude-sonnet-4"). */
  const short = engine ? (engineModel?.label ?? data.selected ?? "") : label.split("/").at(-1)!;
  // Chosen model from another Hermes provider signed in on this profile.
  const other = !engine && data.selected && data.selectedProvider && data.selectedProvider !== data.provider ? data.selectedProvider : null;
  return { engines, engine, fallback, label, short, other };
}

type ButtonProps = { conversationId: string; bot?: Bot; several: boolean; open: boolean; onOpenChange: (open: boolean) => void };

/**
 * The toolbar's trigger: the current model (in a group, "Models": each bot has its own). Always there,
 * even before the list arrives or when it failed: a tap then tries again. `open` is controlled: the "/"
 * menu's "Choose model" opens the palette too.
 */
export function ModelButton({ conversationId, bot, several, open, onOpenChange }: ButtonProps) {
  const t = messages;
  const { data, isError, refetch } = useQuery({ ...modelsQuery(conversationId, bot?.id), placeholderData: keepPreviousData });
  if (!data)
    return (
      <Button variant="outline" size="sm" isDisabled={!isError} accessibilityLabel={t.title} onPress={withTap(() => refetch())}>
        <Button.Label numberOfLines={1}>{isError ? t.retry : t.model}</Button.Label>
      </Button>
    );
  const { label, short } = current(data);
  return (
    // Next to the "+" and ringed like it (ChatGPT's tool pills); a second tap closes the palette.
    <Button
      variant={open ? "secondary" : "outline"}
      size="sm"
      accessibilityLabel={`${t.title}: ${label}`}
      accessibilityState={{ expanded: open }}
      onPress={withTap(() => onOpenChange(!open))}
      className="max-w-[200px]"
    >
      <Button.Label numberOfLines={1}>{several ? t.models : short}</Button.Label>
    </Button>
  );
}

/** `source`: the provider, as shown under the model. */
type Option = { key: string; label: string; model?: string; provider: string; source: string; reasoning?: boolean; active: boolean; select: () => void };

type MenuProps = { conversationId: string; bots: Bot[]; bot?: Bot; onBot: (bot: Bot) => void; onClose: () => void };

/**
 * Model choice for this conversation, among those Hermes advertises for the agent's provider and the
 * other providers signed in on Hermes (and Claude Code's and Codex's, for the subscription holder). In a group,
 * tabs pick the bot being set. Picking a model closes the palette.
 */
export function ModelMenu({ conversationId, bots, bot, onBot, onClose }: MenuProps) {
  const qc = useQueryClient();
  const toast = useAdminToast();
  const t = messages;
  const [search, setSearch] = useState("");
  const query = modelsQuery(conversationId, bot?.id);
  const { data, isPlaceholderData } = useQuery({ ...query, placeholderData: keepPreviousData });
  const select = useMutation({
    mutationFn: ({ model, provider }: { model: string | null; provider?: string }) =>
      api(conversationPath(conversationId, "/model"), {
        method: "PUT",
        body: JSON.stringify({ model, provider, agentId: bot?.id }),
      }),
    onMutate: ({ model, provider }) => {
      qc.setQueryData(
        query.queryKey,
        (d) =>
          d && {
            ...d,
            selected: model,
            selectedProvider: model ? (provider ?? d.provider) : null,
          },
      );
      Haptics.selectionAsync().catch(() => {});
      onClose();
    },
    // The palette is closed by then: a failure is said by a toast (the refetch puts the old model back).
    onError: (e) => toast.failed(e),
    onSettled: () => qc.invalidateQueries({ queryKey: query.queryKey }),
  });

  if (!data) return null;
  const { engines, engine, fallback, other } = current(data);
  // Search values, as the web's cmdk values.
  const value = (provider: string, id: string, label = "") => `${provider} ${providerName(provider)} ${id} ${label}`;

  const options: Option[] = [
    ...(data.defaultAllowed
      ? [
          {
            key: `default ${data.defaultModel}`,
            label: t.byDefault(data.defaultModel),
            model: data.defaultModel,
            provider: data.provider,
            source: providerName(data.provider),
            active: !data.selected,
            select: () => select.mutate({ model: null }),
          },
        ]
      : []),
    ...data.models.map((m) => ({
      key: value(data.provider, m.id),
      label: m.id,
      model: m.id,
      provider: data.provider,
      source: providerName(data.provider),
      reasoning: m.reasoning,
      active: !engine && !other && (data.selected ?? (data.defaultAllowed ? null : fallback)) === m.id,
      select: () => select.mutate({ model: m.id }),
    })),
    ...data.others.flatMap((p) =>
      p.models.map((m) => ({
        key: value(p.provider, m.id),
        label: m.id,
        model: m.id,
        provider: p.provider,
        source: providerName(p.provider),
        reasoning: m.reasoning,
        active: other === p.provider && data.selected === m.id,
        select: () => select.mutate({ model: m.id, provider: p.provider }),
      })),
    ),
    ...engines.flatMap((e) =>
      e.models.map((m) => ({
        key: value(e.provider, m.id, m.label),
        label: m.label ?? m.id,
        model: m.id,
        provider: e.provider,
        source: e.label,
        reasoning: m.reasoning,
        active: engine === e && data.selected === m.id,
        select: () => select.mutate({ model: m.id, provider: e.provider }),
      })),
    ),
  ].filter((o) => matches(o.key, search));

  const header = (
    <View className="gap-2 px-3 pt-3 pb-1">
      {bots.length > 1 && (
        <Tabs value={bot?.id ?? ""} onValueChange={(id) => { const next = bots.find((b) => b.id === id); if (next) onBot(next); }}>
          <Tabs.List>
            <Tabs.ScrollView scrollAlign="center">
              <Tabs.Indicator />
              {bots.map((b) => (
                <Tabs.Trigger key={b.id} value={b.id}>
                  <Tabs.Label>{b.name}</Tabs.Label>
                </Tabs.Trigger>
              ))}
            </Tabs.ScrollView>
          </Tabs.List>
        </Tabs>
      )}
      <SearchField value={search} onChange={setSearch}>
        <SearchField.Group>
          <SearchField.SearchIcon />
          <SearchField.Input placeholder={t.search} accessibilityLabel={t.search} autoCorrect={false} returnKeyType="search" />
          <SearchField.ClearButton />
        </SearchField.Group>
      </SearchField>
    </View>
  );

  return (
    <FloatingMenu
      label={t.title}
      header={header}
      list={
        <FlatList
          data={options}
          keyExtractor={(o) => o.key}
          // Only the rows on screen and a little more: opening the palette mounts about ten, not every model.
          initialNumToRender={8}
          maxToRenderPerBatch={8}
          windowSize={5}
          keyboardShouldPersistTaps="always"
          showsVerticalScrollIndicator={false}
          // The search field sits above the rows: fewer of them, so the whole panel stays the height of the "/" menu.
          style={{ maxHeight: MENU_MAX_HEIGHT - 56 }}
          ListEmptyComponent={<MenuEmpty>{t.empty}</MenuEmpty>}
          renderItem={({ item: o, index }) => (
            <MenuRow
              first={index === 0}
              media={<ModelLogo model={o.model} provider={o.provider} />}
              title={o.label}
              description={o.reasoning ? `${o.source} · ${t.reasoning}` : o.source}
              suffix={o.active ? <CheckIcon className="size-5 text-accent" /> : undefined}
              selected={o.active}
              // Another bot's models are loading: the list shown is still the previous one's.
              disabled={isPlaceholderData}
              onPress={o.select}
            />
          )}
        />
      }
    />
  );
}
