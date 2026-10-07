import { ChevronRightIcon, CloseIcon } from "@/components/icons";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardAction, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
import { BlockCard } from "@/components/views/block";
import type { Choices } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: { dismiss: "Dismiss question", options: "Suggested answers", placeholder: "Type your own answer", own: "Your own answer" },
  fr: { dismiss: "Ignorer la question", options: "Réponses proposées", placeholder: "Saisissez votre propre réponse", own: "Votre propre réponse" },
});

const letters = "ABCD";

/** Multiple-choice question asked by the bot: one option, or a free-form answer. */
export function ChoiceCard(props: { choices: Choices; onAnswer: (text: string) => void; onDismiss: () => void }) {
  const { choices, onAnswer, onDismiss } = props;
  const [custom, setCustom] = useState("");
  const t = useT(messages);

  // A–D shortcuts, matching the displayed letters, as long as the user isn't typing elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (e.metaKey || e.ctrlKey || e.altKey || target.closest("input, textarea, [contenteditable]")) return;
      const i = letters.indexOf(e.key.toUpperCase());
      const option = choices.options[i];
      if (!option) return;
      e.preventDefault();
      onAnswer(option.label);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [choices, onAnswer]);

  return (
    <BlockCard className="gap-3">
      <CardHeader>
        <CardTitle className="font-semibold">{choices.question}</CardTitle>
        {choices.hint && <CardDescription>{choices.hint}</CardDescription>}
        <CardAction>
          <Button variant="ghost" size="icon-sm" aria-label={t.dismiss} onClick={onDismiss} className="-mr-2 -mt-1">
            <CloseIcon />
          </Button>
        </CardAction>
      </CardHeader>

      <ItemGroup role="group" aria-label={t.options} className="gap-0 px-2">
        {choices.options.map((o, i) => (
          <Item
            key={o.label}
            render={<button type="button" onClick={() => onAnswer(o.label)} />}
            className="items-start gap-3 rounded-[10px] px-3 py-2.5 text-left hover:bg-muted focus-visible:bg-muted"
          >
            <ItemMedia className="pt-px">
              <Kbd className="size-[22px] rounded-md border bg-background text-[11px]">{letters[i]}</Kbd>
            </ItemMedia>
            <ItemContent className="gap-0">
              <ItemTitle className="line-clamp-none">{o.label}</ItemTitle>
              {o.description && <ItemDescription className="line-clamp-none text-[13px] leading-snug">{o.description}</ItemDescription>}
            </ItemContent>
            <ItemActions className="self-center opacity-0 group-hover/item:opacity-100 group-focus-visible/item:opacity-100">
              <ChevronRightIcon className="size-4 text-muted-foreground" />
            </ItemActions>
          </Item>
        ))}
      </ItemGroup>

      <CardFooter className="bg-transparent px-5 py-1.5">
        <form
          className="flex w-full items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const text = custom.trim();
            if (text) onAnswer(text);
          }}
        >
          <Input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder={t.placeholder}
            aria-label={t.own}
            className="h-9 flex-1 rounded-none border-0 bg-transparent px-0 focus-visible:ring-0"
          />
          <Kbd aria-hidden className="border bg-background">
            ↵
          </Kbd>
        </form>
      </CardFooter>
    </BlockCard>
  );
}
