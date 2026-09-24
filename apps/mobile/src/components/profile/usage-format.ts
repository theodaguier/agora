import { locale } from "@/lib/i18n";
import { dateFormat, numberFormat } from "@/lib/intl";

/* apps/web/src/components/Usage.tsx useFormat: number, token and cost formats, shared with the morning recap. */

const compact = numberFormat(locale, { notation: "compact", maximumFractionDigits: 1 });
const whole = numberFormat(locale);
const usd = numberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 2, minimumFractionDigits: 2 });
const usdFine = numberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumSignificantDigits: 2 });

export const format = {
  compact: (n: number) => compact.format(n),
  whole: (n: number) => whole.format(n),
  /** Small amounts keep two significant digits instead of rounding to 0.00. */
  cost: (n: number) => (n > 0 && n < 1 ? usdFine.format(n) : usd.format(n)),
  percent: (n: number) => numberFormat(locale, { style: "percent", maximumFractionDigits: n < 0.1 ? 1 : 0 }).format(n),
  bucket: (t: string, bucket: "hour" | "day" | "week" | "month") => {
    const [date, time] = t.split("T");
    const [y, m, d] = date!.split("-").map(Number);
    const [h] = (time ?? "00:00").split(":").map(Number);
    const at = new Date(y!, m! - 1, d, h);
    if (bucket === "hour") return dateFormat(locale, { hour: "numeric" }).format(at);
    if (bucket === "month") return dateFormat(locale, { month: "short", year: "2-digit" }).format(at);
    return dateFormat(locale, { day: "numeric", month: "short" }).format(at);
  },
};

/** apps/web/src/components/ProviderLogo.tsx providerName, for the few providers shown in the usage lists. */
const names: Record<string, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  "openai-codex": "OpenAI Codex",
  openrouter: "OpenRouter",
  google: "Google",
  gemini: "Google Gemini",
  mistral: "Mistral",
  deepseek: "DeepSeek",
  xai: "xAI",
  nous: "Nous Research",
  "claude-code": "Claude Code",
};
export const providerName = (provider: string) => names[provider.toLowerCase()] ?? provider;
