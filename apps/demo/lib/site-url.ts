export function getSiteUrl() {
  const configuredUrl = process.env.SITE_URL;
  const rawUrl =
    configuredUrl ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3001");

  if (!rawUrl) {
    throw new Error("Set SITE_URL to the canonical website origin.");
  }

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("SITE_URL must be an absolute URL.");
  }

  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    throw new Error("SITE_URL must be a site origin without a path.");
  }

  return url.origin;
}
