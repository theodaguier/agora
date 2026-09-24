import { intlLocale, useLocale } from "@/i18n";
import { dateFormat, numberFormat } from "./intl";

/** Number, token and cost formats of the usage screens; shared with the morning recap. */
export function useFormat() {
  const locale = intlLocale(useLocale());
  const compact = numberFormat({ notation: "compact", maximumFractionDigits: 1 }, locale);
  const whole = numberFormat(undefined, locale);
  const usd = numberFormat({ style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumFractionDigits: 2, minimumFractionDigits: 2 }, locale);
  const usdFine = numberFormat({ style: "currency", currency: "USD", currencyDisplay: "narrowSymbol", maximumSignificantDigits: 2 }, locale);
  return {
    compact: (n: number) => compact.format(n),
    whole: (n: number) => whole.format(n),
    /** Small amounts keep two significant digits instead of rounding to 0.00. */
    cost: (n: number) => (n > 0 && n < 1 ? usdFine.format(n) : usd.format(n)),
    percent: (n: number) => numberFormat({ style: "percent", maximumFractionDigits: n < 0.1 ? 1 : 0 }, locale).format(n),
    bucket: (t: string, bucket: "hour" | "day" | "week" | "month") => {
      const [date, time] = t.split("T");
      const [y, m, d] = date!.split("-").map(Number);
      const [h] = (time ?? "00:00").split(":").map(Number);
      const at = new Date(y!, m! - 1, d, h);
      if (bucket === "hour") return dateFormat({ hour: "numeric" }, locale).format(at);
      if (bucket === "month") return dateFormat({ month: "short", year: "2-digit" }, locale).format(at);
      return dateFormat({ day: "numeric", month: "short" }, locale).format(at);
    },
  };
}

