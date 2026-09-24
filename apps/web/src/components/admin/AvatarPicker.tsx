import { AgentAvatar } from "@/components/AgentAvatar";
import { avatarColors, avatarShapes, type AvatarShape } from "@/lib/agent-avatar";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { defineMessages, useT } from "@/i18n";

const messages = defineMessages<{ shapes: Record<AvatarShape, string>; shape: string; color: string }>({
  en: {
    shapes: { bean: "Bean", pill: "Pill", triangle: "Triangle", shield: "Shield", circle: "Circle", cloud: "Cloud", drop: "Drop" },
    shape: "Shape",
    color: "Color",
  },
  fr: {
    shapes: { bean: "Haricot", pill: "Gélule", triangle: "Triangle", shield: "Écusson", circle: "Cercle", cloud: "Nuage", drop: "Goutte" },
    shape: "Forme",
    color: "Couleur",
  },
});

/** Shape and color of an agent's creature. */
export function AvatarPicker(props: {
  shape: AvatarShape;
  color: string;
  onShapeChange: (shape: AvatarShape) => void;
  onColorChange: (color: string) => void;
  /** Centered under a large preview (setup wizard). */
  centered?: boolean;
  className?: string;
}) {
  const t = useT(messages);
  // Single value at a time: ignore deselecting the active item.
  const pick = <T,>(values: T[], apply: (v: T) => void) => values[0] !== undefined && apply(values[0]);

  return (
    <FieldGroup className={cn("gap-4", props.className)}>
      <Field>
        <FieldLabel className={cn("font-normal text-muted-foreground", props.centered && "justify-center")}>{t.shape}</FieldLabel>
        <ToggleGroup aria-label={t.shape} value={[props.shape]} onValueChange={(v) => pick(v as AvatarShape[], props.onShapeChange)} variant="outline" className={cn(props.centered && "justify-center")}>
          {(Object.keys(avatarShapes) as AvatarShape[]).map((s) => (
            <ToggleGroupItem key={s} value={s} aria-label={t.shapes[s]} title={t.shapes[s]} className="size-10 p-0">
              <AgentAvatar agent={{ avatar: { shape: s, color: props.color } }} className="size-6" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
      <Field>
        <FieldLabel className={cn("font-normal text-muted-foreground", props.centered && "justify-center")}>{t.color}</FieldLabel>
        <ToggleGroup aria-label={t.color} value={[props.color]} onValueChange={(v) => pick(v as string[], props.onColorChange)} spacing={2} className={cn(props.centered && "justify-center")}>
          {avatarColors.map((c) => (
            <ToggleGroupItem
              key={c}
              value={c}
              aria-label={c}
              className="size-7 min-w-7 rounded-full p-0 ring-offset-2 ring-offset-background aria-pressed:ring-2 aria-pressed:ring-ring"
              style={{ background: c }}
            />
          ))}
        </ToggleGroup>
      </Field>
    </FieldGroup>
  );
}
