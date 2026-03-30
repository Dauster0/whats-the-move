import * as Notifications from "expo-notifications";

/**
 * Parses a time string like "Tonight at 7:00 PM" or "7:30 PM" and returns
 * an absolute Date for today (or tomorrow if the time has passed).
 */
function parseStartTimeText(text: string, now: Date): Date | null {
  const m = /(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(text);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const ampm = m[3].toUpperCase();
  if (ampm === "PM" && hours < 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  const d = new Date(now);
  d.setHours(hours, minutes, 0, 0);
  // If already past, schedule for tomorrow
  if (d.getTime() <= now.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

/**
 * Schedules a local push notification 2 hours before an event.
 * Silently no-ops if permissions are denied or timing is invalid.
 */
export async function scheduleGoingNotification(
  title: string,
  startIso: string | null,
  startTimeText: string,
  logisticsHint?: string
): Promise<void> {
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== "granted") return;

    const now = new Date();
    let startMs: number | null = null;

    if (startIso) {
      const d = new Date(startIso);
      if (!isNaN(d.getTime())) startMs = d.getTime();
    }

    if (!startMs && startTimeText) {
      const d = parseStartTimeText(startTimeText, now);
      if (d) startMs = d.getTime();
    }

    if (!startMs) return;

    const triggerMs = startMs - 2 * 60 * 60 * 1000;
    if (triggerMs <= now.getTime() + 60_000) return; // less than 1 min away — skip

    const triggerDate = new Date(triggerMs);

    // Format display time from startMs
    const startDate = new Date(startMs);
    const timeLabel = startDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const body = logisticsHint
      ? `${title} starts at ${timeLabel}. ${logisticsHint}`
      : `${title} starts at ${timeLabel}.`;

    await Notifications.scheduleNotificationAsync({
      content: {
        title: "Tonight's move is coming up",
        body,
        sound: true,
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: triggerDate,
      },
    });
  } catch {
    // Fail silently — notifications are non-critical
  }
}
