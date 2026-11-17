// Presentation-only helpers. Database RPCs remain the authority for every mutation.
/** @param {string} value */
export function serviceDay(value) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
/** @param {{status:string,expires_at:string}} booking @param {number} [now] */
export function displayStatus(booking, now = Date.now()) {
  return booking.status === "pending" && Date.parse(booking.expires_at) <= now
    ? "expired"
    : booking.status;
}
/** @param {{status:string,expires_at:string,starts_at:string,capacity_released_at:string|null}} b @param {number} [now] */
export function holdsCapacity(b, now = Date.now()) {
  if (b.capacity_released_at) return false;
  if (["confirmed", "seated", "completed"].includes(b.status)) return true;
  const start = Date.parse(b.starts_at),
    expiry = Date.parse(b.expires_at);
  if (b.status === "pending")
    return expiry > now || (expiry >= start && now >= start);
  if (b.status === "expired") return expiry >= start && now >= start;
  return (
    ["cancelled", "declined", "no_show"].includes(b.status) && now >= start
  );
}
/** @template {{starts_at:string,id:string}} T @param {T[]} bookings @returns {T[]} */
export function sortArrivals(bookings) {
  return [...bookings].sort(
    (a, b) =>
      Date.parse(a.starts_at) - Date.parse(b.starts_at) ||
      a.id.localeCompare(b.id),
  );
}
/** @param {{status:string,expires_at:string,starts_at:string,ends_at:string}} b @param {number} [now] */
export function availableActions(b, now = Date.now()) {
  const transitions = /** @type {Record<string,string[]>} */ ({
    pending: ["confirmed", "declined", "cancelled"],
    confirmed: ["seated", "cancelled", "no_show"],
    seated: ["completed", "cancelled", "no_show"],
  });
  return (transitions[displayStatus(b, now)] || []).filter((action) =>
    action === "seated"
      ? now >= Date.parse(b.starts_at) - 1800000 && now < Date.parse(b.ends_at)
      : action === "no_show"
        ? now >= Date.parse(b.starts_at)
        : true,
  );
}
/** @template {{id:string,starts_at:string,ends_at:string,status:string,expires_at:string,capacity_released_at:string|null}} T @param {T[]} bookings @param {string} date @param {number} [now] */
export function occupancyRows(bookings, date, now = Date.now()) {
  const start = Date.parse(`${date}T00:00:00+08:00`),
    end = start + 86400000;
  if (!Number.isFinite(start)) return [];
  return sortArrivals(bookings)
    .filter(
      (b) =>
        holdsCapacity(b, now) &&
        Date.parse(b.starts_at) < end &&
        Date.parse(b.ends_at) > start,
    )
    .map((booking) => ({
      booking,
      left:
        Math.max(0, (Date.parse(booking.starts_at) - start) / 86400000) * 100,
      width:
        ((Math.min(end, Date.parse(booking.ends_at)) -
          Math.max(start, Date.parse(booking.starts_at))) /
          86400000) *
        100,
    }));
}
/** @param {string} phone */
export function whatsappUrl(phone) {
  return /^\+[1-9]\d{7,14}$/.test(phone)
    ? `https://wa.me/${phone.slice(1)}`
    : null;
}
