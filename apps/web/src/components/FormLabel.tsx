import type { ReactNode } from "react";
import { FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: { required: "(required)" },
  fr: { required: "(obligatoire)" },
});

/**
 * Field label: an asterisk for a required field (read as "obligatoire"
 * by screen readers), nothing otherwise.
 */
export function FormLabel({ htmlFor, required, children, className }: { htmlFor?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <FieldLabel htmlFor={htmlFor} className={cn("gap-1", className)}>
      {children}
      {/* Only required fields are marked; a field without an asterisk is optional. */}
      {required && <RequiredMark />}
    </FieldLabel>
  );
}

/** The asterisk alone, for labels that aren't a FormLabel (legends, generated fields). */
export function RequiredMark({ className }: { className?: string }) {
  const t = useT(messages);
  return (
    <>
      <span aria-hidden className={cn("text-destructive", className)}>
        *
      </span>
      <span className="sr-only">{t.required}</span>
    </>
  );
}

