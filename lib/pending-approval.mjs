import { displayStatus, sortArrivals } from './staff-view.mjs';
/** @template {{id:string,starts_at:string,status:string,expires_at:string}} T @param {T[]} bookings @param {number} [now] */
export function activePending(bookings, now = Date.now()) {
  return sortArrivals(bookings.filter(b => displayStatus(b, now) === 'pending'));
}
/** Only IDs are persisted; initial observation is a silent baseline. @param {string[]|null} seen @param {string[]} ids */
export function pendingAlerts(seen, ids) {
  const known = new Set(seen || []);
  return { fresh: seen === null ? [] : ids.filter(id => !known.has(id)), seen: [...new Set([...known, ...ids])] };
}
