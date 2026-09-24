import { AtIcon, PackageIcon, ClockIcon, CommandIcon, PlugIcon } from "@/components/icons";
import { useEffect, useRef, type ReactNode } from "react";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { defineMessages, useT } from "@/i18n";

export type SlashItem = {
  key: string;
  /** command: a Hermes session command (/new, /compact…), shown with its slash. */
  kind: "skill" | "mcp" | "routine" | "command" | "action" | "agent" | "person";
  /** Routine: its Hermes job id. */
  id?: string;
  /** Group skill: the bot it belongs to. */
  agentId?: string;
  name: string;
  description: string;
  /** Replaces the kind's icon: a bot's or colleague's avatar. */
  media?: ReactNode;
  run?: () => void;
};

const icons = { skill: PackageIcon, mcp: PlugIcon, routine: ClockIcon, command: CommandIcon, action: CommandIcon, agent: AtIcon, person: AtIcon };

const messages = defineMessages({
  en: {
    kinds: { skill: "Skill", mcp: "Connector", routine: "Routine", command: "Command", action: "Action", agent: "Bot", person: "Colleague" } as Record<SlashItem["kind"], string>,
    commands: "Commands",
    empty: "No commands.",
  },
  fr: {
    kinds: { skill: "Compétence", mcp: "Connecteur", routine: "Routine", command: "Commande", action: "Action", agent: "Bot", person: "Collègue" },
    commands: "Commandes",
    empty: "Aucune commande.",
  },
});

/**
 * "/" palette (session commands, skills, connectors, actions) and "@" palette (group bots, colleagues).
 * Focus stays in the input field: it drives the keyboard selection.
 */
export function SlashMenu(props: { items: SlashItem[]; active: number; onHover: (i: number) => void; onPick: (item: SlashItem) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const t = useT(messages);

  useEffect(() => {
    list.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [props.active]);

  return (
    <Command
      shouldFilter={false}
      label={t.commands}
      value={props.items[props.active]?.key ?? ""}
      onValueChange={(key) => {
        const i = props.items.findIndex((item) => item.key === key);
        if (i >= 0) props.onHover(i);
      }}
      className="absolute bottom-full left-0 z-30 mb-2 size-auto w-full max-w-[560px] rounded-2xl! border border-border bg-popover p-1.5 shadow-2xl shadow-black/15 dark:bg-[oklch(0.17_0_0)] dark:shadow-black/60"
    >
      <CommandList ref={list} className="max-h-[calc(20rem-14px)]">
        <CommandEmpty>{t.empty}</CommandEmpty>
        <CommandGroup>
          {props.items.map((item) => {
            const Icon = icons[item.kind];
            return (
              <CommandItem
                key={item.key}
                value={item.key}
                // mousedown: keep focus in the input field.
                onMouseDown={(e) => e.preventDefault()}
                onSelect={() => props.onPick(item)}
                className="h-10 px-3 data-selected:bg-secondary data-selected:*:[svg]:text-muted-foreground"
              >
                {item.media ?? <Icon className="size-[18px] text-muted-foreground" strokeWidth={1.75} />}
                <span className="shrink-0">{item.kind === "command" ? `/${item.name}` : item.name}</span>
                <span className="min-w-0 flex-1 truncate text-sm text-subtle">{item.description}</span>
                <span className="shrink-0 text-sm text-muted-foreground">{t.kinds[item.kind]}</span>
              </CommandItem>
            );
          })}
        </CommandGroup>
      </CommandList>
    </Command>
  );
}
