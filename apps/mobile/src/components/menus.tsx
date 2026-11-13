import { common } from "@agora/core/i18n";
import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { Button as NativeButton, type ButtonProps as NativeButtonProps, Divider, Host, Menu as NativeMenu, Rectangle, Section, Toggle } from "@expo/ui/swift-ui";
import { accessibilityLabel as a11yLabel, buttonStyle, disabled as nativeDisabled, foregroundStyle, frame, menuIndicator } from "@expo/ui/swift-ui/modifiers";
import * as Haptics from "expo-haptics";
// The native view behind expo-router's Link.Menu: a UIContextMenuInteraction on one RN view. Without a
// next screen it is a plain iOS context menu (what Link.Menu does on iPad).
import { NativeLinkPreview, NativeLinkPreviewAction } from "expo-router/build/link/preview/native";
import { Button, Select } from "heroui-native";
import { useEffect, type ReactElement, type ReactNode } from "react";
import { ActionSheetIOS, StyleSheet, View } from "react-native";
import { useUniwind } from "uniwind";
import {
  AtIcon,
  BanIcon,
  BranchIcon,
  CameraIcon,
  CheckCircleIcon,
  CheckIcon,
  ClockIcon,
  CloseCircleIcon,
  CloseIcon,
  CopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  FileCodeIcon,
  FileIcon,
  FileImageIcon,
  FileTextIcon,
  FolderIcon,
  ForwardIcon,
  GridIcon,
  InfoIcon,
  KeyIcon,
  LogOutIcon,
  MailIcon,
  MoonIcon,
  MoreIcon,
  PaperclipIcon,
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RefreshIcon,
  ReplyIcon,
  SearchIcon,
  SlidersIcon,
  TaskListIcon,
  TrashIcon,
  UndoIcon,
  UserIcon,
  UsersIcon,
  UsersSlashIcon,
  WarningIcon,
  type IconComponent,
} from "@/components/icons";
import { tr } from "@/lib/i18n";
import { usePopoverInsets } from "@/lib/popover-insets";

/*
 * The app's menus are the system's own iOS menus (UIMenu), not drawn ones:
 * - LongPressMenu: a long press on some content (a message, a row) opens its context menu, the
 *   content lifted above it, as in Messages or Mail;
 * - TapMenu: a tap on some content (a row, an avatar) opens a pull-down menu anchored to it;
 * - MenuButton: an icon button ("+", "…") that opens a pull-down menu;
 * - OptionPicker: a value among several (HeroUI Select).
 * Menu items carry SF Symbols, as every iOS menu does; the triggers keep the house icons.
 */

/** House icon drawn on a MenuButton for the SF Symbol its callers name. */
const ICONS: Record<string, IconComponent> = {
  "play.circle": ClockIcon,
  "pause.circle": ClockIcon,
  "arrow.uturn.backward.circle": UndoIcon,
  "checkmark.circle": CheckCircleIcon,
  checkmark: CheckIcon,
  hammer: TaskListIcon,
  "stop.circle": CloseCircleIcon,
  flag: WarningIcon,
  pencil: PencilIcon,
  trash: TrashIcon,
  at: AtIcon,
  plus: PlusIcon,
  paperclip: PaperclipIcon,
  "ellipsis.circle": MoreIcon,
  ellipsis: MoreIcon,
  "photo.on.rectangle": FileImageIcon,
  photo: FileImageIcon,
  camera: CameraIcon,
  doc: FileIcon,
  link: ExternalLinkIcon,
  "text.bubble": ReplyIcon,
  pin: PinIcon,
  "pin.slash": PinOffIcon,
  "square.and.arrow.down": DownloadIcon,
  "arrowshape.turn.up.left": ReplyIcon,
  "arrowshape.turn.up.right": ForwardIcon,
  "doc.on.doc": CopyIcon,
  envelope: MailIcon,
  "envelope.badge": MailIcon,
  "envelope.open": CheckIcon,
  "moon.fill": MoonIcon,
  "moon.zzz": MoonIcon,
  "arrow.left.arrow.right": RefreshIcon,
  "arrow.clockwise": RefreshIcon,
  "rectangle.portrait.and.arrow.right": LogOutIcon,
  "square.grid.2x2": GridIcon,
  person: UserIcon,
  "person.badge.key": KeyIcon,
  "calendar.badge.clock": ClockIcon,
  xmark: CloseIcon,
  "xmark.circle": CloseCircleIcon,
  nosign: BanIcon,
  "plus.circle": PlusIcon,
  "arrow.uturn.backward": UndoIcon,
  "doc.text": FileTextIcon,
  "chevron.left.forwardslash.chevron.right": FileCodeIcon,
  magnifyingglass: SearchIcon,
  folder: FolderIcon,
  "person.2": UsersIcon,
  "person.2.fill": UsersIcon,
  "person.2.slash": UsersSlashIcon,
  "info.circle": InfoIcon,
  key: KeyIcon,
  checklist: TaskListIcon,
  "arrow.triangle.branch": BranchIcon,
  "slider.horizontal.3": SlidersIcon,
};

