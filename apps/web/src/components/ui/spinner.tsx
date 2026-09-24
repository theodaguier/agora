import { cn } from "@/lib/utils"
import { LoaderIcon } from "@/components/icons";
import { defineMessages, useT } from "@/i18n"

const messages = defineMessages({ en: { loading: "Loading" }, fr: { loading: "Chargement" } })

function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useT(messages)
  return (
    <LoaderIcon data-slot="spinner" role="status" aria-label={t.loading} className={cn("size-4 animate-spin", className)} {...props} />
  )
}

export { Spinner }
