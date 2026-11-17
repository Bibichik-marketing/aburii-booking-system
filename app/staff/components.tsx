"use client";
import { officialHours, launchDefaults } from "@/lib/operating-hours.mjs";
import { useLanguage, LanguageSwitcher } from "@/lib/language";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { configSchema } from "@/lib/schema";
import {
  serviceDay,
  displayStatus,
  availableActions,
  occupancyRows,
  whatsappUrl,
  holdsCapacity,
} from "@/lib/staff-view.mjs";
export type Config = z.infer<typeof configSchema>;
export type Booking = {
  id: string;
  reference: string;
  name: string;
  phone: string;
  email: string;
  requests: string;
  guests: number;
  area: "counter" | "private";
  room: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  expires_at: string;
  capacity_released_at: string | null;
  capacity_committed: boolean;
  minimum_spend: number;
  archived?: boolean;
  effective_status?: string;
};
export type Data = {
  role: "admin" | "manager" | "staff";
  version: number;
  config: Config;
  bookings?: Booking[];
  notifications: { queued?: number; failed?: number };
};
export type Decision = { id: string; expected: string; next: string };
export type Action = (payload: Record<string, unknown>) => Promise<boolean>;
export const formatTime = (s: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(s));
export const formatDay = (date: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kuala_Lumpur",
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00+08:00`));
const statusLabels: Record<string, string> = {
  confirmed: "Confirm",
  declined: "Reject",
  seated: "Seat guests",
  completed: "Complete",
  no_show: "No-show",
  cancelled: "Cancel",
};
export function ReservationDetails({
  booking: b,
  config,
  now,
  busy,
  error,
  editing,
  setEditing,
  decision,
  setDecision,
  close,
  action,
  admin = false,
}: {
  booking: Booking;
  config: Config;
  now: number;
  busy: boolean;
  error: string;
  editing: boolean;
  setEditing: (value: boolean) => void;
  decision: Decision | null;
  setDecision: (value: Decision | null) => void;
  close: () => void;
  action: Action;
  admin?: boolean;
}) {
  const { t, locale, errorText } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [room, setRoom] = useState(b.room || "");
  const [archivePrompt, setArchivePrompt] = useState(false);
  useEffect(() => {
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  useEffect(() => setRoom(b.room || ""), [b.room]);
  const current = displayStatus(b, now),
    canEdit =
      b.area === "private" &&
      Date.parse(b.starts_at) > now &&
      ["pending", "confirmed"].includes(current);
  const chat = whatsappUrl(b.phone);
  const actions = availableActions(b, now);
  async function saveRoom(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (await action({ action: "assign", id: b.id, room })) setEditing(false);
  }
  async function confirmDecision() {
    if (
      decision &&
      (await action({
        action: "status",
        id: decision.id,
        expected: decision.expected,
        status: decision.next,
      }))
    )
      setDecision(null);
  }
  return (
    <dialog
      ref={dialog}
      className="reservation-dialog"
      aria-labelledby="detail-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) close();
      }}
    >
      <div className="dialog-header">
        <span className="eyebrow">{t("Reservation details")}</span>
        <LanguageSwitcher />
        <button
          className="dialog-close"
          autoFocus
          disabled={busy}
          onClick={close}
          aria-label={t("Close reservation details")}
        >
          ×
        </button>
      </div>
      <div className="dialog-body">
        <div className="detail-heading">
          <div>
            <span className="reference">{b.reference}</span>
            <h2 id="detail-title">{b.name}</h2>
          </div>
          <span className={`badge ${current}`}>
            {t(current === "declined" ? "Rejected" : current)}
          </span>
        </div>
        <div className={`detail-area ${b.area}`}>
          <span>{t("Dining area")}</span>
          <strong>
            {t(b.area === "counter" ? "Counter Seating" : "Private Room")}
          </strong>
          {b.room && (
            <small>
              {config.rooms.find((r) => r.id === b.room)?.name || b.room}
            </small>
          )}
        </div>
        <dl className="detail-facts">
          <dt>{t("Service date")}</dt>
          <dd>{formatDay(serviceDay(b.starts_at), locale)}</dd>
          <dt>{t("When")}</dt>
          <dd>
            {formatTime(b.starts_at, locale)} – {formatTime(b.ends_at, locale)}
          </dd>
          <dt>{t("Guests")}</dt>
          <dd>{b.guests}</dd>
          <dt>{t("Phone / WhatsApp")}</dt>
          <dd>
            <a href={`tel:${b.phone}`}>{b.phone}</a>
          </dd>
          {b.email && (
            <>
              <dt>{t("Email")}</dt>
              <dd>
                <a href={`mailto:${b.email}`}>{b.email}</a>
              </dd>
            </>
          )}
          {b.minimum_spend > 0 && (
            <>
              <dt>{t("Minimum spend")}</dt>
              <dd>RM {Number(b.minimum_spend).toFixed(2)}</dd>
            </>
          )}
        </dl>
        {b.requests && (
          <div className="detail-requests">
            <h3>{t("Special requests")}</h3>
            <p>{b.requests}</p>
          </div>
        )}
        {current === "pending" && (
          <p className="notice">
            {t("Hold expires")} {formatTime(b.expires_at, locale)}
          </p>
        )}
        {b.capacity_committed && (
          <p className="field-note">
            {t("Capacity remains occupied until")}{" "}
            {formatTime(b.ends_at, locale)}.
          </p>
        )}
        {error && (
          <p className="error" role="alert">
            {errorText(error)}
          </p>
        )}
        <div className="detail-action-grid">
          {actions.includes("confirmed") && (
            <button
              className="button"
              disabled={busy}
              onClick={() =>
                action({
                  action: "status",
                  id: b.id,
                  expected: b.status,
                  status: "confirmed",
                })
              }
            >
              {t("Confirm")}
            </button>
          )}
          {actions.includes("declined") && (
            <button
              className="secondary reject-action"
              disabled={busy}
              onClick={() =>
                setDecision({ id: b.id, expected: b.status, next: "declined" })
              }
            >
              {t("Reject")}
            </button>
          )}
          <button
            className="secondary"
            disabled={!canEdit || busy}
            onClick={() => setEditing(!editing)}
            title={
              !canEdit
                ? t("Only future private-room assignments can be edited.")
                : t("Edit room assignment")
            }
          >
            {t("Edit")}
          </button>
          {chat && (
            <a
              className="secondary whatsapp-action"
              href={chat}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp ↗
            </a>
          )}
        </div>
        <p className="field-note">
          {t(
            "WhatsApp opens a manual chat. Automated reservation notifications are unchanged.",
          )}
        </p>
        {editing && canEdit && (
          <form className="room-editor" onSubmit={saveRoom}>
            <h3>{t("Edit room assignment")}</h3>
            <p className="field-note">
              {t("Guest details, party size and dining times are read-only.")}
            </p>
            <label>
              {t("Internal room assignment")}
              <select
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                disabled={busy}
              >
                {config.rooms
                  .filter((r) => r.enabled && r.capacity >= b.guests)
                  .map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} · {r.capacity} {t("guests")}
                    </option>
                  ))}
              </select>
            </label>
            <div className="staff-actions">
              <button
                className="button compact"
                disabled={busy || room === b.room}
              >
                {t("Save room assignment")}
              </button>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => {
                  setEditing(false);
                  setRoom(b.room || "");
                }}
              >
                {t("Discard changes")}
              </button>
            </div>
            <p className="field-note">
              {t("Room availability is checked again when you save.")}
            </p>
          </form>
        )}
        {!canEdit && (
          <p className="field-note">
            {t("Only future private-room assignments can be edited.")}
          </p>
        )}
        {decision && (
          <section
            className="decision-panel"
            aria-label={t("Confirm status change")}
          >
            <h3>
              {t("Change reservation to {status}?", {
                status: t(decision.next),
              })}
            </h3>
            <p>
              {t(
                "A pre-start cancellation or rejection releases capacity. After the scheduled start, the original interval stays reserved.",
              )}
            </p>
            <div className="staff-actions">
              <button
                className="button compact"
                disabled={busy}
                onClick={confirmDecision}
              >
                {busy ? t("Saving…") : t("Confirm change")}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => setDecision(null)}
              >
                {t("Keep reservation")}
              </button>
            </div>
          </section>
        )}
        {actions.filter((s) => !["confirmed", "declined"].includes(s)).length >
          0 && (
          <div className="service-actions">
            <h3>{t("Service actions")}</h3>
            <div className="staff-actions">
              {actions
                .filter((s) => !["confirmed", "declined"].includes(s))
                .map((s) => (
                  <button
                    className="secondary"
                    key={s}
                    disabled={busy}
                    onClick={() => {
                      if (["cancelled", "no_show"].includes(s))
                        setDecision({ id: b.id, expected: b.status, next: s });
                      else
                        void action({
                          action: "status",
                          id: b.id,
                          expected: b.status,
                          status: s,
                        });
                    }}
                  >
                    {t(statusLabels[s])}
                  </button>
                ))}
            </div>
          </div>
        )}
        {admin && (
          <section className="archive-section">
            <button
              className="secondary"
              disabled={
                busy ||
                (!b.archived &&
                  (![
                    "completed",
                    "cancelled",
                    "declined",
                    "expired",
                    "no_show",
                  ].includes(current) ||
                    (holdsCapacity(b, now) && Date.parse(b.ends_at) > now)))
              }
              onClick={() => setArchivePrompt(!archivePrompt)}
            >
              {t(b.archived ? "Restore reservation" : "Admin Archive")}
            </button>
            <p className="field-note">
              {t(
                "Archiving preserves the reservation, capacity rules and audit history. Active commitments cannot be archived.",
              )}
            </p>
            {archivePrompt && (
              <div className="decision-panel">
                <h3>
                  {t(
                    b.archived
                      ? "Restore this reservation?"
                      : "Archive this reservation?",
                  )}
                </h3>
                <div className="staff-actions">
                  <button
                    className="button compact"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await action({
                          action: "archive",
                          id: b.id,
                          archived: !b.archived,
                        })
                      )
                        setArchivePrompt(false);
                    }}
                  >
                    {t("Confirm change")}
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => setArchivePrompt(false)}
                  >
                    {t("Keep reservation")}
                  </button>
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </dialog>
  );
}
export function Timeline({
  bookings,
  config,
  date,
  now,
}: {
  bookings: Booking[];
  config: Config;
  date: string;
  now: number;
}) {
  const { t, locale } = useLanguage();
  const rows = occupancyRows(bookings, date, now);
  return (
    <section className="occupancy-section" aria-labelledby="timeline-title">
      <div className="desk-section-heading">
        <div>
          <span className="eyebrow">{t("READ ONLY")}</span>
          <h2 id="timeline-title">{t("Availability Timeline")}</h2>
        </div>
        <span className="readonly-label">{t("Occupancy view")}</span>
      </div>
      <p className="field-note">
        {t(
          "Original dining intervals, including retained capacity after cancellation or no-show. This is an occupancy view, not bookable availability.",
        )}
      </p>
      <p className="field-note">
        {t("All capacity and operating-hour settings are in Admin Settings.")}
      </p>
      <p className="timeline-day">
        {formatDay(date, locale)} · {t("Malaysia time (UTC+8)")}
      </p>
      <div className="timeline-scroll">
        <div className="timeline-chart">
          <div className="timeline-axis">
            <span />
            {["00:00", "06:00", "12:00", "18:00", "24:00"].map((time) => (
              <span key={time}>{time}</span>
            ))}
          </div>
          {(["counter", "private"] as const).map((area) => (
            <div className="timeline-area" key={area}>
              <h3>
                {t(area === "counter" ? "Counter Seating" : "Private Room")}
              </h3>
              {rows.filter((r) => r.booking.area === area).length ? (
                rows
                  .filter((r) => r.booking.area === area)
                  .map(({ booking: b, left, width }) => (
                    <div className="timeline-row" key={b.id}>
                      <div className="timeline-row-label">
                        <strong>{b.name}</strong>
                        <span>
                          {b.guests} {t("guests")} · {t(displayStatus(b, now))}
                          {b.room &&
                            ` · ${config.rooms.find((r) => r.id === b.room)?.name || b.room}`}
                        </span>
                      </div>
                      <div className="timeline-track">
                        <div
                          className={`occupancy-bar ${area} ${displayStatus(b, now)}`}
                          style={{ left: `${left}%`, width: `${width}%` }}
                          title={`${b.reference} · ${formatTime(b.starts_at, locale)} – ${formatTime(b.ends_at, locale)}`}
                        >
                          <span>
                            {formatTime(b.starts_at, locale)} –{" "}
                            {formatTime(b.ends_at, locale)}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))
              ) : (
                <p className="timeline-empty">
                  {t("No capacity commitments for this area.")}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
      <p className="field-note">
        {t(
          "Includes all capacity commitments for this day, independent of reservation search filters. Overnight intervals are clipped to the selected day.",
        )}
      </p>
    </section>
  );
}
export function Settings({
  data,
  busy,
  save,
}: {
  data: Data;
  busy: boolean;
  save: (c: Config) => Promise<void>;
}) {
  const { t, errorText } = useLanguage();
  const [c, setC] = useState<Config>({
    ...launchDefaults,
    ...data.config,
    operatingHours: data.config.operatingHours ?? officialHours,
  });
  const [rooms, setRooms] = useState(JSON.stringify(c.rooms, null, 2));
  const [services, setServices] = useState(JSON.stringify(c.services, null, 2));
  const [closures, setClosures] = useState(JSON.stringify(c.closures, null, 2));
  const [error, setError] = useState("");
  function setArea(
    a: "counter" | "private",
    key: string,
    value: number | boolean,
  ) {
    setC({ ...c, [a]: { ...c[a], [key]: value } });
  }
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    try {
      const config = {
        ...c,
        rooms: JSON.parse(rooms),
        services: JSON.parse(services),
        closures: JSON.parse(closures),
      };
      const { configSchema } = await import("@/lib/schema");
      const result = configSchema.safeParse(config);
      if (!result.success)
        throw Error("Please check the settings and JSON format.");
      await save(result.data);
    } catch (e) {
      setError("Please check the settings and JSON format.");
    }
  }
  return (
    <form className="settings" onSubmit={submit}>
      <span className="eyebrow">{t("ADMINISTRATION")}</span>
      <h2>{t("Shape your service")}</h2>
      <p className="notice">
        {t(
          "New installations start closed. Enter verified inventory and service times before enabling bookings. Inventory changes are blocked while active reservations remain. Existing bookings retain their dining duration and minimum spend.",
        )}
      </p>
      <section className="hours-settings">
        <h3>{t("Operating hours · Malaysia time")}</h3>
        <p className="field-note">
          {t(
            "Official defaults: Monday closed. Tuesday–Friday dinner 18:00–22:30. Saturday–Sunday lunch 12:00–14:30 and dinner 18:00–22:30.",
          )}
        </p>
        {[1, 2, 3, 4, 5, 6, 0].map((day) => {
          const current = c.operatingHours.find((h) => h.day === day)!;
          return (
            <div className="hours-setting-day" key={day}>
              <strong>
                {t(
                  [
                    "Sunday",
                    "Monday",
                    "Tuesday",
                    "Wednesday",
                    "Thursday",
                    "Friday",
                    "Saturday",
                  ][day],
                )}
              </strong>
              {day === 1 ? (
                <span>{t("Closed")}</span>
              ) : (
                <div>
                  {current.periods.map((period, index) => (
                    <div className="hours-period" key={index}>
                      <label>
                        {t("Service starts")}
                        <input
                          type="time"
                          required
                          value={period.start}
                          onChange={(e) =>
                            setC({
                              ...c,
                              operatingHours: c.operatingHours.map((h) =>
                                h.day === day
                                  ? {
                                      ...h,
                                      periods: h.periods.map((p, i) =>
                                        i === index
                                          ? { ...p, start: e.target.value }
                                          : p,
                                      ),
                                    }
                                  : h,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        {t("Service ends")}
                        <input
                          type="time"
                          required
                          value={period.end}
                          onChange={(e) =>
                            setC({
                              ...c,
                              operatingHours: c.operatingHours.map((h) =>
                                h.day === day
                                  ? {
                                      ...h,
                                      periods: h.periods.map((p, i) =>
                                        i === index
                                          ? { ...p, end: e.target.value }
                                          : p,
                                      ),
                                    }
                                  : h,
                              ),
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          setC({
                            ...c,
                            operatingHours: c.operatingHours.map((h) =>
                              h.day === day
                                ? {
                                    ...h,
                                    periods: h.periods.filter(
                                      (_, i) => i !== index,
                                    ),
                                  }
                                : h,
                            ),
                          })
                        }
                      >
                        {t("Remove period")}
                      </button>
                    </div>
                  ))}
                  {current.periods.length < 4 && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        setC({
                          ...c,
                          operatingHours: c.operatingHours.map((h) =>
                            h.day === day
                              ? {
                                  ...h,
                                  periods: [
                                    ...h.periods,
                                    { start: "18:00", end: "22:30" },
                                  ],
                                }
                              : h,
                          ),
                        })
                      }
                    >
                      {t("Add service period")}
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        <button
          type="button"
          className="secondary"
          onClick={() =>
            setC({
              ...c,
              operatingHours: officialHours,
              services: c.services.filter((s) => s.date !== undefined),
            })
          }
        >
          {t("Restore official weekly hours")}
        </button>
        <label className="arrival-interval">
          {t("Booking arrival interval (minutes)")}
          <input
            type="number"
            min={5}
            max={120}
            required
            value={c.arrivalInterval}
            onChange={(e) =>
              setC({ ...c, arrivalInterval: Number(e.target.value) })
            }
          />
        </label>
        <p className="field-note">
          {t(
            "Arrivals start at service opening and follow this interval. The full area-specific dining duration must finish by service closing.",
          )}
        </p>
      </section>
      <section className="launch-settings">
        <h3>{t("Public booking readiness")}</h3>
        <p className="notice">
          {t(
            "Do not open public bookings until actual counter capacity, private-room inventory and booking policies have been confirmed. Existing reservations are preserved.",
          )}
        </p>
        {(["capacitiesConfirmed", "policiesConfirmed"] as const).map((key) => (
          <label className="checkbox" key={key}>
            <input
              type="checkbox"
              checked={c[key]}
              onChange={(e) =>
                setC({
                  ...c,
                  [key]: e.target.checked,
                  publicBookingsEnabled: e.target.checked
                    ? c.publicBookingsEnabled
                    : false,
                })
              }
            />
            <span>
              {t(
                key === "capacitiesConfirmed"
                  ? "Actual seating capacities and room inventory are confirmed."
                  : "Booking and privacy policies are approved.",
              )}
            </span>
          </label>
        ))}
        <label className="checkbox">
          <input
            type="checkbox"
            checked={c.publicBookingsEnabled}
            disabled={!c.capacitiesConfirmed || !c.policiesConfirmed}
            onChange={(e) =>
              setC({ ...c, publicBookingsEnabled: e.target.checked })
            }
          />
          <span>{t("Enable public bookings")}</span>
        </label>
        <p className="field-note">
          {t(
            c.publicBookingsEnabled
              ? "Public booking launch switch is on."
              : "Public bookings are closed.",
          )}
        </p>
      </section>
      <div className="settings-grid">
        {(["counter", "private"] as const).map((a) => (
          <div key={a}>
            <h3>
              {a === "counter" ? t("Counter Seating") : t("Private Room")}
            </h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={c[a].enabled}
                onChange={(e) => setArea(a, "enabled", e.target.checked)}
              />
              <span>{t("Enable online availability")}</span>
            </label>
            {(a === "counter"
              ? ["capacity", "min", "max", "duration", "minimumSpend"]
              : ["min", "max", "duration", "minimumSpend"]
            ).map((k) => (
              <label key={k}>
                {
                  {
                    capacity: t("Total counter seats"),
                    min: t("Minimum guests"),
                    max: t("Maximum guests"),
                    duration: t("Dining duration (minutes)"),
                    minimumSpend: t("Minimum spend (RM per booking)"),
                  }[k]
                }
                <input
                  type="number"
                  min={
                    k === "capacity" || k === "minimumSpend"
                      ? 0
                      : k === "duration"
                        ? 15
                        : 1
                  }
                  max={
                    k === "capacity"
                      ? 1000
                      : k === "duration"
                        ? 480
                        : k === "minimumSpend"
                          ? 100000
                          : 200
                  }
                  step={k === "minimumSpend" ? "0.01" : "1"}
                  required
                  value={c[a][k as keyof Config["counter"]] as number}
                  onChange={(e) => setArea(a, k, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="two-col">
        {(["noticeMinutes", "advanceDays", "holdMinutes"] as const).map((k) => (
          <label key={k}>
            {
              {
                noticeMinutes: t("Advance notice (minutes)"),
                advanceDays: t("Booking horizon (days)"),
                holdMinutes: t("Pending capacity hold (minutes)"),
              }[k]
            }
            <input
              type="number"
              required
              min={k === "holdMinutes" ? 5 : k === "advanceDays" ? 1 : 0}
              max={
                k === "holdMinutes" ? 1440 : k === "advanceDays" ? 365 : 43200
              }
              value={c[k]}
              onChange={(e) => setC({ ...c, [k]: Number(e.target.value) })}
            />
          </label>
        ))}
      </div>
      <h3>{t("Private-room inventory")}</h3>
      <p className="field-note">
        {t(
          "One object per room: id, name, capacity, enabled. These details are visible only to staff. Example structure:",
        )}{" "}
        {t('[{"id":"room-a","name":"Room A","capacity":6,"enabled":true}]')}
        {t(". Example capacity is illustrative.")}
      </p>
      <textarea
        aria-label={t("Private room inventory JSON")}
        rows={7}
        value={rooms}
        onChange={(e) => setRooms(e.target.value)}
      />
      <h3>{t("Available booking times")}</h3>
      <p className="field-note">
        {t(
          "Optional start-time overrides by area: use day (0 Sunday to 6 Saturday) or date (YYYY-MM-DD). An empty array uses the weekly service windows and arrival interval. Overrides must still fit a complete dining interval within service hours; Monday stays closed.",
        )}
      </p>
      <p className="field-note">
        {t("Example structure:")}{" "}
        {t('{"day":2,"area":"counter","times":["18:00","20:00"]}')}
        {t(
          ". A date-specific empty times array closes that date for the selected area. Existing reservations keep their original dining intervals.",
        )}
      </p>
      <textarea
        aria-label={t("Service times JSON")}
        rows={9}
        value={services}
        onChange={(e) => setServices(e.target.value)}
      />
      <h3>{t("Temporary closures")}</h3>
      <p className="field-note">
        {t(
          "Each entry has area (all, counter or private), start and end in ISO format with +08:00. Any overlapping dining interval is unavailable for new requests. Closures do not cancel existing bookings; contact affected guests.",
        )}
      </p>
      <textarea
        aria-label={t("Temporary closures JSON")}
        rows={5}
        value={closures}
        onChange={(e) => setClosures(e.target.value)}
      />
      {error && (
        <p className="error" role="alert">
          {errorText(error)}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? t("Saving…") : t("Save booking settings")} ↗
      </button>
    </form>
  );
}
