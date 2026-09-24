import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { brandsQuery } from "@/lib/queries";
import { cn } from "@/lib/utils";

/** "google-calendar-mcp" → "google calendar": what logo.dev's name lookup understands. */
const brandName = (server: string) =>
  server
    .toLowerCase()
    .replace(/^mcp[-_]|[-_]mcp$/g, "")
    .replace(/[-_]+/g, " ")
    .trim();

/**
 * A brand's logo, by domain ("resend.com") or by MCP server name (its URL's
 * domain when known, else a lookup by name). Served by the API, which keeps
 * logo.dev's images: no request leaves for logo.dev from the browser. Null
 * without logo.dev (Settings › Integrations).
 */
export function useBrandLogo(brand: { domain?: string | null; server?: string | null }): string | null {
  const { data } = useQuery(brandsQuery);
  if (!data?.logos) return null;
  const domain = brand.domain ?? (brand.server ? data.servers[brand.server] : null);
  const name = brand.server && brandName(brand.server);
  const query = domain ? `domain=${encodeURIComponent(domain)}` : name ? `name=${encodeURIComponent(name)}` : null;
  // An unknown brand answers 404 and the caller's icon shows instead.
  return query && `/api/integrations/logo?${query}`;
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
  return <img src={src} alt="" loading="lazy" draggable={false} onError={() => setFailed(src)} className={cn("shrink-0 object-contain", className)} />;
}

