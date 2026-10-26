import { INTEGRATION_TYPES, type IntegrationType } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { BrandLogo } from "@/components/BrandLogo";
import { fieldLook } from "@/components/Pickers";
import { IntegrationIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Figma « Logo » tile of the Marketplace: 40 px, white, hairline, the icon or logo inside in grey. */
export const tileClass = "grid size-10 shrink-0 place-items-center overflow-hidden rounded-[10px] border border-border bg-background text-icon";

/** Tile of a skill or plugin: its kind's icon in the neutral tile (never a letter). */
export function InitialTile({ icon, className }: { icon: ReactNode; className?: string }) {
  return <span className={cn(tileClass, "[&_svg]:size-5", className)}>{icon}</span>;
}

/**
 * Icon tile of a connector: its integration type's icon in grey; the brand's logo
 * instead when `server` (or `domain`) names one logo.dev knows.
 */
export function IntegrationTile({
  type,
  server,
  domain,
  className,
}: {
  type: IntegrationType | null | undefined;
  server?: string | null;
  domain?: string | null;
  className?: string;
}) {
  const icon = (
    <span className={cn(tileClass, className)}>
      <IntegrationIcon type={type} className="size-5" />
    </span>
  );
  if (!server && !domain) return icon;
  return (
    <span className={cn(tileClass, className)}>
      <BrandLogo server={server} domain={domain} fallback={<IntegrationIcon type={type} className="size-5" />} className="size-[22px] rounded-[4px]" />
    </span>
  );
}

/** Integration type picker of a connector form. */
export function IntegrationTypeSelect(props: { id?: string; value: IntegrationType; onValueChange: (type: IntegrationType) => void; className?: string }) {
  const t = useT(integrations);
  const items = INTEGRATION_TYPES.map((type) => ({ value: type, label: t.types[type] }));
  return (
    <Select items={items} value={props.value} onValueChange={(v) => v && props.onValueChange(v as IntegrationType)}>
      <SelectTrigger
        id={props.id}
        className={cn(fieldLook, props.className)}
      >
        <SelectValue>
          {(value: IntegrationType) => (
            <span className="flex items-center gap-2.5">
              <IntegrationIcon type={value} className="size-4 text-muted-foreground" />
              {t.types[value]}
            </span>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <IntegrationIcon type={o.value} className="size-4 text-muted-foreground" />
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** Changes the type of an installed connector. */
export function IntegrationTypeMenu(props: { value: IntegrationType; onValueChange: (type: IntegrationType) => void; disabled?: boolean }) {
  const t = useT(integrations);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={props.disabled} className="px-2.5 font-normal text-muted-foreground" />}>
        {t.types[props.value]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t.type}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={props.value} onValueChange={(v) => props.onValueChange(v as IntegrationType)}>
            {INTEGRATION_TYPES.map((type) => (
              <DropdownMenuRadioItem key={type} value={type}>
                <IntegrationIcon type={type} className="text-muted-foreground" />
                {t.types[type]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
