const ENABLED_VALUES = new Set(["1", "true", "yes", "on"]);
const DEFAULT_MESSAGE = "Pati ekibimiz sunucuların kablolarını düzeltiyor. Kısa süre sonra yeniden buradayız.";
const MAINTENANCE_ASSET_PATH = "/maintenance";

function cleanText(value, fallback, maxLength) {
  const normalized = String(value || "").trim();
  return (normalized || fallback).slice(0, maxLength);
}

function maintenanceConfig(env) {
  const retryCandidate = Number.parseInt(env.MAINTENANCE_RETRY_AFTER || "900", 10);
  const retryAfter = Number.isFinite(retryCandidate)
    ? Math.min(86400, Math.max(60, retryCandidate))
    : 900;

  return {
    active: ENABLED_VALUES.has(String(env.MAINTENANCE_MODE || "").trim().toLowerCase()),
    title: cleanText(env.MAINTENANCE_TITLE, "Kısa bir pati molası", 80),
    message: cleanText(env.MAINTENANCE_MESSAGE, DEFAULT_MESSAGE, 240),
    until: cleanText(env.MAINTENANCE_UNTIL, "", 64),
    retryAfter,
  };
}

function statusResponse(config, method) {
  const body = method === "HEAD" ? null : JSON.stringify(config);
  return new Response(body, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, max-age=0",
      "Content-Type": "application/json; charset=utf-8",
      "X-Maintenance-Mode": config.active ? "active" : "inactive",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

async function maintenancePage(context, config, previewOnly = false) {
  const assetUrl = new URL(MAINTENANCE_ASSET_PATH, context.request.url);
  const assetResponse = await context.env.ASSETS.fetch(assetUrl);
  const headers = new Headers(assetResponse.headers);
  const isUnavailable = config.active && !previewOnly;

  headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
  headers.set("Content-Language", "tr");
  headers.set("X-Maintenance-Mode", config.active ? "active" : "inactive");
  headers.set("X-Robots-Tag", "noindex, nofollow, noarchive");
  if (isUnavailable) {
    headers.set("Retry-After", String(config.retryAfter));
  } else {
    headers.delete("Retry-After");
  }

  return new Response(context.request.method === "HEAD" ? null : assetResponse.body, {
    status: isUnavailable ? 503 : 200,
    statusText: isUnavailable ? "Service Unavailable" : "OK",
    headers,
  });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const config = maintenanceConfig(context.env);

  if (url.pathname === "/maintenance-status") {
    if (context.request.method !== "GET" && context.request.method !== "HEAD") {
      return new Response(null, { status: 405, headers: { Allow: "GET, HEAD" } });
    }
    return statusResponse(config, context.request.method);
  }

  // Bakım ekranı kapalıyken tasarımın güvenli biçimde önizlenebilmesini sağlar.
  if (url.pathname === "/maintenance" || url.pathname === "/maintenance.html") {
    return maintenancePage(context, config, true);
  }

  // Arama motorları ve alan adı doğrulaması bakım sırasında da bu dosyalara ulaşabilsin.
  if (
    !config.active ||
    url.pathname === "/robots.txt" ||
    url.pathname === "/sitemap.xml" ||
    url.pathname === "/status" ||
    url.pathname === "/status.html" ||
    url.pathname.startsWith("/.well-known/")
  ) {
    return context.next();
  }

  return maintenancePage(context, config);
}

export { maintenanceConfig };
