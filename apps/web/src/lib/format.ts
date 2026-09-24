import { defineMessages, tr } from "@/i18n";
import { numberFormat } from "@/lib/intl";

const units = defineMessages({
  en: { b: "B", kb: "KB", mb: "MB" },
  fr: { b: "o", kb: "Ko", mb: "Mo" },
});

export function formatSize(bytes: number) {
  const u = tr(units);
  if (bytes < 1024) return `${bytes} ${u.b}`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} ${u.kb}`;
  const mb = numberFormat({ minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(bytes / 1024 / 1024);
  return `${mb} ${u.mb}`;
}
