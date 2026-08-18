// Shared Unix-seconds / IANA-timezone helpers used by telemetry ingestion
// and reporting. Kept separate from the MySQL session timezone (config/db.js
// pins connections to UTC) so callers can reason in plain Unix seconds.

// Device clock time arrives as Unix seconds; convert in JS rather than
// FROM_UNIXTIME() because the MySQL session timezone is not pinned to UTC.
export const unixSecondsToUtcDatetime = (unixSeconds) =>
  new Date(unixSeconds * 1000).toISOString().slice(0, 19).replace('T', ' ');

// Offset (minutes) of an IANA zone from UTC at a given instant.
export const tzOffsetMinAt = (date, timeZone) => {
  try {
    const fmtParts = (tz) =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(date);

    const toMap = (parts) => {
      const map = {};
      for (const part of parts) {
        if (part.type !== 'literal') map[part.type] = part.value;
      }
      return map;
    };

    const wallAsUtc = (parts) =>
      Date.UTC(
        Number(parts.year),
        Number(parts.month) - 1,
        Number(parts.day),
        Number(parts.hour),
        Number(parts.minute),
        Number(parts.second)
      );

    return Math.round((wallAsUtc(toMap(fmtParts(timeZone))) - wallAsUtc(toMap(fmtParts('Etc/UTC')))) / 60000);
  } catch {
    return 0;
  }
};

// Unix-second bounds of "today" (the calendar date `date` currently falls on
// in `timeZone`) — used to reset daily energy rollups at local midnight.
export const localDayBoundsUnix = (timeZone, date = new Date()) => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') map[part.type] = part.value;
  }

  const offsetMin = tzOffsetMinAt(date, timeZone);
  const naiveUtcMidnight = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day)) / 1000;
  const startUnix = naiveUtcMidnight - offsetMin * 60;
  return { startUnix, endUnix: startUnix + 86400 };
};
