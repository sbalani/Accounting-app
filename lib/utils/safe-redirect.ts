/**
 * Returns true only for same-origin relative paths (e.g. "/dashboard").
 * Rejects protocol-relative URLs (//evil.com), absolute URLs, and backslash paths.
 */
export function isSafeInternalRedirect(path: string | null | undefined): path is string {
  if (!path || typeof path !== "string") {
    return false;
  }

  if (!path.startsWith("/") || path.startsWith("//")) {
    return false;
  }

  if (path.includes("\\") || path.includes("://")) {
    return false;
  }

  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith("//") || decoded.includes("://")) {
      return false;
    }
  } catch {
    return false;
  }

  return true;
}

export function resolveSafeRedirect(
  path: string | null | undefined,
  fallback = "/dashboard"
): string {
  return isSafeInternalRedirect(path) ? path : fallback;
}
