import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-[10px] px-2.5 pt-[7px] pb-1.5 text-base tracking-[-0.05px] md:text-[13px] border border-input bg-background shadow-[var(--relief-inset)] transition-[color,border-color,box-shadow] outline-none placeholder:text-subtle focus-visible:border-foreground/25 focus-visible:shadow-none focus-visible:ring-3 focus-visible:ring-foreground/5 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-black/6 disabled:bg-card disabled:text-subtle disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 dark:disabled:border-white/6",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