/** An SF Symbol name: the item's icon in the native menu. */
export type SFSymbol = string;

export type MenuAction = {
  label: string;
  icon?: SFSymbol;
  /** Kept for callers that drew a mark of their own; a native menu shows `icon` instead. */
  mark?: ReactNode;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** The current choice (a checkmark). */
  checked?: boolean;
};

/** Actions under a section title. */
export type MenuSection = { title?: string; actions: MenuEntry[] };

/** A submenu. */
export type MenuSubmenu = { submenu: string; icon?: SFSymbol; actions: MenuEntry[] };

/** An action, a section, a submenu or `"divider"` between groups; falsy entries are skipped. */
export type MenuEntry = MenuAction | MenuSection | MenuSubmenu | "divider" | false | null | undefined;

const sf = (name?: SFSymbol) => name as NativeButtonProps["systemImage"];

/** Entries split at their dividers, falsy ones dropped. */
function groups(entries: MenuEntry[]) {
  const out: Exclude<MenuEntry, "divider" | false | null | undefined>[][] = [[]];
  for (const e of entries) {
    if (!e) continue;
    if (e === "divider") out.push([]);
    else out[out.length - 1]!.push(e);
  }
  return out.filter((g) => g.length);
}

// --- UIContextMenu (long press) ---------------------------------------------------------------

function contextItems(entries: MenuEntry[], key: string): ReactNode[] {
  const all = groups(entries);
  const items = (group: (typeof all)[number], gk: string) =>
    group.map((e, i) => {
      const id = `${gk}.${i}`;
      if ("submenu" in e)
        return (
          <NativeLinkPreviewAction key={id} identifier={id} title={e.submenu} icon={e.icon} onSelected={() => {}}>
            {contextItems(e.actions, id)}
          </NativeLinkPreviewAction>
        );
      if ("actions" in e)
        return (
          <NativeLinkPreviewAction key={id} identifier={id} title={e.title ?? ""} displayInline onSelected={() => {}}>
            {contextItems(e.actions, id)}
          </NativeLinkPreviewAction>
        );
      return (
        <NativeLinkPreviewAction
          key={id}
          identifier={id}
          title={e.label}
          icon={e.icon}
          destructive={e.destructive}
          disabled={e.disabled}
          isOn={e.checked}
          onSelected={e.onPress}
        />
      );
    });
  if (all.length === 1) return items(all[0]!, key);
  // Each group between dividers is an inline submenu: iOS draws the separators.
  return all.map((g, i) => (
    <NativeLinkPreviewAction key={`${key}/${i}`} identifier={`${key}/${i}`} title="" displayInline onSelected={() => {}}>
      {items(g, `${key}/${i}`)}
    </NativeLinkPreviewAction>
  ));
}

/** A long press on `children` opens its iOS context menu (the system lifts it and plays the haptic); a tap keeps doing what it did. */
export function LongPressMenu({ actions, children }: { actions: MenuEntry[]; children: ReactElement }) {
  if (!actions.some(Boolean)) return children;
  return (
    <NativeLinkPreview nextScreenId={undefined} tabPath={undefined} style={{ display: "contents" }} disableForceFlatten>
      {/* The interaction goes on a single native view. */}
      <View collapsable={false}>{children}</View>
      <NativeLinkPreviewAction identifier="root" title="" onSelected={() => {}}>
        {contextItems(actions, "root")}
      </NativeLinkPreviewAction>
    </NativeLinkPreview>
  );
}

// --- Pull-down menu (tap) -----------------------------------------------------------------------

function pullDownItems(entries: MenuEntry[], key: string): ReactNode[] {
  return groups(entries).flatMap((group, gi, all) => {
    const items = group.map((e, i) => {
      const id = `${key}.${gi}.${i}`;
      if ("submenu" in e)
        return (
          <NativeMenu key={id} label={e.submenu} systemImage={e.icon}>
            {pullDownItems(e.actions, id)}
          </NativeMenu>
        );
      if ("actions" in e)
        return (
          <Section key={id} title={e.title}>
            {pullDownItems(e.actions, id)}
          </Section>
        );
      const modifiers = e.disabled ? [nativeDisabled(true)] : undefined;
      if (e.checked !== undefined)
        return <Toggle key={id} label={e.label} systemImage={sf(e.icon)} isOn={e.checked} onIsOnChange={() => e.onPress()} modifiers={modifiers} />;
      return <NativeButton key={id} label={e.label} systemImage={sf(e.icon)} role={e.destructive ? "destructive" : undefined} onPress={e.onPress} modifiers={modifiers} />;
    });
    return gi < all.length - 1 ? [...items, <Divider key={`${key}.${gi}-`} />] : items;
  });
}

/**
 * An iOS pull-down menu laid over `children`: the trigger looks the way the app draws it, the
 * menu is the system's. The SwiftUI layer takes the size of the content under it.
 */
