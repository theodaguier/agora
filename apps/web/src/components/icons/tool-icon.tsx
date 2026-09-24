import { createElement } from "react";
import type { IconProps } from "./create-icon";
import { toolIcon } from "./tools";

/** The icon of a tool, by the name the agent reports. */
export function ToolIcon({ name, ...props }: IconProps & { name: string }) {
  return createElement(toolIcon(name), props);
}
