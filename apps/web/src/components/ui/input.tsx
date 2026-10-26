import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-8 w-full min-w-0 rounded-[10px] px-2.5 py-1 text-base tracking-[-0.05px] file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground md:text-[13px] border border-input bg-background shadow-[var(--relief-inset)] transition-[color,border-color,box-shadow] outline-none placeholder:text-subtle focus-visible:border-foreground/25 focus-visible:shadow-none focus-visible:ring-3 focus-visible:ring-foreground/5 disabled:pointer-events-none disabled:cursor-not-allowed disabled:border-black/6 disabled:bg-card disabled:text-subtle disabled:shadow-none aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/15 dark:disabled:border-white/6",
        className
      )}
      {...props}
    />
  )
}

export { Input }
