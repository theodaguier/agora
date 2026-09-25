import { common } from "@agora/core/i18n";
import { Redirect } from "expo-router";
import {
  Alert,
  Button,
  InputGroup,
  ListGroup,
  Popover,
  PressableFeedback,
  SearchField,
  Separator,
  SkeletonGroup,
  Spinner,
  Switch,
  Typography,
  useToast,
} from "heroui-native";
import { Children, forwardRef, Fragment, useMemo, useState, type ComponentProps, type ElementRef, type ReactElement, type ReactNode } from "react";
import { RefreshControl, View, type AccessibilityActionEvent, type AccessibilityActionInfo } from "react-native";
import { Circle, Path } from "react-native-svg";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { createIcon, EyeIcon } from "@/components/icons";
import { circle, Hole } from "@/components/icons/create-icon";
import { haptic, withTap } from "@/lib/haptics";
import { defineMessages, tr } from "@/lib/i18n";
import { useAdminAccess } from "@/lib/agents-admin";
import { LongPressMenu, TapMenu, type MenuEntry, type SFSymbol } from "@/components/menus";
import { rowKey } from "@/lib/utils";

/* apps/web/src/components/admin/ui.tsx, as iOS grouped settings built from the HeroUI Native parts. */

const messages = defineMessages({
  en: { show: "Show", hide: "Hide", help: "More information" },
  fr: { show: "Afficher", hide: "Masquer", help: "En savoir plus" },
});

/** "i" in a circle, in the house icon style: the trigger of a help popover. */
const InfoIcon = createIcon("info", {
  fill: <Circle cx="12" cy="12" r="10" />,
  cut: (
    <>
      <Path d="M12 11v5.5" />
      <Hole d={circle(12, 7.75, 1.25)} />
    </>
  ),
});

/** The eye, struck through: the value is shown, a tap hides it. */
const EyeOffIcon = createIcon("eye-off", {
  fill: <Path d="M2 12c1.9-4.6 5.6-7.5 10-7.5s8.1 2.9 10 7.5c-1.9 4.6-5.6 7.5-10 7.5S3.9 16.6 2 12z" />,
  cut: (
    <>
      <Circle cx="12" cy="12" r="3.25" strokeWidth={1.5} />
      <Path d="M4 4l16 16" strokeWidth={4.5} />
    </>
  ),
  line: <Path d="M4 4l16 16" />,
});

/** Admin screens only: a member who lands here goes back to their profile. */
export function AdminGate({ children }: { children: ReactNode }) {
  const access = useAdminAccess();
  if (access === "denied") return <Redirect href="/profile" />;
  if (access === "pending") return <Spinner className="mt-24 self-center" />;
  return <>{children}</>;
}

/** Grouped background under a large title; pull to refresh when `onRefresh` is given. */
export function SettingsScroll({ children, onRefresh }: { children: ReactNode; onRefresh?: () => Promise<unknown> }) {
  const [refreshing, setRefreshing] = useState(false);
  return (
    <KeyboardAwareScrollView
      bottomOffset={24}
      contentInsetAdjustmentBehavior="automatic"
      keyboardDismissMode="interactive"
      keyboardShouldPersistTaps="handled"
      className="bg-background"
      contentContainerClassName="gap-7 px-4 pb-16 pt-2"
      refreshControl={
        onRefresh && (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              haptic.tap();
              setRefreshing(true);
              await onRefresh().catch(() => {});
              setRefreshing(false);
            }}
          />
        )
      }
    >
      {children}
    </KeyboardAwareScrollView>
  );
}

/** Intro under the large title, like the web's section header text. */
export function Intro({ children }: { children: ReactNode }) {
  return (
    <Typography.Paragraph type="body-sm" color="muted" className="px-4">
      {children}
    </Typography.Paragraph>
  );
}

/** Header of a grouped section (the list-group example's muted label above the group). */
export function SectionTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <Typography.Paragraph type="body-sm" color="muted" className={className ?? "px-4"}>
      {children}
    </Typography.Paragraph>
  );
}

/** Footnote under a grouped section. */
export function SectionFooter({ children }: { children: ReactNode }) {
  return (
    <Typography.Paragraph type="body-xs" color="muted" className="px-4">
      {children}
    </Typography.Paragraph>
  );
}

/** An "i" that explains something in a HeroUI Popover (title and description), like the popover example. */
export function InfoPopover({ title, description, label }: { title: string; description: string; label?: string }) {
  return (
    <Popover>
      <Popover.Trigger asChild>
        <Button isIconOnly size="sm" variant="ghost" accessibilityLabel={label ?? `${messages.help}: ${title}`}>
          <InfoIcon className="size-4 text-muted" />
        </Button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Overlay />
        <Popover.Content presentation="popover" width={300} placement="bottom" className="gap-1 px-5 py-4">
          <Popover.Title>{title}</Popover.Title>
          <Popover.Description>{description}</Popover.Description>
        </Popover.Content>
      </Popover.Portal>
    </Popover>
  );
}

