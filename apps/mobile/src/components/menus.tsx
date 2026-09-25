import { BottomSheetFlatList } from "@gorhom/bottom-sheet";
import * as Haptics from "expo-haptics";
import { Button, Menu, PressableFeedback, Select, Separator, SubMenu, Typography } from "heroui-native";
import { cloneElement, Fragment, useState, type ReactElement } from "react";
import type { GestureResponderEvent } from "react-native";
import {
  AtIcon,
  BanIcon,
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
  PencilIcon,
  PinIcon,
  PinOffIcon,
  PlusIcon,
  RefreshIcon,
  ReplyIcon,
  SearchIcon,
  TaskListIcon,
  TrashIcon,
  UndoIcon,
  UserIcon,
  UsersIcon,
  UsersSlashIcon,
  WarningIcon,
  type IconComponent,
} from "@/components/icons";
import { usePopoverInsets } from "@/lib/popover-insets";

/*
 * The app's menus, all HeroUI Menu / SubMenu / Select, composed as HeroUI's own examples compose them
 * (heroui-native example/src/app/(home)/components/menu.tsx): a 16px muted icon before each title
 * (danger for a destructive one), Menu.Label over a group, a Separator between groups.
 * - LongPressMenu: a long press on some content (a message, a row);
 * - TapMenu: a tap on some content (a row, an avatar);
 * - MenuButton: an icon button ("+", "…");
 * - OptionPicker: a value among several (HeroUI Select).
 */

/** Icon names the callers use (SF Symbol names, from the iOS menus), drawn with the house icons. */
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
};

export type SFSymbol = string;

export type MenuAction = {
  label: string;
  icon?: SFSymbol;
  onPress: () => void;
  destructive?: boolean;
  disabled?: boolean;
  /** The current choice (a checkmark after the title). */
  checked?: boolean;
};

/** Actions under a Menu.Label. */
export type MenuSection = { title?: string; actions: MenuEntry[] };

/** A SubMenu. */
export type MenuSubmenu = { submenu: string; icon?: SFSymbol; actions: MenuEntry[] };

/** An action, a section, a submenu or `"divider"` between groups; falsy entries are skipped. */
export type MenuEntry = MenuAction | MenuSection | MenuSubmenu | "divider" | false | null | undefined;

function MenuIcon({ name, destructive }: { name?: SFSymbol; destructive?: boolean }) {
  const Icon = name ? ICONS[name] : undefined;
  return Icon ? <Icon size={16} className={destructive ? "text-danger" : "text-muted"} /> : null;
}

function Items({ entries }: { entries: MenuEntry[] }) {
  return entries.map((e, i) => {
    if (!e) return null;
    if (e === "divider") return <Separator key={`divider-${i}`} className="mx-2 my-1 opacity-75" />;
    if ("submenu" in e)
      return (
        <SubMenu key={`submenu-${e.submenu}`}>
          <SubMenu.Trigger textValue={e.submenu}>
            <SubMenu.TriggerIndicator />
            <Typography weight="medium" className="flex-1">
              {e.submenu}
            </Typography>
          </SubMenu.Trigger>
          <SubMenu.Content>
            <Items entries={e.actions} />
          </SubMenu.Content>
        </SubMenu>
      );
    if ("actions" in e)
      return (
        <Fragment key={`section-${e.title ?? i}`}>
          {!!e.title && <Menu.Label className="mb-1">{e.title}</Menu.Label>}
          <Items entries={e.actions} />
        </Fragment>
      );
    return (
      <Menu.Item key={e.label} variant={e.destructive ? "danger" : "default"} isDisabled={e.disabled} isSelected={e.checked} onPress={e.onPress}>
        <MenuIcon name={e.icon} destructive={e.destructive} />
        <Menu.ItemTitle>{e.label}</Menu.ItemTitle>
        {e.checked !== undefined && <Menu.ItemIndicator />}
      </Menu.Item>
    );
  });
}

/** `placement` "top" for a trigger that rides on the keyboard (the composer's "+"). */
function Content({ entries, placement }: { entries: MenuEntry[]; placement?: "top" | "bottom" }) {
  const insets = usePopoverInsets();
  return (
    <Menu.Portal>
      <Menu.Overlay />
      <Menu.Content presentation="popover" placement={placement} width={250} insets={insets}>
        <Items entries={entries} />
      </Menu.Content>
    </Menu.Portal>
  );
}

type LongPressable = { onPress?: unknown; onLongPress?: (e: GestureResponderEvent) => void };

/** A long press on `children` opens the actions (with a haptic); a tap keeps doing what it did. */
export function LongPressMenu({ actions, children }: { actions: MenuEntry[]; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  if (!actions.some(Boolean)) return children;
  const show = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    setOpen(true);
  };
  // Content that is pressable itself (a chip, a list row) takes the touch: the long press goes to it.
  const props = children.props as LongPressable;
  const content = props.onPress
    ? cloneElement(children as ReactElement<LongPressable>, {
        onLongPress: (e: GestureResponderEvent) => {
          props.onLongPress?.(e);
          show();
        },
      })
    : children;
  return (
    // Opened by the long press only: the trigger's own tap is ignored.
    <Menu isOpen={open} onOpenChange={(o) => !o && setOpen(false)}>
      <Menu.Trigger asChild>
        <PressableFeedback onLongPress={show}>{content}</PressableFeedback>
      </Menu.Trigger>
      <Content entries={actions} />
    </Menu>
  );
}

/** A tap on `children` (a row, an avatar) opens the actions. */
export function TapMenu({ actions, children, accessibilityLabel }: { actions: MenuEntry[]; children: ReactElement; accessibilityLabel?: string }) {
  if (!actions.some(Boolean)) return children;
  return (
    <Menu onOpenChange={(o) => o && Haptics.selectionAsync().catch(() => {})}>
      <Menu.Trigger asChild>
        <PressableFeedback accessibilityRole="button" accessibilityLabel={accessibilityLabel}>
          {children}
        </PressableFeedback>
      </Menu.Trigger>
      <Content entries={actions} />
    </Menu>
  );
}

/** An icon button ("+", "…") that opens the actions; `open`/`onOpenChange` to open it from elsewhere too. */
export function MenuButton({
  icon,
  label,
  actions,
  open,
  onOpenChange,
  disabled,
  variant = "ghost",
  placement,
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
  placement?: "top" | "bottom";
}) {
  const Icon = ICONS[icon] ?? MoreIcon;
  return (
    <Menu isOpen={open} onOpenChange={onOpenChange}>
      <Menu.Trigger asChild>
        <Button isIconOnly size="sm" variant={variant} accessibilityLabel={label} isDisabled={disabled}>
          <Icon size={20} className="text-foreground" />
        </Button>
      </Menu.Trigger>
      <Content entries={actions} placement={placement} />
    </Menu>
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
