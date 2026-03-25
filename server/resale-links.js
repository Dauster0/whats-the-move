/**
 * Deep links to StubHub / SeatGeek search (no API keys).
 * Official resale APIs require partner agreements; search URLs are reliable fallbacks.
 */

export function buildResaleSearchUrls({
  eventName = "",
  venueName = "",
  city = "",
  dateHint = "",
}) {
  const parts = [eventName, venueName, city].map((s) => String(s || "").trim()).filter(Boolean);
  const primary = parts.join(" ") || "concert tickets";
  const withDate = dateHint ? `${primary} ${dateHint}` : primary;

  const stubhub = `https://www.stubhub.com/secure/search?q=${encodeURIComponent(withDate)}`;
  const seatgeek = `https://seatgeek.com/search?${new URLSearchParams({ q: withDate }).toString()}`;

  return { stubhub, seatgeek, queryUsed: withDate };
}
