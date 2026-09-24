import { CloseIcon } from "@/components/icons";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Item, ItemContent, ItemDescription, ItemGroup, ItemMedia, ItemTitle } from "@/components/ui/item";
import { Kbd } from "@/components/ui/kbd";
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
    <div className="w-full max-w-[min(680px,88%)] rounded-2xl bg-secondary p-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium leading-snug">{choices.question}</p>
          {choices.hint && <p className="mt-0.5 text-[15px] leading-snug text-muted-foreground">{choices.hint}</p>}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label={t.dismiss} onClick={onDismiss} className="-mr-1 -mt-0.5 rounded-lg hover:bg-accent">
          <CloseIcon />
        </Button>
      </div>

      <ItemGroup role="group" aria-label={t.options} className="mt-3 gap-0 divide-y divide-border overflow-hidden rounded-xl border border-border">
        {choices.options.map((o, i) => (
          <Item
            key={o.label}
            render={<button type="button" onClick={() => onAnswer(o.label)} />}
            className="gap-3 rounded-none border-0 px-2.5 py-2.5 text-left hover:bg-accent"
          >
            <ItemMedia>
              <Kbd className="size-6 rounded-md bg-accent text-[11px]">{letters[i]}</Kbd>
            </ItemMedia>
            <ItemContent className="gap-0">
              <ItemTitle className="line-clamp-none text-[15px] font-normal">{o.label}</ItemTitle>
              {o.description && <ItemDescription className="line-clamp-none text-[15px] leading-snug">{o.description}</ItemDescription>}
            </ItemContent>
          </Item>
        ))}
      </ItemGroup>

      <form
        className="mt-3"
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
          className="rounded-xl border-transparent bg-background px-3.5 text-[15px] placeholder:text-muted-foreground focus-visible:border-border md:text-[15px]"
        />
      </form>
    </div>
  );
}
