import { useState } from "react";
import { enUS, fr } from "react-day-picker/locale";
import { CalendarIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { defineMessages, useLocale, useT } from "@/i18n";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: { pick: "Pick a date", time: "Time" },
  fr: { pick: "Choisir une date", time: "Heure" },
});

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * A date and its time, as shadcn's « Date and time picker »: a button that says it in words
 * (« jeu. 12 nov., 10:00 »), opening the calendar with the hour under it. `value`: an ISO instant.
 */
export function DateTimePicker({
  id,
  value,
  onChange,
  disabled,
  dateOnly,
  className,
}: {
  id?: string;
  value?: string;
  onChange: (iso: string) => void;
  disabled?: boolean;
  /** A day without an hour (a task's due date): `value` and `onChange` as « 2026-11-14 ». */
  dateOnly?: boolean;
  className?: string;
}) {
  const t = useT(messages);
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const date = value ? new Date(dateOnly && /^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00` : value) : undefined;
  const valid = date && !Number.isNaN(date.getTime()) ? date : undefined;
  const label = valid
    ? new Intl.DateTimeFormat(locale, dateOnly ? { weekday: "short", day: "numeric", month: "short" } : { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(valid)
    : null;

  // A day picked keeps the time already set (9:00 when there was none); a time typed keeps the day.
  const pickDay = (day: Date | undefined) => {
    if (!day) return;
    if (dateOnly) {
      onChange(`${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`);
      setOpen(false);
      return;
    }
    const next = new Date(day);
    next.setHours(valid?.getHours() ?? 9, valid?.getMinutes() ?? 0, 0, 0);
    onChange(next.toISOString());
  };
  const pickTime = (time: string) => {
    const [h, m] = time.split(":").map(Number);
    if (h === undefined || m === undefined || Number.isNaN(h) || Number.isNaN(m)) return;
    const next = new Date(valid ?? Date.now());
    next.setHours(h, m, 0, 0);
    onChange(next.toISOString());
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button id={id} type="button" variant="outline" disabled={disabled} className={cn("w-full justify-start gap-2 font-normal", !label && "text-muted-foreground", className)} />}
      >
        <CalendarIcon className="text-muted-foreground" />
        {label ?? t.pick}
      </PopoverTrigger>
      {/* Opened with the mouse, no ring on the month's arrow before a key is pressed. */}
      <PopoverContent align="start" initialFocus={(type) => type === "keyboard"} className="w-auto p-0">
        <Calendar mode="single" locale={locale === "fr" ? fr : enUS} selected={valid} defaultMonth={valid} onSelect={pickDay} />
        {!dateOnly && <Separator />}
        <div className={cn("flex items-center justify-between gap-3 px-3 py-2.5", dateOnly && "hidden")}>
          <label htmlFor={id && `${id}-time`} className="text-ui text-muted-foreground">
            {t.time}
          </label>
          <Input
            id={id && `${id}-time`}
            type="time"
            step={300}
            value={valid ? `${pad(valid.getHours())}:${pad(valid.getMinutes())}` : ""}
            onChange={(e) => pickTime(e.target.value)}
            className="h-8 w-28 appearance-none bg-background text-ui [&::-webkit-calendar-picker-indicator]:hidden [&::-webkit-calendar-picker-indicator]:appearance-none"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
