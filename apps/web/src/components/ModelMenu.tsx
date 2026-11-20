import { effortRank, reasoning as reasoningMessages } from "@agora/core/i18n";
import type { ReactNode } from "react";
import { FlashIcon, GaugeIcon, LayersIcon, ModelsIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroupButton } from "@/components/ui/input-group";
import { Switch } from "@/components/ui/switch";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: {
    model: "Model",
    context: "Context",
    standard: "Standard",
    oneM: "1M",
    fastShort: "fast",
  },
  fr: {
    model: "Modèle",
    context: "Contexte",
    standard: "Standard",
    oneM: "1M",
    fastShort: "rapide",
  },
});

export type Reasoning = { effort: string | null; fast: boolean };

/** A model the menu offers, with what can be chosen with it: its effort levels and its fast mode. */
export type MenuModel = { id: string; label: string; description?: string; logo?: ReactNode; efforts?: string[]; fast?: boolean };

/** Models under one heading (a provider, an engine); no heading when it is the only group. */
export type MenuGroup = { key: string; heading?: ReactNode; models: MenuModel[] };

export type ModelChoice = { group: string; id: string };

/** Claude Code's larger-context variant of a model: same id, suffixed. */
const ONE_M = "[1m]";
const baseId = (id: string) => (id.endsWith(ONE_M) ? id.slice(0, -ONE_M.length) : id);
/** Radio value of the model's own effort ("default" is not a level any engine names). */
const DEFAULT = "default";
const key = (c: ModelChoice) => `${c.group}\u0000${c.id}`;

/**
 * Colours that carry a meaning, as in the Figma (« Composer unifié et menu du modèle »): the effort
 * from calm to intense, the fast mode in blue. Inline, so a focused menu row keeps them.
 */
const EFFORT_TONE: Record<string, string> = { medium: "state-running", high: "state-merged", xhigh: "warning", max: "priority-urgent", ultra: "priority-urgent" };
export const FAST_TONE = "state-running";
/** Spread on an element: its colour, and `data-tone` so a highlighted menu row doesn't recolour its SVG paths (index.css). */
export const tone = (token: string | undefined) => (token ? { style: { color: `var(--${token})` }, "data-tone": "" } : {});
const effortTone = (effort: string | null) => tone(effort ? EFFORT_TONE[effort] : undefined);

/**
 * The composer's model chip, the same in a conversation and in a code session (as in Cursor, ChatGPT,
 * Claude): it reads « Opus 5.5 Élevé », and opens one menu with the fast mode, the context, the effort
 * and the model, each row saying its current value. Rows the model doesn't offer are left out.
 */
