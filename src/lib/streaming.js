// The services people tick in Settings, and how TMDB/JustWatch spells each
// one. TMDB names vary by tier and storefront ("Disney Plus", "Amazon Prime
// Video with Ads", "HBO Max Amazon Channel"), so exact string matching
// silently misses most of them.
export const SERVICES = ["Netflix", "Hulu", "Max", "Disney+", "Prime Video", "Apple TV+", "Paramount+", "Peacock"];

const PATTERNS = [
  ["Netflix", /^netflix\b/i],
  ["Hulu", /^hulu\b/i],
  ["Max", /^(hbo )?max\b/i],
  ["Disney+", /^disney ?(\+|plus)/i],
  ["Prime Video", /^amazon prime video\b|^prime video\b/i],
  ["Apple TV+", /^apple tv ?(\+|plus)\b/i],
  ["Paramount+", /^paramount ?(\+|plus)/i],
  ["Peacock", /^peacock\b/i],
];

/** Canonical Settings name for a TMDB provider name, or null if it isn't one of ours. */
export function serviceFor(providerName) {
  const name = String(providerName || "").trim();
  return PATTERNS.find(([, re]) => re.test(name))?.[0] || null;
}

function unique(list) {
  return [...new Set(list)];
}

/**
 * Who in the room can stream a title with what they already pay for.
 * level: "both" | "me" | "partner" | "neither" | "unknown"
 * Free (ad-supported) providers count as available to both of you.
 */
export function streamingAccess(providers, myServices = [], partnerServices = []) {
  const flatrate = providers?.flatrate || [];
  const free = providers?.free || [];
  const rent = unique([...(providers?.rent || []), ...(providers?.buy || [])]);
  const mine = new Set(myServices), theirs = new Set(partnerServices);
  const onFlat = unique(flatrate.map(serviceFor).filter(Boolean));
  const myVia = onFlat.filter((s) => mine.has(s));
  const partnerVia = onFlat.filter((s) => theirs.has(s));
  const base = { free, rent, flatrate };

  if (free.length || (myVia.length && partnerVia.length)) {
    const shared = myVia.filter((s) => partnerVia.includes(s));
    const via = free.length && !myVia.length && !partnerVia.length ? free.slice(0, 1) : unique([...shared, ...myVia, ...partnerVia]);
    return { ...base, level: "both", via, isFree: !!free.length && !shared.length && !myVia.length };
  }
  if (myVia.length) return { ...base, level: "me", via: myVia };
  if (partnerVia.length) return { ...base, level: "partner", via: partnerVia };
  if (flatrate.length) return { ...base, level: "neither", via: groupProviders(flatrate).map((p) => p.name).slice(0, 2) };
  if (rent.length) return { ...base, level: "neither", via: [], rentOnly: true };
  return { ...base, level: "unknown", via: [] };
}

// TMDB lists the same service several times over (tiers and storefront
// add-ons): collapse those into one row, keeping TMDB's own priority order.
const VARIANT = /\s+(standard with ads|basic with ads|with ads|amazon channel|apple tv channel|roku premium channel|premium|essential)$/i;
export function groupProviders(list = []) {
  const seen = new Map();
  for (const p of list) {
    const name = typeof p === "string" ? p : p.name;
    let base = name;
    while (VARIANT.test(base)) base = base.replace(VARIANT, "");
    const key = (serviceFor(name) || base).toLowerCase();
    if (!seen.has(key)) seen.set(key, { ...(typeof p === "string" ? {} : p), name: serviceFor(name) || base, raw: name });
  }
  return [...seen.values()];
}

/** Per-provider access, for the "Where to watch" list. */
export function providerAccess(providerName, myServices = [], partnerServices = []) {
  const service = serviceFor(providerName);
  const me = !!service && myServices.includes(service);
  const partner = !!service && partnerServices.includes(service);
  return me && partner ? "both" : me ? "me" : partner ? "partner" : "neither";
}
