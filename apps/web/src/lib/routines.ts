import { defineMessages, tr } from "@/i18n";
import { dateFormat, listFormat } from "@/lib/intl";
import type { Routine } from "@/lib/queries";

const messages = defineMessages({
  en: {
    daily: (time: string) => `Every day at ${time}`,
    weekdays: (time: string) => `Weekdays at ${time}`,
    weekly: (days: string, time: string) => `Every ${days} at ${time}`,
  },
  fr: {
    daily: (time: string) => `Tous les jours à ${time}`,
    weekdays: (time: string) => `En semaine à ${time}`,
    weekly: (days: string, time: string) => `Chaque ${days} à ${time}`,
  },
});

/** How the edit form sees a schedule: the common shapes, or Hermes' own syntax. */
export type Frequency =
  | { mode: "daily"; time: string }
  | { mode: "weekdays"; time: string }
  | { mode: "weekly"; time: string; days: number[] }
  | { mode: "custom"; expr: string };

const pad = (n: number) => String(n).padStart(2, "0");

export function parseFrequency(r: Pick<Routine, "cron" | "schedule">): Frequency {
  const [min, hour, dom, month, dow] = r.cron?.split(/\s+/) ?? [];
  const simple = /^\d+$/.test(min ?? "") && /^\d+$/.test(hour ?? "") && dom === "*" && month === "*";
  if (!simple) return { mode: "custom", expr: r.cron ?? r.schedule };
  const time = `${pad(Number(hour))}:${pad(Number(min))}`;
  if (dow === "*") return { mode: "daily", time };
  if (dow === "1-5") return { mode: "weekdays", time };
  if (/^[0-7](,[0-7])*$/.test(dow ?? "")) return { mode: "weekly", time, days: [...new Set(dow!.split(",").map((d) => Number(d) % 7))] };
  return { mode: "custom", expr: r.cron! };
}

/** What `hermes cron edit --schedule` receives. */
export function scheduleOf(f: Frequency) {
  if (f.mode === "custom") return f.expr.trim();
  const [hour, min] = f.time.split(":").map(Number);
  const dow = f.mode === "daily" ? "*" : f.mode === "weekdays" ? "1-5" : [...f.days].sort().join(",");
  return `${min} ${hour} * * ${dow}`;
}

/** Days of the week in the interface language, Monday first; value = cron day (0 = Sunday). */
export function weekdays(style: "long" | "short" = "long") {
  const format = dateFormat({ weekday: style });
  // 2000-01-02 is a Sunday.
  return [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: d, label: format.format(new Date(2000, 0, 2 + d)) }));
}

/** Common cron shapes phrased in the interface language; anything else keeps Hermes' own wording. */
export function scheduleLabel(r: Pick<Routine, "cron" | "schedule">) {
  const f = parseFrequency(r);
  if (f.mode === "custom") return r.schedule;
  const t = tr(messages);
  const [hour, min] = f.time.split(":").map(Number);
  const time = dateFormat({ hour: "2-digit", minute: "2-digit" }).format(new Date(2000, 0, 1, hour, min));
  if (f.mode === "daily") return t.daily(time);
  if (f.mode === "weekdays") return t.weekdays(time);
  const days = new Set(f.days);
  const names = weekdays().filter((d) => days.has(d.value)).map((d) => d.label);
  return t.weekly(listFormat({ type: "conjunction" }).format(names), time);
}
