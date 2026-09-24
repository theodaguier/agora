import { common } from "@agora/core/i18n";
import { guessIntegrationType } from "@agora/core";
import * as Linking from "expo-linking";
import { useRouter } from "expo-router";
import { Button, Chip, ListGroup } from "heroui-native";
import { PressableRow } from "@/components/profile/settings";
import { defineMessages, tr } from "@/lib/i18n";
import { addHref, type Item } from "@/lib/marketplace";
import { InitialTile, IntegrationTile } from "./integration-type";
import { KIND_LABEL } from "@/components/marketplace/kind-label";

/* Row of apps/web/src/components/marketplace/Marketplace.tsx */

const t = defineMessages({
  en: { enabled: "Enabled", added: "Added" },
  fr: { enabled: "Activé", added: "Ajouté" },
});

/** Tile of an item: a connector shows its integration type, a skill or plugin its initial. */
export function ItemTile({ item, size = "md" }: { item: Item; size?: "md" | "lg" }) {
  return item.kind === "mcp" || item.kind === "registry" ? (
    <IntegrationTile type={item.type ?? guessIntegrationType(item.name, item.description)} server={item.name} size={size} />
  ) : (
    <InitialTile name={item.name} size={size} />
  );
}

/** An App Store–like row: tile, name, description, then "Add" (or what's already done). */
export function ItemRow({ item }: { item: Item }) {
  const router = useRouter();
  // An installed skill or registry server can't be added again: its row opens its page instead.
  const url = (item.kind === "skill" || item.kind === "registry") && item.url;
  const open = () => {
    if (!item.installed) router.push(addHref(item));
    else if (url) void Linking.openURL(url);
  };
  // What's already done, as a HeroUI Chip.
  const installed = item.installed ? (item.kind === "plugin" ? t.enabled : t.added) : null;
  return (
    <PressableRow onPress={open} disabled={item.installed && !url} accessibilityRole={item.installed && url ? "link" : "button"} accessibilityLabel={[item.name, KIND_LABEL[item.kind], item.description, installed].filter(Boolean).join(", ")}>
      <ListGroup.Item>
        <ListGroup.ItemPrefix>
          <ItemTile item={item} />
        </ListGroup.ItemPrefix>
        <ListGroup.ItemContent>
          {/* The section already says the kind: only the reader hears it. */}
          <ListGroup.ItemTitle numberOfLines={1}>{item.name}</ListGroup.ItemTitle>
          {!!item.description && <ListGroup.ItemDescription numberOfLines={2}>{item.description}</ListGroup.ItemDescription>}
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          {installed ? (
            <Chip size="sm" variant="soft" color="success">
              {installed}
            </Chip>
          ) : (
            // The row's press adds: the button shows it.
            <Button size="sm" variant="secondary">
              {tr(common).add}
            </Button>
          )}
        </ListGroup.ItemSuffix>
      </ListGroup.Item>
    </PressableRow>
  );
}