/**
 * An inset grouped section: header (with an optional help popover or action), rows separated by
 * hairlines, footnote below. `null`/`false` children are skipped, so separators stay between visible rows.
 * `bare`: the children are already a group (a ListGroup of their own, a form card).
 */
export function Section({
  title,
  footer,
  children,
  action,
  help,
  bare,
}: {
  title?: string;
  footer?: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  bare?: boolean;
  /** Explanation of the section, behind an "i" next to its title. */
  help?: string;
}) {
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View className="gap-2">
      {(title || action || help) && (
        <View className="min-h-8 flex-row items-center justify-between gap-3 px-4">
          <View className="flex-1 flex-row items-center gap-1">
            {!!title && <SectionTitle className="shrink">{title}</SectionTitle>}
            {!!help && <InfoPopover title={title ?? ""} description={help} />}
          </View>
          {action}
        </View>
      )}
      {bare && children}
      {!bare && rows.length > 0 && (
        <ListGroup>
          {rows.map((row, i) => (
            <Fragment key={rowKey(row, i)}>
              {i > 0 && <Separator className="mx-4" />}
              {row}
            </Fragment>
          ))}
        </ListGroup>
      )}
      {typeof footer === "string" ? <SectionFooter>{footer}</SectionFooter> : footer}
    </View>
  );
}

type PressableRowProps = Omit<ComponentProps<typeof PressableFeedback>, "children" | "animation"> & {
  children: ReactNode;
  /** Classes of the ListGroup.Item inside (layout only). */
  itemClassName?: string;
};

/**
 * A ListGroup row that opens something: the list-group example's pressable row
 * (PressableFeedback › Scale › ListGroup.Item, then the iOS Highlight).
 * Takes the Pressable props (onPress, onLongPress…), so a Link `asChild` or a RowMenu can drive it.
 */
export const PressableRow = forwardRef<ElementRef<typeof PressableFeedback>, PressableRowProps>(function PressableRow({ children, itemClassName, ...props }, ref) {
  const { onPress } = props;
  return (
    <PressableFeedback
      ref={ref}
      animation={false}
      accessibilityRole="button"
      {...props}
      onPress={typeof onPress === "function" ? (e) => (haptic.select(), onPress(e)) : onPress}
    >
      <PressableFeedback.Scale>
        <ListGroup.Item disabled className={itemClassName}>
          {children}
        </ListGroup.Item>
      </PressableFeedback.Scale>
      <PressableFeedback.Highlight />
    </PressableFeedback>
  );
});

/** Props RowMenu hands to its row, so a long press (or a VoiceOver action) opens the menu. */
export type RowMenuTargetProps = {
  onPress?: () => void;
  onLongPress?: () => void;
  accessibilityActions?: readonly AccessibilityActionInfo[];
  onAccessibilityAction?: (event: AccessibilityActionEvent) => void;
};

/** A row with a switch, title and help (the web's horizontal Field + Switch). */
export function SwitchRow(
  rowProps: {
    title: string;
    description?: string;
    value: boolean;
    onChange: (value: boolean) => void;
    disabled?: boolean;
    prefix?: ReactNode;
  } & RowMenuTargetProps,
) {
  const props = { ...rowProps, onChange: (value: boolean) => (haptic.select(), rowProps.onChange(value)) };
  return (
    <ListGroup.Item
      disabled={props.disabled}
      onPress={withTap(() => props.onChange(!props.value))}
      onLongPress={props.onLongPress}
      accessibilityRole="switch"
      accessibilityLabel={props.title}
      accessibilityState={{ checked: props.value, disabled: props.disabled }}
      accessibilityActions={props.accessibilityActions}
      onAccessibilityAction={props.onAccessibilityAction}
    >
      {props.prefix && <ListGroup.ItemPrefix>{props.prefix}</ListGroup.ItemPrefix>}
      <ListGroup.ItemContent>
        <ListGroup.ItemTitle>{props.title}</ListGroup.ItemTitle>
        {!!props.description && <ListGroup.ItemDescription numberOfLines={2}>{props.description}</ListGroup.ItemDescription>}
      </ListGroup.ItemContent>
      <ListGroup.ItemSuffix>
        <Switch isSelected={props.value} isDisabled={props.disabled} onSelectedChange={props.onChange} />
      </ListGroup.ItemSuffix>
    </ListGroup.Item>
  );
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : tr(common).unknownError);

