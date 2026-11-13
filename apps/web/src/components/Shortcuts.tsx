import { useQuery } from "@tanstack/react-query";
import { useState, type ReactElement, type ReactNode } from "react";
import { useNavigate, useParams, useRouteContext } from "@tanstack/react-router";
import { KeyboardIcon, TaskListIcon, PlusIcon, SettingsIcon, UserIcon } from "@/components/icons";
import { ConversationAvatar } from "@/components/ConversationAvatar";
import { conversationTitle } from "@/lib/participants";
import { OrgLogo } from "@/components/OrgLogo";
import { listTime } from "@/lib/dates";
import { useOrgName } from "@/lib/org";
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
    open: "Open",
    run: "Run",
    kinds: { bot: "Bot", group: "Group", person: "Colleague" },
    lastMessage: "Last message",
    members: "Members",
    shortcut: "Shortcut",
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
    tabs: "Code session tabs",
    nextTab: "Next tab",
    previousTab: "Previous tab",
    goToTab: "Tab 1 to 8, 9 for the last",
  },
  fr: {
    palette: "Palette de commandes",
    paletteHint: "Rechercher une conversation ou une action",
    placeholder: "Rechercher une conversation ou une action…",
    open: "Ouvrir",
    run: "Lancer",
    kinds: { bot: "Bot", group: "Groupe", person: "Collègue" },
    lastMessage: "Dernier message",
    members: "Membres",
    shortcut: "Raccourci",
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
    tabs: "Onglets des sessions de code",
    nextTab: "Onglet suivant",
    previousTab: "Onglet précédent",
    goToTab: "Onglet 1 à 8, 9 pour le dernier",
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

type PaletteAction = { id: string; label: string; icon: ReactNode; shortcut?: Shortcut; onSelect: () => void; keepOpen?: boolean };

/**
 * ⌘K, as in Raycast (Figma « Palette de commandes »): the results on the left, what the highlighted one
 * is on the right (a conversation: who, its last message; an action: its shortcut), and at the bottom
 * the space it acts in and what Enter does.
 */
function Palette({ open }: { open: boolean }) {
  const t = useT(messages);
  const navigate = useNavigate();
  const org = useOrgName();
  const { user } = useRouteContext({ from: "/app" });
  const { data: conversations = [] } = useQuery(conversationsQuery);
  const [highlighted, setHighlighted] = useState("");
  const run = (action: () => void) => () => {
    setOverlay(null);
    action();
  };
  const actions: PaletteAction[] = [
    { id: "new", label: t.newConversation, icon: <PlusIcon />, shortcut: shortcuts.newConversation, onSelect: () => navigate({ to: "/new" }) },
    { id: "tasks", label: t.tasks, icon: <TaskListIcon />, onSelect: () => navigate({ to: "/tasks" }) },
    { id: "settings", label: t.settings, icon: <SettingsIcon />, shortcut: shortcuts.settings, onSelect: () => openSettings() },
    { id: "profile", label: t.profile, icon: <UserIcon />, onSelect: () => openProfile(user.id) },
    { id: "help", label: t.help, icon: <KeyboardIcon />, shortcut: shortcuts.help, onSelect: () => setOverlay("help"), keepOpen: true },
  ];
  // Each item's value ends with its id (cmdk filters on the whole value): the highlighted one is found back from it.
  const idOf = (value: string) => value.slice(value.lastIndexOf(" ") + 1);
  const hid = idOf(highlighted.toLowerCase());
  const action = actions.find((a) => `action:${a.id}` === hid);
  const conversation = conversations.find((c) => c.id.toLowerCase() === hid);
  return (
    <CommandDialog open={open} onOpenChange={(o) => setOverlay(o ? "palette" : null)} title={t.palette} description={t.paletteHint} className="sm:max-w-3xl">
      <Command value={highlighted} onValueChange={setHighlighted}>
        <CommandInput placeholder={t.placeholder} />
        <div className="flex min-h-0">
          <CommandList className="min-w-0 flex-1 sm:max-w-sm sm:border-r">
            <CommandEmpty>{t.noResult}</CommandEmpty>
            {conversations.length > 0 && (
              <CommandGroup heading={t.conversations}>
                {conversations.map((c) => {
                  const name = conversationTitle(c, user.id);
                  return (
                    <CommandItem key={c.id} value={`${name} ${c.id}`} onSelect={run(() => navigate({ to: "/c/$conversationId", params: { conversationId: c.id } }))}>
                      <ConversationAvatar conversation={c} me={user.id} className="size-6" status="ring-popover" />
                      <span className="truncate">{name}</span>
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}
            <CommandGroup heading={t.actions}>
              {actions.map((a) => (
                <CommandItem key={a.id} value={`${a.label} action:${a.id}`} onSelect={a.keepOpen ? a.onSelect : run(a.onSelect)}>
                  {a.icon} {a.label}
                  {a.shortcut && (
                    <CommandShortcut>
                      <ShortcutKeys shortcut={a.shortcut} />
                    </CommandShortcut>
                  )}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
          {/* What the highlighted result is (large screens only). */}
          <div className="hidden min-w-0 flex-1 flex-col gap-4 p-5 sm:flex">
            {conversation ? (
              <>
                <div className="flex min-w-0 items-center gap-3">
                  <ConversationAvatar conversation={conversation} me={user.id} className="size-11" status="ring-popover" />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{conversationTitle(conversation, user.id)}</p>
                    <p className="text-sm text-muted-foreground">
                      {conversation.kind === "group" ? t.kinds.group : conversation.agents.length > 0 ? t.kinds.bot : t.kinds.person}
                    </p>
                  </div>
                </div>
                {conversation.preview?.text && <p className="line-clamp-4 text-sm text-muted-foreground">{conversation.preview.text}</p>}
                <dl className="flex flex-col text-sm">
                  <div className="flex justify-between gap-3 border-b py-2">
                    <dt className="text-muted-foreground">{t.lastMessage}</dt>
                    <dd className="tabular-nums">{listTime(new Date(conversation.lastAt))}</dd>
                  </div>
                  {conversation.kind === "group" && (
                    <div className="flex justify-between gap-3 border-b py-2">
                      <dt className="text-muted-foreground">{t.members}</dt>
                      <dd className="tabular-nums">{conversation.members.length + conversation.agents.length}</dd>
                    </div>
                  )}
                </dl>
              </>
            ) : action ? (
              <>
                <span className="flex size-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">{action.icon}</span>
                <p className="font-medium">{action.label}</p>
                {action.shortcut && (
                  <dl className="flex justify-between gap-3 border-b py-2 text-sm">
                    <dt className="text-muted-foreground">{t.shortcut}</dt>
                    <dd>
                      <ShortcutKeys shortcut={action.shortcut} />
                    </dd>
                  </dl>
                )}
              </>
            ) : null}
          </div>
        </div>
        {/* The space it acts in, and what Enter does. */}
        <div className="flex items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
          <OrgLogo className="size-4" />
          <span className="min-w-0 flex-1 truncate">{org}</span>
          <span className="font-medium text-foreground">{action ? t.run : t.open}</span>
          <Kbd>↵</Kbd>
        </div>
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
      title: t.tabs,
      rows: [
        [t.nextTab, shortcuts.nextTab],
        [t.previousTab, shortcuts.previousTab],
        [t.goToTab, { key: "1–9", ctrl: true }],
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
            <h3 className="text-sm font-medium text-muted-foreground">{s.title}</h3>
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
