import { effortRank, reasoning } from "@agora/core/i18n";
import { SettingsRow, SwitchRow } from "@/components/admin/ui";
import { OptionPicker } from "@/components/menus";
import { tr } from "@/lib/i18n";

/*
 * apps/web/src/components/ReasoningSettings.tsx: the thinking effort and fast mode of the chosen model, as
 * rows of a list group (under the model palette of a conversation, in the new code session form). Only the
 * levels the model lists, and the fast mode when it has one; nothing when it has neither.
 */

export type Reasoning = { effort: string | null; fast: boolean };

/** What the current model offers: its effort levels and whether it has a fast mode. */
export type ReasoningOffer = { efforts?: string[]; fast?: boolean };

/** Option value of the model's own effort ("default" is not a level any engine names). */
const DEFAULT = "default";

/** The model's levels, lowest first, with their names; the default one first. */
export function effortOptions(offer: ReasoningOffer | undefined) {
  const t = tr(reasoning);
  const efforts = [...(offer?.efforts ?? [])].sort((a, b) => effortRank(a) - effortRank(b));
  return efforts.length ? [{ value: DEFAULT, label: t.byDefault }, ...efforts.map((e) => ({ value: e, label: t.levels[e] ?? e }))] : [];
}

/** A level the model no longer lists reads as its default, as the engine would run it. */
export const effortOf = (offer: ReasoningOffer | undefined, value: Reasoning) => (value.effort && offer?.efforts?.includes(value.effort) ? value.effort : null);

/** The effort and fast mode kept when the model changes: the ones the new model has too. */
export const keptFor = (offer: ReasoningOffer | undefined, value: Reasoning): Reasoning => ({ effort: effortOf(offer, value), fast: value.fast && !!offer?.fast });

export function ReasoningRows({ offer, value, onChange }: { offer: ReasoningOffer | undefined; value: Reasoning; onChange: (next: Reasoning) => void }) {
  const t = tr(reasoning);
  const options = effortOptions(offer);
  const fast = !!offer?.fast;
  const effort = effortOf(offer, value);
  return (
    <>
      {options.length > 0 && (
        <SettingsRow label={t.effort}>
          <OptionPicker value={effort ?? DEFAULT} options={options} onChange={(v) => onChange({ effort: v === DEFAULT ? null : v, fast: fast && value.fast })} label={t.effort} />
        </SettingsRow>
      )}
      {fast && <SwitchRow title={t.fast} description={t.fastHelp} value={value.fast} onChange={(on) => onChange({ effort, fast: on })} />}
    </>
  );
}

/** Whether ReasoningRows would show anything for this model. */
export const hasReasoning = (offer: ReasoningOffer | undefined) => !!offer?.efforts?.length || !!offer?.fast;
