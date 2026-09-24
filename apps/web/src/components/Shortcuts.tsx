import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { KeyboardIcon, TaskListIcon, PlusIcon, SlidersIcon, UserIcon } from "@/components/icons";
import { ConversationAvatar } from "@/components/ConversationAvatar";
import { conversationTitle } from "@/lib/participants";
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandShortcut } from "@/components/ui/command";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { defineMessages, useT } from "@/i18n";
import { openProfile } from "@/lib/profile";
import { conversationsQuery } from "@/lib/queries";
import { openSettings } from "@/lib/settings";
import { setOverlay, shortcutKeys, shortcuts, useOverlay, useShortcut, type Shortcut } from "@/lib/shortcuts";

const messages = defineMessages({
  en: {
    palette: "Command palette",
    paletteHint: "Search a conversation or an action",
    placeholder: "Search a conversation or an action…",
    noResult: "No results.",
    actions: "Actions",
    conversations: "Conversations",
    newConversation: "New conversation",
    tasks: "My tasks",
    settings: "Settings",
    profile: "My profile",
    help: "Keyboard shortcuts",
    navigation: "Navigation",
    previousConversation: "Previous conversation",
    nextConversation: "Next conversation",
    togglePanel: "Show or hide the side panel",
    toggleSidebar: "Show or hide the sidebar",
    searchConversation: "Search the conversation",
    composer: "Message",
    send: "Send",
    newLine: "New line",
    mention: "Mention someone",
    command: "Skills, connectors and routines",
    cancelReply: "Cancel the reply",
  },
  fr: {
    palette: "Palette de commandes",
    paletteHint: "Rechercher une conversation ou une action",
    placeholder: "Rechercher une conversation ou une action…",
    noResult: "Aucun résultat.",
    actions: "Actions",
    conversations: "Conversations",
    newConversation: "Nouvelle conversation",
    tasks: "Mes tâches",
    settings: "Paramètres",
    profile: "Mon profil",
    help: "Raccourcis clavier",
    navigation: "Navigation",
    previousConversation: "Conversation précédente",
    nextConversation: "Conversation suivante",
    togglePanel: "Afficher ou masquer le panneau latéral",
    toggleSidebar: "Afficher ou masquer la barre latérale",
    searchConversation: "Rechercher dans la conversation",
    composer: "Message",
    send: "Envoyer",
    newLine: "Nouvelle ligne",
    mention: "Mentionner quelqu'un",
    command: "Compétences, connecteurs et routines",
    cancelReply: "Annuler la réponse",
  },
});

/** App-wide shortcuts, the ⌘K palette and the list of shortcuts. Mounted once in the shell. */
export function Shortcuts() {
  const navigate = useNavigate();
  const { conversationId } = useParams({ strict: false }) as { conversationId?: string };
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const overlay = useOverlay();

  /** Same order as the sidebar; from outside a conversation, ↓ opens the first one and ↑ the last. */
  const step = (delta: 1 | -1) => {
    if (!conversations.length) return;
    const i = conversations.findIndex((c) => c.id === conversationId);
    const next = i === -1 ? (delta === 1 ? 0 : conversations.length - 1) : i + delta;
    const target = conversations[next];
    if (target) navigate({ to: "/c/$conversationId", params: { conversationId: target.id } });
  };

  useShortcut(shortcuts.palette, () => setOverlay(overlay === "palette" ? null : "palette"));
  useShortcut(shortcuts.help, () => setOverlay(overlay === "help" ? null : "help"));
  useShortcut(shortcuts.newConversation, () => navigate({ to: "/new" }));
  useShortcut(shortcuts.settings, () => openSettings());
  useShortcut(shortcuts.previousConversation, () => step(-1), !overlay);
  useShortcut(shortcuts.nextConversation, () => step(1), !overlay);

  return (
    <>
      <Palette open={overlay === "palette"} />
      <Help open={overlay === "help"} />
    </>
  );
}

/** Tooltip of an icon button: its label, then the keys that do the same thing. */
export function ShortcutTooltip({ label, shortcut, children }: { label: string; shortcut: Shortcut; children: ReactElement }) {
  return (
    <Tooltip>
      <TooltipTrigger render={children} />
      <TooltipContent>
        {label}
        <ShortcutKeys shortcut={shortcut} />
      </TooltipContent>
    </Tooltip>
  );
}

