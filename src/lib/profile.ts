export const DISPLAY_NAME_MAX = 40;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

export function initialsFromName(name: string | null | undefined, email?: string | null): string {
  const source = (name?.trim() || email?.split("@")[0] || "?").trim();
  const parts = source.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0]![0] ?? ""}${parts[1]![0] ?? ""}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase() || "?";
}

export function avatarExtForMime(mime: string): string | null {
  if (mime === "image/jpeg") return "jpg";
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return null;
}

/** Best-effort path inside the avatars bucket from a public URL. */
export function avatarObjectPathFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const marker = "/storage/v1/object/public/avatars/";
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length).split("?")[0] ?? "");
}
