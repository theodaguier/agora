import { AtIcon, PackageIcon, ClockIcon, CommandIcon, PlugIcon, type IconComponent } from "@/components/icons";
import { useEffect, useRef, type ReactNode } from "react";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { defineMessages, useT } from "@/i18n";
import { common } from "@agora/core/i18n";

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
  /** Replaces the kind's icon: what this command or action does. */
  icon?: IconComponent;
  run?: () => void;
};

const icons = { skill: PackageIcon, mcp: PlugIcon, routine: ClockIcon, command: CommandIcon, action: CommandIcon, agent: AtIcon, person: AtIcon };

const messages = defineMessages({
  en: {
    groups: { skill: "Skills", mcp: "Connectors", routine: "Routines", command: "Commands", action: "Actions", agent: "Bots", person: "Colleagues" } as Record<SlashItem["kind"], string>,
    commands: "Commands",
    empty: "No commands.",
    unavailable: "Commands unreachable for now.",
  },
  fr: {
    groups: { skill: "Compétences", mcp: "Connecteurs", routine: "Routines", command: "Commandes", action: "Actions", agent: "Bots", person: "Collègues" },
    commands: "Commandes",
    empty: "Aucune commande.",
    unavailable: "Commandes injoignables pour l'instant.",
  },
});

/**
 * "/" palette (session commands, skills, connectors, actions) and "@" palette (group bots, colleagues).
 * Focus stays in the input field: it drives the keyboard selection.
 */
export function SlashMenu(props: {
  items: SlashItem[];
  active: number;
  onHover: (i: number) => void;
  onPick: (item: SlashItem) => void;
  /** The bots' skills and connectors are still being fetched, or couldn't be. */
  status?: "loading" | "error";
}) {
  const list = useRef<HTMLDivElement>(null);
  const t = useT(messages);
  const c = useT(common);

  useEffect(() => {
    // On the first entry the list starts at its very top, its group's heading included.
    if (props.active === 0) list.current?.scrollTo({ top: 0 });
    else list.current?.querySelector<HTMLElement>('[data-selected="true"]')?.scrollIntoView({ block: "nearest" });
  }, [props.active, props.items]);

  return (
    // Always open while a "/" or "@" word is typed: the composer decides, so dismiss requests are ignored.
    <Popover open onOpenChange={() => {}}>
      {/* Anchor along the composer's top edge: the palette opens above it, as wide as it. */}
      <PopoverTrigger nativeButton={false} tabIndex={-1} render={<div aria-hidden className="pointer-events-none absolute inset-x-0 top-0" />} />
      <PopoverContent side="top" align="start" sideOffset={8} initialFocus={false} finalFocus={false} className="w-(--anchor-width) max-w-xl p-0">
        <Command
          shouldFilter={false}
          label={t.commands}
          value={props.items[props.active]?.key ?? ""}
          onValueChange={(key) => {
            const i = props.items.findIndex((item) => item.key === key);
            if (i >= 0) props.onHover(i);
          }}
        >
          <CommandList ref={list}>
            <CommandEmpty>{props.status === "loading" ? c.loading : props.status === "error" ? t.unavailable : t.empty}</CommandEmpty>
            {/* One group per kind, in the order they come: its name once above, not on every row. */}
            {groupsOf(props.items).map((g) => (
              <CommandGroup key={g.kind + g.items[0]!.key} heading={t.groups[g.kind]}>
                {g.items.map((item) => {
                  const Icon = item.icon ?? icons[item.kind];
                  return (
                    <CommandItem
                      key={item.key}
                      value={item.key}
                      // mousedown: keep focus in the input field.
                      onMouseDown={(e) => e.preventDefault()}
                      onSelect={() => props.onPick(item)}
                    >
                      {item.media ?? <Icon />}
                      <span className="shrink-0">{item.kind === "command" ? `/${item.name}` : item.name}</span>
                      <span className="min-w-0 flex-1 truncate text-muted-foreground">{item.description}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            ))}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/** Consecutive items of the same kind, together: the list's order (and its keyboard order) is kept. */
function groupsOf(items: SlashItem[]) {
  const groups: { kind: SlashItem["kind"]; items: SlashItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last?.kind === item.kind) last.items.push(item);
    else groups.push({ kind: item.kind, items: [item] });
  }
  return groups;
}
