import { ModelIcon, modelMappings, ProviderIcon } from "@lobehub/icons-rn";
import { memo } from "react";
import { useResolveClassNames } from "uniwind";

/* apps/web/src/components/ProviderLogo.tsx, with LobeHub's React Native icons and their own model and provider mappings. */

const known = (model: string) => modelMappings.some((m) => m.keywords.some((k) => new RegExp(k, "i").test(model)));

/** The model vendor's logo, else the provider's, else LobeHub's neutral icon. Monochrome logos take the text color. */
export const ModelLogo = memo(function ModelLogo({ model, provider, size = 20 }: { model?: string; provider: string; size?: number }) {
  const { color } = useResolveClassNames("text-foreground") as { color?: string };
  if (model && known(model)) return <ModelIcon model={model} type="color" size={size} color={color} />;
  return <ProviderIcon provider={provider} type="color" size={size} color={color} />;
});
