import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: { noResults: "No results." },
  fr: { noResults: "Aucun résultat." },
});

export type Option = { value: string; label: string };

/** Same surface as text fields (Input). */
export const fieldLook = "h-10 data-[size=default]:h-10 w-full rounded-lg border-input bg-secondary px-3 text-sm dark:bg-secondary dark:hover:bg-secondary";

/** Every half hour, plus `current` if it falls between; `end` adds midnight at the end of the day. */
export function timeOptions(current: string, end = false) {
  const at = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  const times = Array.from({ length: 48 }, (_, i) => at(i * 30));
  if (end) times.push("24:00");
  if (!times.includes(current)) times.push(current);
  return times.sort().map((v) => ({ value: v, label: v }));
}

/** Short list (language, access, time…): shadcn Select, controlled or uncontrolled value. */
export function OptionSelect({
  options,
  value,
  defaultValue,
  onValueChange,
  name,
  id,
  disabled,
  title,
  "aria-label": ariaLabel,
  className,
}: {
  options: Option[];
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  name?: string;
  id?: string;
  disabled?: boolean;
  title?: string;
  "aria-label"?: string;
  className?: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      defaultValue={defaultValue}
      name={name}
      disabled={disabled}
      onValueChange={(v) => v != null && onValueChange?.(v as string)}
    >
      <SelectTrigger id={id} aria-label={ariaLabel} title={title} className={cn(fieldLook, className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Long list (time zones, models): shadcn Combobox with search. */
export function SearchSelect({
  options,
  value,
  onValueChange,
  id,
  placeholder,
  label = (v) => v,
  className,
}: {
  options: string[];
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  label?: (value: string) => string;
  className?: string;
}) {
  const t = useT(messages);
  return (
    <Combobox items={options} value={value} onValueChange={(v) => v != null && onValueChange(v as string)} itemToStringLabel={(v) => label(v as string)}>
      {/* Selecting the text on focus lets typing replace the current value instead of appending to it. */}
      <ComboboxInput id={id} placeholder={placeholder} onFocus={(e) => e.currentTarget.select()} className={cn("w-full", className)} />
      <ComboboxContent>
        <ComboboxEmpty>{t.noResults}</ComboboxEmpty>
        <ComboboxList>
          {(item: string) => (
            <ComboboxItem key={item} value={item}>
              {label(item)}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}