/** Error of a query (something that stays wrong while the screen is open), in a danger alert. */
export function ErrorAlert({ error, title }: { error: unknown; title?: string }) {
  if (!error && !title) return null;
  const message = error ? errorMessage(error) : undefined;
  return (
    <Alert status="danger">
      <Alert.Indicator />
      <Alert.Content>
        <Alert.Title>{title ?? message}</Alert.Title>
        {title && message && <Alert.Description>{message}</Alert.Description>}
      </Alert.Content>
    </Alert>
  );
}

/**
 * The outcome of an action (saved, deleted, sent, failed) in a HeroUI Toast, instead of text left on
 * the screen. `failed` takes the error of a mutation; `label` gives it a title above the message.
 */
export function useAdminToast() {
  const { toast } = useToast();
  return useMemo(
    () => ({
      success: (label?: string, description?: string) => (haptic.success(), toast.show({ variant: "success", label: label ?? tr(common).saved, description })),
      deleted: (label?: string) => (haptic.success(), toast.show({ variant: "success", label: label ?? tr(common).deleted })),
      info: (label: string, description?: string) => toast.show({ variant: "default", label, description }),
      failed: (error: unknown, label?: string) =>
        toast.show({ variant: "danger", label: label ?? errorMessage(error), description: label ? errorMessage(error) : undefined }),
    }),
    [toast],
  );
}

/** A secret value: the input-group example's password field, with its show / hide button. */
export function SecretInput({
  showLabel = messages.show,
  hideLabel = messages.hide,
  ...props
}: Omit<ComponentProps<typeof InputGroup.Input>, "secureTextEntry"> & { showLabel?: string; hideLabel?: string }) {
  const [shown, setShown] = useState(false);
  return (
    <InputGroup>
      <InputGroup.Input autoCapitalize="none" autoCorrect={false} spellCheck={false} textContentType="none" {...props} secureTextEntry={!shown} />
      <InputGroup.Suffix>
        <PressableFeedback hitSlop={20} accessibilityRole="button" accessibilityLabel={shown ? hideLabel : showLabel} onPress={withTap(() => setShown((s) => !s))}>
          {shown ? <EyeOffIcon size={16} className="text-field-placeholder" /> : <EyeIcon size={16} className="text-field-placeholder" />}
        </PressableFeedback>
      </InputGroup.Suffix>
    </InputGroup>
  );
}

/** A search field over a list (the search-field example: icon, input, clear button). */
export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return (
    <SearchField value={value} onChange={onChange}>
      <SearchField.Group>
        <SearchField.SearchIcon />
        <SearchField.Input placeholder={placeholder} accessibilityLabel={placeholder} autoCorrect={false} returnKeyType="search" />
        <SearchField.ClearButton />
      </SearchField.Group>
    </SearchField>
  );
}

/** Placeholder rows while a list loads (the skeleton example's list rows). */
export function LoadingRows({ rows = 3, avatar = true }: { rows?: number; avatar?: boolean }) {
  return (
    <ListGroup>
      {Array.from({ length: rows }, (_, i) => (
        <Fragment key={i}>
          {i > 0 && <Separator className="mx-4" />}
          <SkeletonGroup isLoading isSkeletonOnly className="flex-row items-center gap-3 px-4 py-3">
            {avatar && <SkeletonGroup.Item className="size-10 rounded-full" />}
            <View className="flex-1 gap-2">
              <SkeletonGroup.Item className="h-4 w-1/2 rounded-md" />
              <SkeletonGroup.Item className="h-3 w-3/4 rounded-md" />
            </View>
          </SkeletonGroup>
        </Fragment>
      ))}
    </ListGroup>
  );
}

/** SF Symbol of a menu action. */
export type { SFSymbol } from "@/components/menus";

export type RowAction = { label: string; icon?: SFSymbol; destructive?: boolean; disabled?: boolean; onPress: () => void };

/**
 * The actions of a row, in a HeroUI Menu: on a long press, or on a tap with `openOnPress`
 * (rows whose only use is these actions). `items`: entries shown before the actions (a submenu).
 */
export function RowMenu({ actions, items, openOnPress, children }: { actions: RowAction[]; items?: MenuEntry[]; openOnPress?: boolean; children: ReactElement }) {
  const entries: MenuEntry[] = [...(items ?? []), ...(items?.length && actions.length ? ["divider" as const] : []), ...actions];
  return openOnPress ? <TapMenu actions={entries}>{children}</TapMenu> : <LongPressMenu actions={entries}>{children}</LongPressMenu>;
}
