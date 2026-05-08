type DateInput = string | Date;

const datePartFormatterCache = new Map<string, Intl.DateTimeFormat>();

function getDatePartFormatter(timeZone: string) {
  const safeTimeZone = getSafeTimeZone(timeZone);

  if (!datePartFormatterCache.has(safeTimeZone)) {
    datePartFormatterCache.set(
      safeTimeZone,
      new Intl.DateTimeFormat("en-CA", {
        timeZone: safeTimeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
      })
    );
  }

  return datePartFormatterCache.get(safeTimeZone)!;
}

function getDateParts(date: Date, timeZone: string) {
  const parts = getDatePartFormatter(timeZone).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value || "0");

  return {
    year: get("year"),
    month: get("month"),
    day: get("day"),
    hour: get("hour"),
    minute: get("minute"),
    second: get("second"),
  };
}

function parseDateOnly(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function parseTimeOnly(value: string) {
  const match = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;

  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
    second: Number(match[3] || "0"),
  };
}

function parseDateInput(value: DateInput) {
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function isValidTimeZone(timeZone: string | null | undefined): boolean {
  if (!timeZone) return false;

  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getSafeTimeZone(
  timeZone: string | null | undefined,
  fallback = "UTC"
): string {
  return isValidTimeZone(timeZone) ? String(timeZone) : fallback;
}

export function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const safeTimeZone = getSafeTimeZone(timeZone);
  const parts = getDateParts(date, safeTimeZone);
  const asUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second
  );

  return asUtc - date.getTime();
}

export function zonedDateTimeToUtc(
  date: string,
  time: string,
  timeZone: string
): Date | null {
  const parsedDate = parseDateOnly(date);
  const parsedTime = parseTimeOnly(time);
  if (!parsedDate || !parsedTime) {
    return null;
  }

  const safeTimeZone = getSafeTimeZone(timeZone);
  const utcGuess = Date.UTC(
    parsedDate.year,
    parsedDate.month - 1,
    parsedDate.day,
    parsedTime.hour,
    parsedTime.minute,
    parsedTime.second
  );

  let offset = getTimeZoneOffsetMs(new Date(utcGuess), safeTimeZone);
  let resolvedTimestamp = utcGuess - offset;

  for (let i = 0; i < 2; i += 1) {
    const nextOffset = getTimeZoneOffsetMs(new Date(resolvedTimestamp), safeTimeZone);
    if (nextOffset === offset) {
      break;
    }
    offset = nextOffset;
    resolvedTimestamp = utcGuess - offset;
  }

  const resolvedDate = new Date(resolvedTimestamp);
  return Number.isNaN(resolvedDate.getTime()) ? null : resolvedDate;
}

export function formatInTimeZone(
  dateInput: DateInput,
  timeZone: string,
  locale = "en-US",
  options: Intl.DateTimeFormatOptions = {}
): string {
  const parsedDate = parseDateInput(dateInput);
  if (!parsedDate) return "";

  return new Intl.DateTimeFormat(locale, {
    timeZone: getSafeTimeZone(timeZone),
    ...options,
  }).format(parsedDate);
}

export function getDateKeyInTimeZone(dateInput: DateInput, timeZone: string): string {
  const parsedDate = parseDateInput(dateInput);
  if (!parsedDate) return "";

  const parts = getDateParts(parsedDate, timeZone);
  const month = String(parts.month).padStart(2, "0");
  const day = String(parts.day).padStart(2, "0");

  return `${parts.year}-${month}-${day}`;
}

export function getTimeLabelInTimeZone(
  dateInput: DateInput,
  timeZone: string,
  locale = "en-US"
): string {
  return formatInTimeZone(dateInput, timeZone, locale, {
    hour: "numeric",
    minute: "2-digit",
  });
}

export function getTimeValueInTimeZone(
  dateInput: DateInput,
  timeZone: string,
  includeSeconds = true
): string {
  const parsedDate = parseDateInput(dateInput);
  if (!parsedDate) return "";

  const parts = getDateParts(parsedDate, timeZone);
  const hour = String(parts.hour).padStart(2, "0");
  const minute = String(parts.minute).padStart(2, "0");
  const second = String(parts.second).padStart(2, "0");

  return includeSeconds ? `${hour}:${minute}:${second}` : `${hour}:${minute}`;
}

export function toScheduledAtIso(
  date: string,
  time: string,
  timeZone: string
): string | null {
  const scheduledAt = zonedDateTimeToUtc(date, time, timeZone);
  return scheduledAt?.toISOString() || null;
}

export function getDateLabelInTimeZone(
  dateInput: DateInput,
  timeZone: string,
  locale = "en-US"
): string {
  return formatInTimeZone(dateInput, timeZone, locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
