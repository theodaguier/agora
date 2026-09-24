import { INTEGRATION_TYPES, type IntegrationType } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { Image } from "expo-image";
import { Avatar, Label, ListGroup } from "heroui-native";
import { Section } from "@/components/admin/ui";
import { useBrandLogo } from "@/components/brand-logo";
import { IntegrationIcon } from "@/components/icons";
import { authHeaders } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { OptionPicker } from "@/components/menus";

/* apps/web/src/components/marketplace/IntegrationType.tsx */

type Tint = "accent" | "danger" | "success" | "warning" | "default";

/** Tint of each integration type (HeroUI Avatar colors), so a connector's kind of data reads at a glance. */
const TYPE_TINT: Record<IntegrationType, Tint> = {
  mail: "accent",
  calendar: "danger",
  chat: "accent",
  tasks: "success",
  files: "warning",
  contacts: "success",
  finance: "success",
  code: "default",
  database: "warning",
  other: "default",
};

const ICON_COLOR: Record<Tint, string> = {
  accent: "text-accent",
  danger: "text-danger",
  success: "text-success",
  warning: "text-warning",
  default: "text-foreground",
};

/**
 * Icon tile of a connector (a HeroUI Avatar), tinted by its integration type; the brand's logo
 * instead when `server` (or `domain`) names one logo.dev knows. The icon shows while it loads or fails.
 */
export function IntegrationTile({
  type,
  size = "md",
  server,
  domain,
}: {
  type: IntegrationType | null | undefined;
  size?: "sm" | "md" | "lg";
  server?: string | null;
  domain?: string | null;
}) {
  const tint = TYPE_TINT[type ?? "other"];
  const logo = useBrandLogo({ domain, server: server ?? null });
  const src = server || domain ? logo : null;
  return (
    <Avatar alt={type ?? "other"} size={size} variant="soft" color={tint}>
      {/* The logo route needs the session, and expo-image keeps it on disk: a list asks once. */}
      {!!src && (
        <Avatar.Image source={{ uri: src, headers: authHeaders() }} asChild>
          <Image style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" />
        </Avatar.Image>
      )}
      <Avatar.Fallback>
        <IntegrationIcon type={type} size={size === "sm" ? 16 : size === "md" ? 20 : 24} className={ICON_COLOR[tint]} />
      </Avatar.Fallback>
    </Avatar>
  );
}

/** Tile of a skill or a plugin: its initial, on a neutral fill (a HeroUI Avatar). */
export function InitialTile({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <Avatar alt={name} size={size} variant="soft" color="default">
      <Avatar.Fallback>{name.replace(/^[^a-z0-9]+/i, "").charAt(0).toUpperCase()}</Avatar.Fallback>
    </Avatar>
  );
}

/** Integration type picker: a HeroUI Select, which checks the current type. */
export function IntegrationTypePicker(props: { value: IntegrationType; onChange: (type: IntegrationType) => void }) {
  const t = tr(integrations);
  return (
    <OptionPicker value={props.value} options={INTEGRATION_TYPES.map((type) => ({ value: type, label: t.types[type] }))} label={t.type} onChange={props.onChange} />
  );
}

/** The required "Type" row of the connector forms (catalog install, custom connector). */
export function IntegrationTypeSection(props: { value: IntegrationType; onChange: (type: IntegrationType) => void }) {
  return (
    <Section>
      <ListGroup.Item>
        <ListGroup.ItemContent>
          <Label isRequired>{tr(integrations).type}</Label>
        </ListGroup.ItemContent>
        <ListGroup.ItemSuffix>
          <IntegrationTypePicker {...props} />
        </ListGroup.ItemSuffix>
      </ListGroup.Item>
    </Section>
  );
}

