import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BrainIcon } from "@/components/icons";
import { Fragment, useState } from "react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from "@/components/ui/command";
import { InputGroupButton } from "@/components/ui/input-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { api, conversationPath } from "@/lib/api";
import { modelsQuery } from "@/lib/queries";
import { ModelLogo } from "./ProviderLogo";
import { providerName } from "../lib/providers";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    search: "Search models",
    empty: "No models.",
    providerModels: (provider: string) => `${provider} models`,
    byDefault: (model: string) => `Default (${model})`,
    reasoning: "Reasoning model",
  },
  fr: {
    search: "Rechercher un modèle",
    empty: "Aucun modèle.",
    providerModels: (provider: string) => `Modèles ${provider}`,
    byDefault: (model: string) => `Par défaut (${model})`,
    reasoning: "Modèle à raisonnement",
  },
});

/**
 * Model choice for this conversation, among those Hermes advertises for the agent's provider and the
 * other providers signed in on Hermes (and Claude Code's and Codex's, for the subscription holder). Searchable palette.
 */
export function ModelPicker({
  conversationId,
  open: controlled,
  onOpenChange,
}: {
  conversationId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const t = useT(messages);
  const [local, setLocal] = useState(false);
  const open = controlled ?? local;
  const setOpen = (next: boolean) => {
    setLocal(next);
    onOpenChange?.(next);
  };
  const { data, isError } = useQuery(modelsQuery(conversationId));
  const select = useMutation({
    mutationFn: ({ model, provider }: { model: string | null; provider?: string }) =>
      api(conversationPath(conversationId, "/model"), {
        method: "PUT",
        body: JSON.stringify({ model, provider }),
      }),
    onMutate: ({ model, provider }) => {
      qc.setQueryData(
        modelsQuery(conversationId).queryKey,
        (d) =>
          d && {
            ...d,
            selected: model,
            selectedProvider: model ? (provider ?? d.provider) : null,
          },
      );
      setOpen(false);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: modelsQuery(conversationId).queryKey }),
  });

  if (isError || !data) return null;
  // Subscription engines (Claude Code, Codex): the chosen one, if the thread is on it.
  const engines = [data.claudeCode, data.codex].filter((e) => !!e);
  const engine = engines.find((e) => data.selectedProvider === e.provider);
  const engineModel = engine?.models.find((m) => m.id === data.selected);
  // Default model forbidden for this employee: their messages go to the first allowed model.
  const fallback = data.defaultAllowed ? data.defaultModel : (data.models[0]?.id ?? data.defaultModel);
  const current = engine ? `${providerName(engine.provider)} · ${engineModel?.label ?? data.selected}` : (data.selected ?? fallback);
  // cmdk values (also used for search); the current model is preselected on open.
  const defaultValue = `default ${data.defaultModel}`;
  const hermesValue = (id: string) => `${data.provider} ${providerName(data.provider)} ${id}`;
  const engineValue = (provider: string, m: { id: string; label?: string }) => `${provider} ${m.id} ${m.label ?? ""}`;
  const otherValue = (provider: string, id: string) => `${provider} ${providerName(provider)} ${id}`;
  // Chosen model from another Hermes provider signed in on this profile.
  const other = !engine && data.selected && data.selectedProvider && data.selectedProvider !== data.provider ? data.selectedProvider : null;
  const activeValue = !data.selected
    ? data.defaultAllowed
      ? defaultValue
      : hermesValue(fallback)
    : engine
      ? engineValue(engine.provider, engineModel ?? { id: data.selected })
      : other
        ? otherValue(other, data.selected)
        : hermesValue(data.selected);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger render={<InputGroupButton size="sm" />}>{current}</PopoverTrigger>
      <PopoverContent side="top" align="end" sideOffset={8} className="w-72 p-0">
        <Command defaultValue={activeValue}>
          <CommandInput placeholder={t.search} />
          <CommandList className="max-h-80">
            <CommandEmpty>{t.empty}</CommandEmpty>
            <CommandGroup heading={<GroupHeading provider={data.provider} label={t.providerModels(providerName(data.provider))} />}>
              {data.defaultAllowed && (
                <Option
                  value={defaultValue}
                  label={t.byDefault(data.defaultModel)}
                  logo={<ModelLogo model={data.defaultModel} provider={data.provider} />}
                  active={!data.selected}
                  onSelect={() => select.mutate({ model: null })}
                />
              )}
              {data.models.map((m) => (
                <Option
                  key={m.id}
                  value={hermesValue(m.id)}
                  label={m.id}
                  logo={<ModelLogo model={m.id} provider={data.provider} />}
                  reasoning={m.reasoning}
                  active={!engine && !other && (data.selected ?? (data.defaultAllowed ? null : fallback)) === m.id}
                  onSelect={() => select.mutate({ model: m.id })}
                />
              ))}
            </CommandGroup>
            {data.others.map((p) => (
              <Fragment key={p.provider}>
                <CommandSeparator />
                <CommandGroup heading={<GroupHeading provider={p.provider} label={t.providerModels(providerName(p.provider))} />}>
                  {p.models.map((m) => (
                    <Option
                      key={m.id}
                      value={otherValue(p.provider, m.id)}
                      label={m.id}
                      logo={<ModelLogo model={m.id} provider={p.provider} />}
                      reasoning={m.reasoning}
                      active={other === p.provider && data.selected === m.id}
                      onSelect={() => select.mutate({ model: m.id, provider: p.provider })}
                    />
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
            {engines.map((e) => (
              <Fragment key={e.provider}>
                <CommandSeparator />
                <CommandGroup heading={<GroupHeading provider={e.provider} label={e.label} />}>
                  {e.models.map((m) => (
                    <Option
                      key={m.id}
                      value={engineValue(e.provider, m)}
                      label={m.label ?? m.id}
                      description={m.description}
                      logo={<ModelLogo model={m.id} provider={e.provider} />}
                      reasoning={m.reasoning}
                      active={engine === e && data.selected === m.id}
                      onSelect={() => select.mutate({ model: m.id, provider: e.provider })}
                    />
                  ))}
                </CommandGroup>
              </Fragment>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function GroupHeading({ provider, label }: { provider: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <ModelLogo provider={provider} className="size-3.5" />
      {label}
    </span>
  );
}

function Option(props: {
  value: string;
  label: string;
  logo: React.ReactNode;
  active: boolean;
  reasoning?: boolean;
  description?: string;
  onSelect: () => void;
}) {
  const t = useT(messages);
  return (
    <CommandItem
      value={props.value}
      data-checked={props.active}
      onSelect={props.onSelect}
      title={props.description}
      className="h-9 gap-2.5 px-2.5 text-sm"
    >
      {props.logo}
      <span className="min-w-0 flex-1 truncate">{props.label}</span>
      {props.reasoning && (
        <Tooltip>
          <TooltipTrigger render={<span />} className="text-subtle">
            <BrainIcon className="size-3.5" aria-label={t.reasoning} />
          </TooltipTrigger>
          <TooltipContent>{t.reasoning}</TooltipContent>
        </Tooltip>
      )}
    </CommandItem>
  );
}
