import { INTEGRATION_TYPES, type IntegrationType } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { tr } from "@/lib/i18n";
import { type MenuSubmenu } from "@/components/menus";

/** The same choice as a submenu of a row's HeroUI Menu (the web's IntegrationTypeMenu on an installed connector). */
export function integrationTypeSubmenu(value: IntegrationType, onChange: (type: IntegrationType) => void): MenuSubmenu {
  const t = tr(integrations);
  return {
    submenu: t.type,
    icon: "square.grid.2x2",
    actions: INTEGRATION_TYPES.map((type) => ({ label: t.types[type], checked: type === value, onPress: () => onChange(type) })),
  };
}
