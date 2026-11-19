const CDN = "https://web.poecdn.com/";

/**
 * Item art is hotlinked from web.poecdn.com. Browsers on this origin show the
 * alt text instead of the PNG, so build icons go through our own route.
 */
export function artSrc(icon: string | null | undefined): string | null {
  if (!icon || !icon.startsWith(CDN)) return icon ?? null;
  return `/api/icon?u=${encodeURIComponent(icon)}`;
}
