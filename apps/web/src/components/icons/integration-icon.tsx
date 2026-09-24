import type { IntegrationType } from "@agora/core";
import type { IconProps } from "./create-icon";
import { integrationIcon } from "./integrations";

export function IntegrationIcon({ type, ...props }: Omit<IconProps, "type"> & { type: IntegrationType | null | undefined }) {
  const Icon = integrationIcon(type);
  return <Icon {...props} />;
}
