// Invited workspaces share an origin, but have distinct API mounts and drafts.
// The owner and standalone installations retain their existing URLs and keys.
export function workspacePrefix(
  pathname = globalThis.location?.pathname || "",
) {
  return /^\/t\/[a-z][a-z0-9-]{0,23}(?=\/|$)/.exec(pathname)?.[0] || "";
}

export function workspaceKey(key: string, pathname?: string): string {
  const prefix = workspacePrefix(pathname);
  return prefix ? `${prefix}:${key}` : key;
}

export function workspaceUrl(url: string, pathname?: string): string;
export function workspaceUrl(
  url: string | undefined,
  pathname?: string,
): string | undefined;
export function workspaceUrl(url: string | undefined, pathname?: string) {
  return url?.startsWith("/api/") ? workspacePrefix(pathname) + url : url;
}
