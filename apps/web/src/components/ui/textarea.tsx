import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex field-sizing-content min-h-16 w-full rounded-lg border border-input bg-secondary px-3 py-2 text-base transition-colors outline-none placeholder:text-subtle focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive/50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
