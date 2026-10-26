import { AgentAvatar } from "@/components/AgentAvatar";
import { agentAccent, avatarColors, type AvatarShape } from "@/lib/agent-avatar";
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

/** An agent's clay mascot, picked by its colour (the shape is kept in the data but no longer drawn). */
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
        <FieldLabel className={cn("font-normal text-muted-foreground", props.centered && "justify-center")}>{t.color}</FieldLabel>
        <ToggleGroup aria-label={t.color} value={[agentAccent(props.color)]} onValueChange={(v) => pick(v as string[], props.onColorChange)} spacing={2} className={cn(props.centered && "justify-center")}>
          {avatarColors.map((c) => (
            <ToggleGroupItem
              key={c}
              value={c}
              aria-label={c}
              className="size-10 min-w-10 rounded-full p-0 ring-offset-2 ring-offset-background aria-pressed:ring-2 aria-pressed:ring-foreground"
            >
              <AgentAvatar agent={{ avatar: { color: c } }} className="size-10" />
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Field>
    </FieldGroup>
  );
}