/** Keys of a shortcut, as keycaps. */
export function ShortcutKeys({ shortcut }: { shortcut: Shortcut }) {
  return (
    <KbdGroup>
      {shortcutKeys(shortcut).map((k) => (
        <Kbd key={k}>{k}</Kbd>
      ))}
    </KbdGroup>
  );
}

function Palette({ open }: { open: boolean }) {
  const t = useT(messages);
  const navigate = useNavigate();
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const run = (action: () => void) => () => {
    setOverlay(null);
    action();
  };
  return (
    <CommandDialog open={open} onOpenChange={(o) => setOverlay(o ? "palette" : null)} title={t.palette} description={t.paletteHint}>
      <Command>
        <CommandInput placeholder={t.placeholder} />
        <CommandList>
          <CommandEmpty>{t.noResult}</CommandEmpty>
          <CommandGroup heading={t.actions}>
            <CommandItem className="py-2" onSelect={run(() => navigate({ to: "/new" }))}>
              <PlusIcon className="text-muted-foreground" /> {t.newConversation}
              <CommandShortcut><ShortcutKeys shortcut={shortcuts.newConversation} /></CommandShortcut>
            </CommandItem>
            <CommandItem className="py-2" onSelect={run(() => navigate({ to: "/tasks" }))}>
              <TaskListIcon className="text-muted-foreground" /> {t.tasks}
            </CommandItem>
            <CommandItem className="py-2" onSelect={run(() => openSettings())}>
              <SlidersIcon className="text-muted-foreground" /> {t.settings}
              <CommandShortcut><ShortcutKeys shortcut={shortcuts.settings} /></CommandShortcut>
            </CommandItem>
            <CommandItem className="py-2" onSelect={run(() => openProfile(user.id))}>
              <UserIcon className="text-muted-foreground" /> {t.profile}
            </CommandItem>
            <CommandItem className="py-2" onSelect={() => setOverlay("help")}>
              <KeyboardIcon className="text-muted-foreground" /> {t.help}
              <CommandShortcut><ShortcutKeys shortcut={shortcuts.help} /></CommandShortcut>
            </CommandItem>
          </CommandGroup>
          {conversations.length > 0 && (
            <CommandGroup heading={t.conversations}>
              {conversations.map((c) => {
                const name = conversationTitle(c, user.id);
                return (
                  <CommandItem
                    key={c.id}
                    value={`${name} ${c.id}`}
                    className="py-1.5"
                    onSelect={run(() => navigate({ to: "/c/$conversationId", params: { conversationId: c.id } }))}
                  >
                    <ConversationAvatar conversation={c} me={user.id} className="size-6" status="ring-popover" />
                    <span className="truncate">{name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

function Help({ open }: { open: boolean }) {
  const t = useT(messages);
  const enter: Shortcut = { key: "Enter" };
  const sections: { title: string; rows: [string, Shortcut][] }[] = [
    {
      title: t.navigation,
      rows: [
        [t.palette, shortcuts.palette],
        [t.newConversation, shortcuts.newConversation],
        [t.previousConversation, shortcuts.previousConversation],
        [t.nextConversation, shortcuts.nextConversation],
        [t.toggleSidebar, shortcuts.toggleSidebar],
        [t.togglePanel, shortcuts.togglePanel],
        [t.searchConversation, shortcuts.searchConversation],
        [t.settings, shortcuts.settings],
        [t.help, shortcuts.help],
      ],
    },
    {
      title: t.composer,
      rows: [
        [t.send, enter],
        [t.newLine, { ...enter, shift: true }],
        [t.mention, { key: "@" }],
        [t.command, { key: "/" }],
        [t.cancelReply, { key: "Escape" }],
      ],
    },
  ];
  return (
    <Dialog open={open} onOpenChange={(o) => setOverlay(o ? "help" : null)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t.help}</DialogTitle>
        </DialogHeader>
        {sections.map((s) => (
          <section key={s.title} className="flex flex-col gap-1">
            <h3 className="text-[13px] font-medium text-muted-foreground">{s.title}</h3>
            {s.rows.map(([label, shortcut]) => (
              <div key={label} className="flex items-center justify-between gap-4 py-1">
                <span>{label}</span>
                <ShortcutKeys shortcut={shortcut} />
              </div>
            ))}
          </section>
        ))}
      </DialogContent>
    </Dialog>
  );
}
