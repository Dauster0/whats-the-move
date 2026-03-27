/**
 * Going-out friendly event clock copy (deck cards + detail screen).
 * Same calendar rules: after-midnight shows count as "tonight" for the prior evening.
 */

function ymdInTimeZone(isoOrMs, tz) {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || "UTC",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(isoOrMs));
  } catch {
    return "";
  }
}

function dayDiffCalendarYmd(nowYmd, eventYmd) {
  const [ya, ma, da] = String(nowYmd).split("-").map(Number);
  const [yb, mb, db] = String(eventYmd).split("-").map(Number);
  if (!ya || !yb) return NaN;
  const ua = Date.UTC(ya, ma - 1, da);
  const ub = Date.UTC(yb, mb - 1, db);
  return Math.round((ub - ua) / 86400000);
}

function hourInTimeZone(ms, tz) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      hour12: false,
    }).formatToParts(new Date(ms));
    return parseInt(parts.find((p) => p.type === "hour")?.value ?? "0", 10);
  } catch {
    return 12;
  }
}

function formatClock12InTz(ms, tz) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return "";
  }
}

function formatMonthDayAtClock(eventMs, tz) {
  try {
    const md = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
    }).format(new Date(eventMs));
    const clock = formatClock12InTz(eventMs, tz);
    return `${md} at ${clock}`;
  } catch {
    return formatClock12InTz(eventMs, tz);
  }
}

/** Ticketmaster Discovery `dates` object from event detail API. */
export function startMsFromTicketmasterDates(dates) {
  const start = dates?.start;
  if (!start) return null;
  const dt = start.dateTime;
  if (dt) {
    const x = new Date(dt).getTime();
    if (!Number.isNaN(x)) return x;
  }
  const ld = start.localDate;
  const lt = start.localTime;
  if (!ld) return null;
  const timePart = lt && String(lt).length >= 4 ? String(lt) : "12:00:00";
  const normalized = timePart.length === 5 ? `${timePart}:00` : timePart;
  const x = new Date(`${ld}T${normalized}`).getTime();
  return Number.isNaN(x) ? null : x;
}

/** Flat concierge TM row: startIso, localDate, localTime. */
export function startMsFromFlatTicketmasterRecord(e) {
  if (e?.startIso) {
    const x = new Date(e.startIso).getTime();
    if (!Number.isNaN(x)) return x;
  }
  const ld = e?.localDate;
  const lt = e?.localTime;
  if (!ld) return null;
  const timePart = lt && String(lt).length >= 4 ? String(lt) : "12:00:00";
  const normalized = timePart.length === 5 ? `${timePart}:00` : timePart;
  const x = new Date(`${ld}T${normalized}`).getTime();
  return Number.isNaN(x) ? null : x;
}

/**
 * Plain-language event time for deck cards and detail screen.
 *
 * "Tonight" rule: events starting midnight–6am count as tonight
 * when the current local hour is 18 or later (going-out session).
 */
export function formatHumanGoingOutTime(nowMs, eventStartMs, timeZone) {
  if (eventStartMs == null || Number.isNaN(eventStartMs) || !timeZone) return "";
  const nowYmd = ymdInTimeZone(nowMs, timeZone);
  const eventYmd = ymdInTimeZone(eventStartMs, timeZone);
  if (!nowYmd || !eventYmd) return "";
  const diff = dayDiffCalendarYmd(nowYmd, eventYmd);
  const clock = formatClock12InTz(eventStartMs, timeZone);
  if (!clock) return "";
  const eventH = hourInTimeZone(eventStartMs, timeZone);
  const nowH = hourInTimeZone(nowMs, timeZone);

  if (diff === 0) {
    // Evening or after-midnight early morning → "Tonight"
    if (eventH >= 18 || eventH < 6) return `Tonight at ${clock}`;
    return `Today at ${clock}`;
  }
  if (diff === 1) {
    // After-midnight show on the next calendar day — still "tonight" if we're past 6pm
    if (eventH < 6 && nowH >= 18) return `Tonight at ${clock}`;
    return `Tomorrow at ${clock}`;
  }
  if (diff >= 2 && diff <= 7) {
    const dayName = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone,
      weekday: "long",
    }).format(new Date(eventStartMs));
    return `${dayName} at ${clock}`;
  }
  // > 7 days out or past events: short month/day without year or weekday abbreviation
  return formatMonthDayAtClock(eventStartMs, timeZone);
}
