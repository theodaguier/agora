import { ArrowUpIcon, ChatQuestionIcon, ChevronRightIcon, CloseIcon } from "@/components/icons";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Item, ItemActions, ItemContent, ItemDescription, ItemGroup, ItemTitle } from "@/components/ui/item";
import { BlockCard, BlockHeader } from "@/components/views/block";
import type { Choices } from "@/lib/api";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages({
  en: { dismiss: "Dismiss question", options: "Suggested answers", placeholder: "Or write your answer", own: "Your answer", send: "Send", key: (k: string) => `Key ${k}` },
  fr: { dismiss: "Ignorer la question", options: "Réponses proposées", placeholder: "Ou écris ta réponse", own: "Ta réponse", send: "Envoyer", key: (k: string) => `Touche ${k}` },
});

const letters = "ABCD";

/**
 * Multiple-choice question asked by the bot: one option, or a free-form answer. The options are plain
 * rows (no letter tiles); their A–D keys are said in each row's tooltip.
 */
export function ChoiceCard(props: { choices: Choices; onAnswer: (text: string) => void; onDismiss: () => void }) {
  const { choices, onAnswer, onDismiss } = props;
  const [custom, setCustom] = useState("");
  const t = useT(messages);

  // A–D shortcuts, in the options' order, as long as the user isn't typing elsewhere.
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
    <BlockCard>
      <BlockHeader
        icon={<ChatQuestionIcon className="size-4" />}
        title={choices.question}
        description={choices.hint || undefined}
        action={
          <Button variant="ghost" size="icon-sm" aria-label={t.dismiss} onClick={onDismiss}>
            <CloseIcon />
          </Button>
        }
      />
      <CardContent>
        <ItemGroup aria-label={t.options}>
          {choices.options.map((o, i) => (
            <Item key={o.label} variant="outline" render={<button type="button" title={t.key(letters[i]!)} aria-keyshortcuts={letters[i]} onClick={() => onAnswer(o.label)} />}>
              <ItemContent>
                <ItemTitle>{o.label}</ItemTitle>
                {o.description && <ItemDescription>{o.description}</ItemDescription>}
              </ItemContent>
              <ItemActions>
                <ChevronRightIcon className="text-muted-foreground" />
              </ItemActions>
            </Item>
          ))}
        </ItemGroup>
      </CardContent>
      <CardFooter>
        <form
          className="w-full"
          onSubmit={(e) => {
            e.preventDefault();
            const text = custom.trim();
            if (text) onAnswer(text);
          }}
        >
          <InputGroup>
            <InputGroupInput value={custom} onChange={(e) => setCustom(e.target.value)} placeholder={t.placeholder} aria-label={t.own} />
            <InputGroupAddon align="inline-end">
              <InputGroupButton type="submit" variant="default" size="icon-xs" aria-label={t.send} disabled={!custom.trim()}>
                <ArrowUpIcon />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        </form>
      </CardFooter>
    </BlockCard>
  );
}
