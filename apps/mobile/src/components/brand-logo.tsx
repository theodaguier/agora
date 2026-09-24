import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Image } from "@/components/attachment-files";
import { apiUrl, authHeaders } from "@/lib/api";
import { cn } from "@/lib/utils";
import { brandsQuery } from "@/components/brand-logos";

/* apps/web/src/components/BrandLogo.tsx */

/** "google-calendar-mcp" → "google calendar": what logo.dev's name lookup understands. */
const brandName = (server: string) =>
  server
    .toLowerCase()
    .replace(/^mcp[-_]|[-_]mcp$/g, "")
    .replace(/[-_]+/g, " ")
    .trim();

/**
 * A brand's logo URL, by domain ("resend.com") or by MCP server name (its URL's domain when
 * known, else a lookup by name). Served by the instance, which keeps logo.dev's images.
 * Null without logo.dev (Settings › Integrations on the web).
 */
export function useBrandLogo(brand: { domain?: string | null; server?: string | null }): string | null {
  const { data } = useQuery(brandsQuery);
  if (!data?.logos) return null;
  const domain = brand.domain ?? (brand.server ? data.servers[brand.server] : null);
  const name = brand.server && brandName(brand.server);
  const query = domain ? `domain=${encodeURIComponent(domain)}` : name ? `name=${encodeURIComponent(name)}` : null;
  // An unknown brand answers 404 and the caller's icon shows instead.
  return query ? apiUrl(`/integrations/logo?${query}`) : null;
}

/** The brand's logo, else `fallback` (no key, unknown brand, image error). */
export function BrandLogo({
  domain,
  server,
  fallback,
  className,
}: {
  domain?: string | null;
  server?: string | null;
  fallback: ReactNode;
  className?: string;
}) {
  const src = useBrandLogo({ domain, server });
  const [failed, setFailed] = useState<string | null>(null);
  if (!src || failed === src) return fallback;
  return (
    <Image
      source={{ uri: src, headers: authHeaders() }}
      contentFit="contain"
      cachePolicy="memory-disk"
      accessibilityIgnoresInvertColors
      onError={() => setFailed(src)}
      className={cn("shrink-0", className)}
    />
  );
}

