import type { Due } from "../types";
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}
function localParts(date: Date, zone: string): string {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (key: string): string =>
    p.find((v) => v.type === key)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}
/** Resolve a wall clock to an instant; reject gaps and folds instead of silently choosing. */
export function zonedDateTime(
  date: string,
  time: string,
  zone: string,
): string {
  if (!validDate(date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time))
    throw new Error("Use a valid date and HH:mm");
  const wanted = date + "T" + time + ":00";
  const naive = Date.parse(wanted + "Z");
  const offsets = new Set<number>();
  for (const delta of [-86400000, 0, 86400000]) {
    const stamp = naive + delta;
    offsets.add(Date.parse(localParts(new Date(stamp), zone) + "Z") - stamp);
  }
  const candidates = [...offsets]
    .map((offset) => naive - offset)
    .filter((stamp) => localParts(new Date(stamp), zone) === wanted);
  if (candidates.length !== 1)
    throw new Error(
      candidates.length
        ? "Time is ambiguous at a daylight-saving transition; choose another time"
        : "Time does not exist at a daylight-saving transition",
    );
  return new Date(candidates[0]!).toISOString();
}
export function rescheduleDue(
  previous: Due | null,
  date: string,
  zone: string,
  time?: string,
): Due {
  if (!validDate(date)) throw new Error("Use a valid YYYY-MM-DD date");
  const old = previous?.date ?? "";
  const fixed = /Z$|[+-]\d\d:\d\d$/.test(old);
  const destinationZone = previous?.timezone ?? zone;
  let clock = time;
  if (!clock && old.includes("T"))
    clock = fixed
      ? localParts(new Date(old), destinationZone).slice(11, 16)
      : old.slice(11, 16);
  const value = clock
    ? fixed
      ? zonedDateTime(date, clock, destinationZone)
      : date + "T" + clock + ":00"
    : date;
  const base = { ...(previous ?? {}) } as Due;
  if (!base.is_recurring) delete (base as Partial<Due>).string;
  return {
    ...base,
    date: value,
    ...(fixed ? { timezone: destinationZone } : {}),
  };
}
