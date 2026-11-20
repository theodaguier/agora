import { effortRank, reasoning as messages } from "@agora/core/i18n";
import { FlashIcon, GaugeIcon } from "@/components/icons";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { InputGroupButton } from "@/components/ui/input-group";
import { useT } from "@/i18n";

export type Reasoning = { effort: string | null; fast: boolean };

/** What the current model offers: its effort levels and whether it has a fast mode. */
export type ReasoningOffer = { efforts?: string[]; fast?: boolean };

/** Radio value of the model's own effort ("default" is not a level any engine names). */
const DEFAULT = "default";

/**
 * The thinking effort and fast mode of the model, in the composer's bar next to it (a conversation's and a
 * code session's): its chip says the level it runs with. Only the levels the model lists, and the fast mode
 * when it has one; nothing when it has neither.
 */
export function ReasoningPicker({ offer, value, onChange, disabled }: { offer: ReasoningOffer | undefined; value: Reasoning; onChange: (next: Reasoning) => void; disabled?: boolean }) {
  const t = useT(messages);
  const efforts = [...(offer?.efforts ?? [])].sort((a, b) => effortRank(a) - effortRank(b));
  const fast = !!offer?.fast;
  if (!efforts.length && !fast) return null;
  const level = (e: string) => (e === DEFAULT ? t.byDefault : (t.levels[e] ?? e));
  // A level the model no longer lists reads as its default, as the engine would run it.
  const effort = value.effort && efforts.includes(value.effort) ? value.effort : null;
  const on = fast && value.fast;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<InputGroupButton size="sm" aria-label={t.effort} disabled={disabled} className="shrink-0" />}>
        {efforts.length ? t.chip(level(effort ?? DEFAULT), on) : t.fast}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={8} className="w-64">
        {efforts.length > 0 && (
          <DropdownMenuGroup>
            <DropdownMenuLabel>{t.effort}</DropdownMenuLabel>
            <DropdownMenuRadioGroup value={effort ?? DEFAULT} onValueChange={(v) => onChange({ effort: v === DEFAULT ? null : (v as string), fast: on })}>
              {[DEFAULT, ...efforts].map((e) => (
                <DropdownMenuRadioItem key={e} value={e}>
                  <GaugeIcon />
                  {level(e)}
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        )}
        {efforts.length > 0 && fast && <DropdownMenuSeparator />}
        {fast && (
          <DropdownMenuCheckboxItem checked={on} onCheckedChange={(checked) => onChange({ effort, fast: checked })} className="items-start">
            <FlashIcon />
            <span className="flex min-w-0 flex-col gap-0.5">
              <span>{t.fast}</span>
              <span className="text-xs text-muted-foreground">{t.fastHelp}</span>
            </span>
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
