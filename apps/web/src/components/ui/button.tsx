import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

/**
 * Figma « Bouton » (Agora · Composants): a pill in regular weight. default = Primaire (the bot's
 * colour in a conversation, ink elsewhere), secondary = Secondaire (grey), outline = Contour
 * (white, hairline), ghost = icon or text without fill, destructive = ghost in red.
 * Icon sizes are « Bouton rond ». Pressed shrinks to 0.96, except a menu or select trigger: the
 * popup is anchored to it and opens on press, so the shrink would shake it.
 */
const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center font-normal whitespace-nowrap transition-[color,background-color,box-shadow,transform] duration-150 outline-none select-none [&:not([aria-haspopup])]:active:scale-[0.96] focus-visible:ring-3 focus-visible:ring-ring/35 disabled:pointer-events-none disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-destructive/30 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:bg-primary/88",
        outline:
          "bg-background text-foreground inset-ring inset-ring-border hover:bg-secondary aria-expanded:bg-secondary",
        secondary:
          "bg-secondary text-foreground hover:bg-accent aria-expanded:bg-accent",
        ghost:
          "text-muted-foreground hover:bg-secondary hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-foreground",
        destructive:
          "text-destructive hover:bg-destructive/10 focus-visible:ring-destructive/30",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        /* M — 32 px */
        default:
          "h-8 gap-1.5 rounded-full px-3.5 text-sm has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-6 gap-1 rounded-full px-2.5 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-7 gap-1.5 rounded-full px-3 text-[13px]",
        /* L — 40 px */
        lg: "h-10 gap-2 rounded-full px-[18px] text-[15px]",
        icon: "size-8 rounded-full [&_svg:not([class*='size-'])]:size-[17px]",
        "icon-xs": "size-5 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-7 rounded-full [&_svg:not([class*='size-'])]:size-[18px]",
        "icon-lg": "size-9 rounded-full [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants>) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