function PullDown({ actions, label, children }: { actions: MenuEntry[]; label?: string; children: ReactNode }) {
  const { theme } = useUniwind();
  return (
    <View>
      <View pointerEvents="none">{children}</View>
      <Host style={StyleSheet.absoluteFill} colorScheme={theme === "dark" ? "dark" : "light"} ignoreSafeArea="all">
        <NativeMenu
          label={
            // Almost transparent: a fully clear shape takes no touches.
            <Rectangle modifiers={[foregroundStyle("#00000002"), frame({ maxWidth: Number.MAX_VALUE, maxHeight: Number.MAX_VALUE })]} />
          }
          modifiers={[buttonStyle("plain"), menuIndicator("hidden"), ...(label ? [a11yLabel(label)] : [])]}
        >
          {pullDownItems(actions, "root")}
        </NativeMenu>
      </Host>
    </View>
  );
}

/** A tap on `children` (a row, an avatar) opens the actions in an iOS pull-down menu. */
export function TapMenu({ actions, children, accessibilityLabel }: { actions: MenuEntry[]; children: ReactElement; accessibilityLabel?: string }) {
  if (!actions.some(Boolean)) return children;
  return (
    <PullDown actions={actions} label={accessibilityLabel}>
      {children}
    </PullDown>
  );
}

/** Flat list of a menu's actions, for the action sheet a programmatic open falls back to. */
function flatActions(entries: MenuEntry[]): MenuAction[] {
  return entries.flatMap((e) => (!e || e === "divider" ? [] : "actions" in e ? flatActions(e.actions) : [e]));
}

/**
 * An icon button ("+", "…") that opens an iOS pull-down menu. A native menu can't be opened from
 * code: `open` (the "/" menu opening the paperclip's) shows the same actions as an action sheet.
 */
export function MenuButton({
  icon,
  label,
  actions,
  open,
  onOpenChange,
  disabled,
  variant = "ghost",
}: {
  icon: SFSymbol;
  /** Read by VoiceOver; the button shows the icon alone. */
  label: string;
  actions: MenuEntry[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** `tertiary` in a header: a gray circle like the header's other buttons; `outline` on a gray surface. */
  variant?: "ghost" | "tertiary" | "outline";
  disabled?: boolean;
  /** Unused: the system places its menus. */
  placement?: "top" | "bottom";
}) {
  const Icon = ICONS[icon] ?? MoreIcon;
  useEffect(() => {
    if (!open) return;
    const list = flatActions(actions).filter((a) => !a.disabled);
    Haptics.selectionAsync().catch(() => {});
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: label,
        options: [...list.map((a) => a.label), tr(common).cancel],
        cancelButtonIndex: list.length,
        destructiveButtonIndex: list.flatMap((a, i) => (a.destructive ? [i] : [])),
      },
      (i) => {
        onOpenChange?.(false);
        list[i]?.onPress();
      },
    );
    // Opened once per request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const button = (
    <Button isIconOnly size="sm" variant={variant} accessibilityLabel={label} isDisabled={disabled}>
      <Icon size={20} className="text-foreground" />
    </Button>
  );
  if (disabled || !actions.some(Boolean)) return button;
  return (
    <PullDown actions={actions} label={label}>
      {button}
    </PullDown>
  );
}

type Option<T extends string> = { value: T; label: string };

/** Beyond this many options, the Select opens as a scrollable bottom sheet instead of a popover. */
const LONG_LIST = 8;

/** A value among several: a HeroUI Select showing the chosen value. */
export function OptionPicker<T extends string>({
  value,
  options,
  onChange,
  label,
  placeholder,
  className,
}: {
  value: T;
  options: Option<T>[];
  onChange: (value: T) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const selected = options.find((o) => o.value === value);
  const long = options.length > LONG_LIST;
  const insets = usePopoverInsets();
  const item = (o: Option<T>) => (
    <Select.Item key={o.value} value={o.value} label={o.label}>
      <Select.ItemLabel />
      <Select.ItemIndicator />
    </Select.Item>
  );
  return (
    <Select
      presentation={long ? "bottom-sheet" : "popover"}
      value={selected ? { value: selected.value, label: selected.label } : undefined}
      onValueChange={(o) => {
        if (o && !Array.isArray(o) && o.value !== value) {
          Haptics.selectionAsync().catch(() => {});
          onChange(o.value as T);
        }
      }}
    >
      <Select.Trigger accessibilityLabel={label} className={className}>
        <Select.Value placeholder={placeholder ?? label} numberOfLines={1} />
        <Select.TriggerIndicator />
      </Select.Trigger>
      <Select.Portal>
        <Select.Overlay />
        {long ? (
          <Select.Content presentation="bottom-sheet" snapPoints={["50%", "90%"]} enableOverDrag={false} enableDynamicSizing={false} contentContainerClassName="h-full">
            <Select.ListLabel>{label}</Select.ListLabel>
            <BottomSheetFlatList data={options} keyExtractor={(o: Option<T>) => o.value} renderItem={({ item: o }: { item: Option<T> }) => item(o)} initialNumToRender={20} />
          </Select.Content>
        ) : (
          <Select.Content presentation="popover" width={240} insets={insets}>
            {options.map(item)}
          </Select.Content>
        )}
      </Select.Portal>
    </Select>
  );
}
