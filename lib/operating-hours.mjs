/** Official weekly defaults, in Asia/Kuala_Lumpur. Monday has no service. */
export const officialHours = Array.from({ length: 7 }, (_, day) => ({
  day,
  periods:
    day === 1
      ? []
      : day === 0 || day === 6
        ? [
            { start: "12:00", end: "14:30" },
            { start: "18:00", end: "22:30" },
          ]
        : [{ start: "18:00", end: "22:30" }],
}));
export const launchDefaults = {
  arrivalInterval: 30,
  publicBookingsEnabled: false,
  capacitiesConfirmed: false,
  policiesConfirmed: false,
};
/** @param {string} date */
export function mondayClosed(date) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(date) &&
    new Date(`${date}T12:00:00+08:00`).getUTCDay() === 1
  );
}
