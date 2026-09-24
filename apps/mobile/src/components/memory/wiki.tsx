import { Link } from "expo-router";
import { ListGroup, Surface } from "heroui-native";
import { wikiPageHref, type WikiNode, type WikiNodeType } from "@/lib/memory";
import { cn } from "@/lib/utils";

/* The legend and the pages of apps/web/src/components/admin/WikiMemory.tsx */

/**
 * The color of a page type, as close as HeroUI's theme tokens get to the web graph's colors
 * (lib/memory NODE_COLORS): a small round Surface.
 */
const NODE_TOKEN: Record<WikiNodeType, string> = {
  agent: "bg-foreground",
  entity: "bg-success",
  concept: "bg-muted",
  comparison: "bg-accent",
  query: "bg-danger",
  session: "bg-link",
  raw: "bg-default",
  ghost: "bg-warning",
};

export function NodeDot({ type, size = "sm" }: { type: WikiNodeType; size?: "sm" | "md" }) {
  return <Surface accessibilityElementsHidden className={cn("rounded-full p-0 shadow-none", size === "sm" ? "size-2.5" : "size-3", NODE_TOKEN[type])} />;
}

/** A page of the second brain: opens its reader; a long press peeks at it. */
export function WikiRow({ node }: { node: WikiNode }) {
  return (
    <Link href={wikiPageHref(node.id)} asChild>
      <Link.Trigger>
        <ListGroup.Item>
          <ListGroup.ItemPrefix>
            <NodeDot type={node.type} size="md" />
          </ListGroup.ItemPrefix>
          <ListGroup.ItemContent>
            <ListGroup.ItemTitle numberOfLines={1}>
              {node.label}
            </ListGroup.ItemTitle>
            {!!node.summary && (
              <ListGroup.ItemDescription numberOfLines={2}>
                {node.summary}
              </ListGroup.ItemDescription>
            )}
          </ListGroup.ItemContent>
          <ListGroup.ItemSuffix />
        </ListGroup.Item>
      </Link.Trigger>
      <Link.Preview />
    </Link>
  );
}
