import * as Haptics from "expo-haptics";
import { Card, Label, TagGroup } from "heroui-native";
import { View } from "react-native";
import { AgentAvatar } from "@/components/agent-avatar";
import { agentAccentColor } from "@agora/core";
import { avatarColors } from "@/lib/agents-admin";
import { defineMessages } from "@/lib/i18n";
import type { AvatarShape } from "@/lib/types";

/* apps/web/src/components/admin/AvatarPicker.tsx */

const t = defineMessages<{ shapes: Record<AvatarShape, string>; shape: string; color: string }>({
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

/**
 * An agent's clay mascot, picked by its colour: a single-choice tag group (a card of the grouped form)
 * whose tags are the mascots themselves. The shape stays in the data but is no longer drawn.
 */
export function AvatarPicker(props: {
  shape: AvatarShape;
  color: string;
  onShapeChange: (shape: AvatarShape) => void;
  onColorChange: (color: string) => void;
}) {
  const pick = <T,>(apply: (v: T) => void, keys: Set<string | number>, current: T) => {
    const v = [...keys][0] as T | undefined;
    if (v === undefined || v === current) return;
    void Haptics.selectionAsync();
    apply(v);
  };
  return (
    <Card>
      <Card.Body className="gap-4">
        <View className="gap-2">
          <Label>{t.color}</Label>
          <TagGroup
            selectionMode="single"
            selectedKeys={[agentAccentColor(props.color)]}
            onSelectionChange={(keys) => pick(props.onColorChange, keys, props.color)}
            accessibilityLabel={t.color}
          >
            <TagGroup.List>
              {avatarColors.map((c) => (
                <TagGroup.Item key={c} id={c} accessibilityLabel={c}>
                  <AgentAvatar agent={{ avatar: { color: c } }} size={32} />
                </TagGroup.Item>
              ))}
            </TagGroup.List>
          </TagGroup>
        </View>
      </Card.Body>
    </Card>
  );
}
