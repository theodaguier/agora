import { SplitIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { defineMessages, useT } from "@/i18n";
import { cn } from "@/lib/utils";

const messages = defineMessages({
  en: { beside: "Open beside" },
  fr: { beside: "Ouvrir à côté" },
});

/** Takes what a side panel shows out of the conversation, into a pane of its own beside it. */
export function BesideButton({ onClick, className }: { onClick: () => void; className?: string }) {
  const t = useT(messages);
  return (
    <Tooltip>
      <TooltipTrigger render={<Button variant="ghost" size="icon" aria-label={t.beside} onClick={onClick} className={cn("rounded-lg", className)} />}>
        <SplitIcon />
      </TooltipTrigger>
      <TooltipContent>{t.beside}</TooltipContent>
    </Tooltip>
  );
}
