import { defineMessages, intlLocale } from "./i18n";

/* apps/web/src/lib/format.ts */

const units = defineMessages({
  en: { b: "B", kb: "KB", mb: "MB" },
  fr: { b: "o", kb: "Ko", mb: "Mo" },
});

const megabytes = new Intl.NumberFormat(intlLocale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function formatSize(bytes: number) {
  const u = units;
  if (bytes < 1024) return `${bytes} ${u.b}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${u.kb}`;
  const mb = megabytes.format(bytes / 1024 / 1024);
  return `${mb} ${u.mb}`;
}
