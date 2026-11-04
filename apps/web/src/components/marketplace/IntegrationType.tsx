import { INTEGRATION_TYPES, type IntegrationType } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { BrandLogo } from "@/components/BrandLogo";
import { IntegrationIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ItemMedia } from "@/components/ui/item";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

/** Media of a skill or plugin row: its kind's icon (never a letter). */
export function InitialTile({ icon, className }: { icon: ReactNode; className?: string }) {
  return (
    <ItemMedia variant="image" className={cn("bg-muted", className)}>
      {icon}
    </ItemMedia>
  );
}

/**
 * Media of a connector row: its integration type's icon; the brand's logo
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
  return (
    <ItemMedia variant="image" className={cn("bg-muted", className)}>
      {server || domain ? <BrandLogo server={server} domain={domain} fallback={<IntegrationIcon type={type} />} /> : <IntegrationIcon type={type} />}
    </ItemMedia>
  );
}

/** Integration type picker of a connector form. */
export function IntegrationTypeSelect(props: { id?: string; value: IntegrationType; onValueChange: (type: IntegrationType) => void; className?: string }) {
  const t = useT(integrations);
  const items = INTEGRATION_TYPES.map((type) => ({ value: type, label: t.types[type] }));
  return (
    <Select items={items} value={props.value} onValueChange={(v) => v && props.onValueChange(v as IntegrationType)}>
      <SelectTrigger id={props.id} className={cn("w-full", props.className)}>
        <SelectValue>
          {(value: IntegrationType) => (
            <>
              <IntegrationIcon type={value} />
              {t.types[value]}
            </>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false} align="start">
        <SelectGroup>
          {items.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              <IntegrationIcon type={o.value} />
              {o.label}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}

/** Changes the type of an installed connector. */
export function IntegrationTypeMenu(props: { value: IntegrationType; onValueChange: (type: IntegrationType) => void; disabled?: boolean }) {
  const t = useT(integrations);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="sm" disabled={props.disabled} />}>
        {t.types[props.value]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t.type}</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={props.value} onValueChange={(v) => props.onValueChange(v as IntegrationType)}>
            {INTEGRATION_TYPES.map((type) => (
              <DropdownMenuRadioItem key={type} value={type}>
                <IntegrationIcon type={type} />
                {t.types[type]}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
