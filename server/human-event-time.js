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

function formatShortWeekdayMonthDayAtClock(eventMs, tz) {
  try {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short" }).format(
      new Date(eventMs)
    );
    const md = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      month: "short",
      day: "numeric",
    }).format(new Date(eventMs));
    const clock = formatClock12InTz(eventMs, tz);
    return `${wd}, ${md} at ${clock}`;
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
 * Plain-language event time (not "Thu, Mar 26, 2:30 AM" on deck pills).
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

  if (diff < 0) {
    return formatShortWeekdayMonthDayAtClock(eventStartMs, timeZone);
  }
  if (diff === 0) {
    if (eventH >= 17 || eventH < 4) return `Tonight at ${clock}`;
    return `Today at ${clock}`;
  }
  if (diff === 1) {
    if (eventH >= 0 && eventH < 4) return `Tonight at ${clock}`;
    return `Tomorrow at ${clock}`;
  }
  if (diff >= 2 && diff <= 7) {
    const dayName = new Intl.DateTimeFormat("en-US", {
      timeZone: timeZone,
      weekday: "long",
    }).format(new Date(eventStartMs));
    return `${dayName} at ${clock}`;
  }
  return formatShortWeekdayMonthDayAtClock(eventStartMs, timeZone);
}
