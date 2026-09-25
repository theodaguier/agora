import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon, CloseCircleIcon, InfoIcon, LoaderIcon, WarningIcon } from "@/components/icons"
import { useIsDark } from "@/lib/theme"

const Toaster = ({ ...props }: ToasterProps) => {
  const dark = useIsDark()

  return (
    <Sonner
      theme={dark ? "dark" : "light"}
      className="toaster group"
      icons={{
        success: (
          <CheckCircleIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <WarningIcon className="size-4" />
        ),
        error: (
          <CloseCircleIcon className="size-4" />
        ),
        loading: (
          <LoaderIcon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
