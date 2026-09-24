import { INTEGRATION_TYPES, type IntegrationType } from "@agora/core";
import { integrations } from "@agora/core/i18n";
import { BrandLogo } from "@/components/BrandLogo";
import { IntegrationIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useT } from "@/i18n";
import { cn } from "@/lib/utils";

/** Tint of each integration type, so a connector's kind of data reads at a glance. */
const TYPE_TINT: Record<IntegrationType, string> = {
  mail: "bg-sky-500/12 text-sky-600 dark:text-sky-400",
  calendar: "bg-rose-500/12 text-rose-600 dark:text-rose-400",
  chat: "bg-violet-500/12 text-violet-600 dark:text-violet-400",
  tasks: "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400",
  files: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  contacts: "bg-fuchsia-500/12 text-fuchsia-600 dark:text-fuchsia-400",
  finance: "bg-cyan-500/12 text-cyan-700 dark:text-cyan-400",
  code: "bg-slate-500/15 text-slate-700 dark:text-slate-300",
  database: "bg-orange-500/12 text-orange-600 dark:text-orange-400",
  other: "bg-accent text-foreground/80",
};

/**
 * Icon tile of a connector, tinted by its integration type; the brand's logo
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
  const tile = cn("grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl", className);
  const icon = (
    <span className={cn(tile, TYPE_TINT[type ?? "other"])}>
      <IntegrationIcon type={type} className="size-5" />
    </span>
  );
  if (!server && !domain) return icon;
  return <BrandLogo server={server} domain={domain} fallback={icon} className={cn(tile, "bg-white outline outline-1 -outline-offset-1 outline-black/5")} />;
}

/** Integration type picker of a connector form. */
export function IntegrationTypeSelect(props: { id?: string; value: IntegrationType; onValueChange: (type: IntegrationType) => void; className?: string }) {
  const t = useT(integrations);
  const items = INTEGRATION_TYPES.map((type) => ({ value: type, label: t.types[type] }));
  return (
    <Select items={items} value={props.value} onValueChange={(v) => v && props.onValueChange(v as IntegrationType)}>
      <SelectTrigger
        id={props.id}
        className={cn("h-10 w-full rounded-lg border-input bg-secondary px-3 text-sm data-[size=default]:h-10 dark:bg-secondary dark:hover:bg-secondary", props.className)}
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
