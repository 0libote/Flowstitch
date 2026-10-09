import { type Fields, type Field, fieldKeys, equal } from "../types";
export function reconcile(
  base: Fields,
  local: Fields,
  remote: Fields,
): { merged: Fields; conflicts: Field[] } {
  const merged = { ...remote };
  const conflicts: Field[] = [];
  for (const key of fieldKeys) {
    const l = !equal(local[key], base[key]);
    const r = !equal(remote[key], base[key]);
    if (l && r && !equal(local[key], remote[key])) conflicts.push(key);
    else if (l) Object.assign(merged, { [key]: local[key] });
  }
  return { merged, conflicts };
}
