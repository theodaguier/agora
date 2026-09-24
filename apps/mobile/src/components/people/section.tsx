import { Button, ListGroup, Popover, PressableFeedback, Separator, Typography } from "heroui-native";
import { Children, forwardRef, Fragment, isValidElement, type ComponentProps, type ElementRef, type ReactNode } from "react";
import { View } from "react-native";
import { ChatQuestionIcon } from "@/components/icons";
import { haptic } from "@/lib/haptics";

/*
 * Grouped lists, composed as HeroUI's list-group example composes them
 * (heroui-native example/src/app/(home)/components/list-group.tsx): a muted header over the
 * ListGroup, a Separator between rows, rows in PressableFeedback when they open something.
 */

/**
 * A grouped section of an iOS settings-like screen: header (with an optional help Popover), a
 * ListGroup of rows separated by Separators, optional footer. Rows are the children (falsy ones are skipped).
 */
export function Section({
  title,
  help,
  footer,
  children,
  inset = "mx-4",
}: {
  title?: ReactNode;
  /** What the section is about, in a Popover opened from the header. */
  help?: { title: string; description: string; label: string };
  footer?: ReactNode;
  children: ReactNode;
  /** Separator margins: past the avatar when rows start with one. */
  inset?: string;
}) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View>
      {(!!title || !!help) && (
        <View className="mb-2 ms-2 flex-row items-center gap-1">
          {!!title && (
            <Typography type="body-sm" color="muted">
              {title}
            </Typography>
          )}
          {!!help && <HelpPopover {...help} />}
        </View>
      )}
      {rows.length > 0 && (
        <ListGroup className="overflow-hidden">
          {rows.map((row, i) => (
            <Fragment key={row.key ?? i}>
              {i > 0 && <Separator className={inset} />}
              {row}
            </Fragment>
          ))}
        </ListGroup>
      )}
      {!!footer && (
        <Typography type="body-xs" color="muted" className="mt-2 px-2">
          {footer}
        </Typography>
      )}
    </View>
  );
}

/** A row that only explains ("No routines."), in place of a section's rows. */
export function SectionNote({ children }: { children: ReactNode }) {
  return (
    <ListGroup.Item disabled>
      <ListGroup.ItemContent>
        <ListGroup.ItemDescription>{children}</ListGroup.ItemDescription>
      </ListGroup.ItemContent>
    </ListGroup.Item>
  );
}

type PressableItemProps = Omit<ComponentProps<typeof PressableFeedback>, "children" | "animation"> & {
  children: ReactNode;
  /** Classes of the ListGroup.Item inside (layout only). */
  itemClassName?: string;
};

/**
 * A ListGroup row that opens something: the list-group example's pressable row, with the iOS
 * Highlight (PressableFeedback › Scale › ListGroup.Item, then PressableFeedback.Highlight).
 * Takes the Pressable props (onPress, onLongPress…), so a Link `asChild` can drive it.
 */
export const PressableItem = forwardRef<ElementRef<typeof PressableFeedback>, PressableItemProps>(function PressableItem(
  { children, itemClassName, ...props },
  ref,
) {
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

/** A "?" that explains something in a HeroUI Popover (title and description), like the popover example. */
export function HelpPopover({ title, description, label }: { title: string; description: string; label: string }) {
  return (
    <Popover>
      <Popover.Trigger asChild>
        <Button isIconOnly size="sm" variant="ghost" accessibilityLabel={label}>
          <ChatQuestionIcon className="size-4 text-muted" />
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
