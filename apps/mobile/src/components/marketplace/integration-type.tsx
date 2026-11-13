import { INTEGRATION_TYPES, type IntegrationType } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { Image } from "expo-image";
import { Avatar, Label, ListGroup } from "heroui-native";
import { Section } from "@/components/admin/ui";
import { useBrandLogo } from "@/components/brand-logo";
import { IntegrationIcon, PackageIcon, PuzzleIcon } from "@/components/icons";
import { authHeaders } from "@/lib/api";
import { tr } from "@/lib/i18n";
import { OptionPicker } from "@/components/menus";

/* apps/web/src/components/marketplace/IntegrationType.tsx */

/**
 * Icon tile of a connector (a HeroUI Avatar on a neutral fill, as the web's): its integration type's icon;
 * the brand's logo instead when `server` (or `domain`) names one logo.dev knows. The icon shows while it loads or fails.
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
  const logo = useBrandLogo({ domain, server: server ?? null });
  const src = server || domain ? logo : null;
  return (
    <Avatar alt={type ?? "other"} size={size} variant="soft" color="default">
      {/* The logo route needs the session, and expo-image keeps it on disk: a list asks once. */}
      {!!src && (
        <Avatar.Image source={{ uri: src, headers: authHeaders() }} asChild>
          <Image style={{ width: "100%", height: "100%" }} contentFit="cover" cachePolicy="memory-disk" />
        </Avatar.Image>
      )}
      <Avatar.Fallback>
        <IntegrationIcon type={type} size={size === "sm" ? 16 : size === "md" ? 20 : 24} className="text-muted" />
      </Avatar.Fallback>
    </Avatar>
  );
}

/** Tile of a skill or a plugin: its kind's icon (never a letter), on a neutral fill (a HeroUI Avatar). */
export function InitialTile({ kind, size = "md" }: { kind: "skill" | "plugin"; size?: "md" | "lg" }) {
  const Icon = kind === "plugin" ? PuzzleIcon : PackageIcon;
  return (
    <Avatar alt={kind} size={size} variant="soft" color="default">
      <Avatar.Fallback>
        <Icon size={size === "md" ? 20 : 24} className="text-muted" />
      </Avatar.Fallback>
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

