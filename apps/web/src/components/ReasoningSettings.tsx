import { effortRank, reasoning as messages } from "@agora/core/i18n";
import { FlashIcon, GaugeIcon } from "@/components/icons";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { useT } from "@/i18n";

export type Reasoning = { effort: string | null; fast: boolean };

/** What the current model offers: its effort levels and whether it has a fast mode. */
export type ReasoningOffer = { efforts?: string[]; fast?: boolean };

/** Select value of the model's own effort ("default" is not a level any engine names). */
const DEFAULT = "default";

/**
 * The thinking effort and fast mode of the chosen model, at the foot of the model picker (the conversation's
 * and a code session's), so the composer's bar keeps a single chip for the model. Only the levels the model
 * lists, and the fast mode when it has one; nothing when it has neither.
 */
export function ReasoningSettings({ offer, value, onChange }: { offer: ReasoningOffer | undefined; value: Reasoning; onChange: (next: Reasoning) => void }) {
  const t = useT(messages);
  const efforts = [...(offer?.efforts ?? [])].sort((a, b) => effortRank(a) - effortRank(b));
  const fast = !!offer?.fast;
  if (!efforts.length && !fast) return null;
  const level = (e: string) => (e === DEFAULT ? t.byDefault : (t.levels[e] ?? e));
  // A level the model no longer lists reads as its default, as the engine would run it.
  const effort = value.effort && efforts.includes(value.effort) ? value.effort : null;
  return (
    <ItemGroup className="border-t border-border p-1">
      {efforts.length > 0 && (
        <Item size="xs">
          <ItemMedia variant="icon">
            <GaugeIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{t.effort}</ItemTitle>
          </ItemContent>
          <ItemActions>
            <Select value={effort ?? DEFAULT} onValueChange={(v) => v && onChange({ effort: v === DEFAULT ? null : v, fast: fast && value.fast })}>
              <SelectTrigger size="sm" aria-label={t.effort}>
                <SelectValue>{(v: string) => level(v)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {[DEFAULT, ...efforts].map((e) => (
                  <SelectItem key={e} value={e}>
                    {level(e)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </ItemActions>
        </Item>
      )}
      {fast && (
        <Item size="xs" render={<label />}>
          <ItemMedia variant="icon">
            <FlashIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle>{t.fast}</ItemTitle>
            <ItemDescription>{t.fastHelp}</ItemDescription>
          </ItemContent>
          <ItemActions>
            <Switch size="sm" checked={value.fast} onCheckedChange={(checked) => onChange({ effort, fast: checked })} />
          </ItemActions>
        </Item>
      )}
    </ItemGroup>
  );
}