export function ModelMenu({
  groups,
  value,
  reasoning,
  onModel,
  onReasoning,
  open,
  onOpenChange,
  disabled,
}: {
  groups: MenuGroup[];
  /** The model it runs on; null: none known yet. */
  value: ModelChoice | null;
  reasoning: Reasoning;
  onModel: (choice: ModelChoice) => void;
  onReasoning: (next: Reasoning) => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  disabled?: boolean;
}) {
  const t = useT(messages);
  const tr = useT(reasoningMessages);
  const group = groups.find((g) => g.key === value?.group);
  const current = group?.models.find((m) => m.id === value?.id);
  // A model and its 1M variant are one row; the variant is picked under « Context ».
  const variants = current && group ? group.models.filter((m) => baseId(m.id) === baseId(current.id)) : [];
  const listed = (g: MenuGroup) => g.models.filter((m) => !m.id.endsWith(ONE_M) || !g.models.some((x) => x.id === baseId(m.id)));
  const name = (m: MenuModel) => (m.id.endsWith(ONE_M) ? m.label.replace(/,?\s*1M$/i, "") : m.label);

  const efforts = [...(current?.efforts ?? [])].sort((a, b) => effortRank(a) - effortRank(b));
  const fast = !!current?.fast;
  // A level the model no longer lists reads as its default, as the engine would run it.
  const effort = reasoning.effort && efforts.includes(reasoning.effort) ? reasoning.effort : null;
  const on = fast && reasoning.fast;
  const level = (e: string) => (e === DEFAULT ? tr.byDefault : (tr.levels[e] ?? e));
  const contextOf = (id: string) => (id.endsWith(ONE_M) ? t.oneM : t.standard);
  const settings = fast || variants.length > 1 || efforts.length > 0;

  if (!groups.some((g) => g.models.length)) return null;
  return (
    <DropdownMenu open={open} onOpenChange={onOpenChange}>
      <DropdownMenuTrigger render={<InputGroupButton size="sm" disabled={disabled} className="min-w-0 shrink-0" />}>
        {current?.logo}
        {current ? name(current) : t.model}
        {(effort || on) && (
          <span className="text-muted-foreground">
            {effort && <span {...effortTone(effort)}>{level(effort)}</span>}
            {effort && on && ", "}
            {on && <span {...tone(FAST_TONE)}>{t.fastShort}</span>}
          </span>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-64">
        {settings && (
          <>
            <DropdownMenuGroup>
              {fast && (
                <DropdownMenuItem closeOnClick={false} onClick={() => onReasoning({ effort, fast: !on })}>
                  <FlashIcon {...tone(FAST_TONE)} />
                  <span className="flex-1" {...tone(FAST_TONE)}>
                    {tr.fast}
                  </span>
                  <Switch checked={on} size="sm" tabIndex={-1} aria-hidden className="pointer-events-none data-checked:bg-state-running" />
                </DropdownMenuItem>
              )}
              {variants.length > 1 && current && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <LayersIcon />
                    <span className="flex-1">{t.context}</span>
                    <span className="text-muted-foreground">{contextOf(current.id)}</span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-40">
                    <DropdownMenuRadioGroup value={current.id} onValueChange={(id) => id !== current.id && onModel({ group: group!.key, id: id as string })}>
                      {[...variants]
                        .sort((a, b) => Number(a.id.endsWith(ONE_M)) - Number(b.id.endsWith(ONE_M)))
                        .map((m) => (
                          <DropdownMenuRadioItem key={m.id} value={m.id}>
                            <LayersIcon />
                            {contextOf(m.id)}
                          </DropdownMenuRadioItem>
                        ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              {efforts.length > 0 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>
                    <GaugeIcon {...effortTone(effort)} />
                    <span className="flex-1" {...effortTone(effort)}>
                      {tr.label}
                    </span>
                    <span className="text-muted-foreground" {...effortTone(effort)}>
                      {level(effort ?? DEFAULT)}
                    </span>
                  </DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="w-44">
                    <DropdownMenuRadioGroup value={effort ?? DEFAULT} onValueChange={(v) => onReasoning({ effort: v === DEFAULT ? null : (v as string), fast: on })}>
                      {[DEFAULT, ...efforts].map((e) => (
                        <DropdownMenuRadioItem key={e} value={e}>
                          <GaugeIcon {...effortTone(e === DEFAULT ? null : e)} />
                          <span {...effortTone(e === DEFAULT ? null : e)}>{level(e)}</span>
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <ModelsIcon />
            <span className="flex-1">{t.model}</span>
            <span className="max-w-32 truncate text-muted-foreground">{current ? name(current) : ""}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-96 w-64">
            <DropdownMenuRadioGroup
              value={value ? key(value) : ""}
              onValueChange={(v) => {
                const [g, id] = (v as string).split("\u0000") as [string, string];
                // The base model of a 1M pair: the same context as now when it has it.
                const pair = groups.find((x) => x.key === g)?.models.find((m) => m.id === `${id}${ONE_M}`);
                const next = current?.id.endsWith(ONE_M) && pair ? pair.id : id;
                if (g !== value?.group || next !== value?.id) onModel({ group: g, id: next });
              }}
            >
              {groups.map((g, i) => (
                <DropdownMenuGroup key={g.key}>
                  {i > 0 && <DropdownMenuSeparator />}
                  {g.heading && groups.length > 1 && <DropdownMenuLabel>{g.heading}</DropdownMenuLabel>}
                  {listed(g).map((m) => (
                    <DropdownMenuRadioItem
                      key={m.id}
                      // The row of a 1M pair stays checked whichever of the two runs.
                      value={key({ group: g.key, id: g.key === value?.group && current && baseId(current.id) === baseId(m.id) ? current.id : m.id })}
                      title={m.description}
                    >
                      {m.logo}
                      <span className="min-w-0 flex-1 truncate">{name(m)}</span>
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuGroup>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** A group's heading: its provider's logo and name. */
export function GroupHeading({ logo, label }: { logo: ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-1.5 [&_svg]:size-3.5">
      {logo}
      {label}
    </span>
  );
}
