"use client";
import { useLanguage, LanguageSwitcher } from "@/lib/language";
import { useEffect, useRef, useState } from "react";
import type { z } from "zod";
import type { configSchema } from "@/lib/schema";
import {
  serviceDay,
  displayStatus,
  sortArrivals,
  availableActions,
  occupancyRows,
  whatsappUrl,
} from "@/lib/staff-view.mjs";
type Config = z.infer<typeof configSchema>;
type Booking = {
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
};
type Data = {
  role: "admin" | "manager" | "staff";
  version: number;
  config: Config;
  bookings: Booking[];
  notifications: { queued?: number; failed?: number };
};
type Decision = { id: string; expected: string; next: string };
type Action = (payload: Record<string, unknown>) => Promise<boolean>;
const formatTime = (s: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(s));
const formatDay = (date: string, locale: string) =>
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
export default function Staff() {
  const { t, locale, errorText } = useLanguage();
  const [data, setData] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(true),
    [refreshing, setRefreshing] = useState(false);
  const [view, setView] = useState<"reservations" | "timeline" | "settings">(
    "reservations",
  );
  const [date, setDate] = useState(serviceDay(new Date().toISOString())),
    [query, setQuery] = useState(""),
    [area, setArea] = useState("all"),
    [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<string | null>(null),
    [decision, setDecision] = useState<Decision | null>(null),
    [editing, setEditing] = useState(false);
  const [now, setNow] = useState(Date.now()),
    [updated, setUpdated] = useState<string | null>(null);
  const mutation = useRef(false);
  async function load() {
    let r = await fetch("/api/staff");
    if (r.status === 401) {
      const refresh = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (refresh.ok) r = await fetch("/api/staff");
    }
    if (!r.ok) {
      setData(null);
      if (r.status !== 401) {
        const result = await r.json();
        setError(result.error);
      }
      return;
    }
    setData(await r.json());
    setNow(Date.now());
    setUpdated(new Date().toISOString());
  }
  useEffect(() => {
    void load()
      .catch(() => setError("Unable to connect."))
      .finally(() => setChecking(false));
    const timer = setInterval(() => {
      setNow(Date.now());
      void load().catch(() =>
        setError(
          "Could not refresh. Displayed reservations may be out of date.",
        ),
      );
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  async function refresh() {
    setRefreshing(true);
    try {
      await load();
    } catch {
      setError("Unable to refresh.");
    } finally {
      setRefreshing(false);
    }
  }
  async function action(payload: Record<string, unknown>) {
    if (mutation.current) return false;
    mutation.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await r.json();
      if (!r.ok) throw Error(result.error);
      if (payload.action === "logout") {
        setData(null);
        setSelected(null);
        setDecision(null);
        setView("reservations");
        return true;
      }
      await load();
      setMessage(payload.action === "login" ? "Signed in." : "Saved.");
      if (payload.action === "login") window.scrollTo({ top: 0 });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete request.");
      return false;
    } finally {
      setBusy(false);
      mutation.current = false;
    }
  }
  async function login(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    await action({
      action: "login",
      email: f.get("email"),
      password: f.get("password"),
    });
  }
  const todayDate = serviceDay(new Date(now).toISOString());
  const todays =
    data?.bookings.filter((b) => serviceDay(b.starts_at) === todayDate) || [];
  const activeToday = todays.filter((b) =>
    ["pending", "confirmed", "seated", "completed"].includes(
      displayStatus(b, now),
    ),
  );
  const filtered = sortArrivals(
    data?.bookings.filter(
      (b) =>
        (!date || serviceDay(b.starts_at) === date) &&
        (area === "all" || b.area === area) &&
        (status === "all" || displayStatus(b, now) === status) &&
        `${b.name} ${b.reference} ${b.phone}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) || [],
  );
  const pending = filtered.filter((b) => displayStatus(b, now) === "pending");
  const arrivals = filtered.filter((b) => displayStatus(b, now) !== "pending");
  const days = [...new Set(arrivals.map((b) => serviceDay(b.starts_at)))];
  const booking = data?.bookings.find((b) => b.id === selected);
  function open(b: Booking, edit = false, next?: string) {
    setSelected(b.id);
    setEditing(edit);
    setDecision(next ? { id: b.id, expected: b.status, next } : null);
    setError("");
  }
  function close() {
    setSelected(null);
    setDecision(null);
    setEditing(false);
  }
  function todayFilter(value: string) {
    setDate(todayDate);
    setStatus(value);
    setArea("all");
    setQuery("");
    setView("reservations");
  }
  function card(b: Booking) {
    const current = displayStatus(b, now);
    return (
      <article
        className={`desk-reservation ${current === "pending" ? "needs-attention" : ""}`}
        key={b.id}
      >
        <div className="arrival-time">
          <strong>{formatTime(b.starts_at, locale)}</strong>
          <span>{formatTime(b.ends_at, locale)}</span>
        </div>
        <div className="reservation-person">
          <div className="reservation-name">
            <h3>{b.name}</h3>
            <span className={`badge ${current}`}>{t(current)}</span>
          </div>
          <span className="reference">{b.reference}</span>
          <div className="reservation-meta">
            <span className={`area-label ${b.area}`}>
              {t(b.area === "counter" ? "Counter Seating" : "Private Room")}
            </span>
            <span>
              {b.guests} {t("guests")}
            </span>
            {b.requests && (
              <span className="request-indicator">{t("Special requests")}</span>
            )}
          </div>
          {current === "pending" && (
            <p className="hold-warning">
              {t("Hold expires")} {formatTime(b.expires_at, locale)}
            </p>
          )}
          {b.capacity_committed &&
            [
              "completed",
              "cancelled",
              "no_show",
              "expired",
              "declined",
            ].includes(current) && (
              <p>
                {t("Capacity remains occupied until")}{" "}
                {formatTime(b.ends_at, locale)}
              </p>
            )}
        </div>
        <div className="desk-row-actions">
          {current === "pending" && (
            <>
              <button
                className="button compact"
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
              <button
                className="secondary"
                disabled={busy}
                onClick={() => open(b, false, "declined")}
              >
                {t("Reject")}
              </button>
            </>
          )}
          <button
            className="secondary"
            onClick={() => open(b)}
            aria-label={t("View reservation {reference}", {
              reference: b.reference,
            })}
          >
            {t("Details")} ↗
          </button>
        </div>
      </article>
    );
  }
  return (
    <main id="main" className="staff-main staff-desk">
      {checking ? (
        <p className="notice">{t("Checking your session…")}</p>
      ) : !data ? (
        <form className="booking-panel login" onSubmit={login}>
          <span className="eyebrow">{t("ABURII · STAFF ACCESS")}</span>
          <h1 style={{ marginTop: 20 }}>
            {t("A warm welcome")}
            <br />
            <em>{t("starts with you.")}</em>
          </h1>
          <p className="field-note">
            {t("Sign in with your Aburii staff account.")}
          </p>
          <label>
            {t("Email")}
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            {t("Password")}
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              required
              maxLength={200}
            />
          </label>
          {error && (
            <p role="alert" className="error">
              {errorText(error)}
            </p>
          )}
          <button className="button submit" disabled={busy}>
            {busy ? t("Signing in…") : t("Sign in")} ↗
          </button>
        </form>
      ) : (
        <>
          <div className="staff-title">
            <div>
              <span className="eyebrow">
                {t("SERVICE, WITH CARE · ")}
                {t(data.role)}
              </span>
              <h1>{t("Reservation desk")}</h1>
              <p className="field-note">
                {t("All times in Malaysia time · refreshes every minute")}
                {updated && (
                  <>
                    {" "}
                    ·{" "}
                    {t("Updated at {time}", {
                      time: formatTime(updated, locale),
                    })}
                  </>
                )}
              </p>
            </div>
            <div className="staff-actions">
              <button
                className="secondary"
                disabled={refreshing || busy}
                onClick={refresh}
              >
                {refreshing ? t("Refreshing…") : t("↻ Refresh")}
              </button>
              <button
                className="secondary"
                disabled={busy}
                onClick={() => action({ action: "logout" })}
              >
                {t("Sign out")}
              </button>
            </div>
          </div>
          {error && !booking && (
            <p className="error" role="alert">
              {errorText(error)}
            </p>
          )}
          {message && (
            <p className="desk-feedback" role="status">
              {t(message)}
            </p>
          )}
          <section className="desk-overview" aria-label={t("Today at Aburii")}>
            <div className="overview-caption">
              <span className="eyebrow">{t("TODAY AT ABURII")}</span>
              <span>{formatDay(todayDate, locale)}</span>
            </div>
            <div className="dashboard-stats">
              <Stat
                title={t("Today's Reservations")}
                value={activeToday.length}
                hint={t("Active reservations today")}
                onClick={() => todayFilter("all")}
              />
              <Stat
                title={t("Pending")}
                value={
                  todays.filter((b) => displayStatus(b, now) === "pending")
                    .length
                }
                hint={t("Review and respond")}
                attention
                onClick={() => todayFilter("pending")}
              />
              <Stat
                title={t("Confirmed")}
                value={
                  todays.filter((b) => displayStatus(b, now) === "confirmed")
                    .length
                }
                hint={t("Ready for arrival")}
                onClick={() => todayFilter("confirmed")}
              />
              <Stat
                title={t("Total Guests")}
                value={activeToday.reduce((a, b) => a + b.guests, 0)}
                hint={t("Includes pending requests")}
              />
            </div>
          </section>
          <nav className="desk-tabs" aria-label={t("Staff navigation")}>
            <button
              aria-current={view === "reservations" ? "page" : undefined}
              onClick={() => setView("reservations")}
            >
              {t("Reservations")}
            </button>
            <button
              aria-current={view === "timeline" ? "page" : undefined}
              onClick={() => {
                if (!date) setDate(todayDate);
                setView("timeline");
              }}
            >
              {t("Availability Timeline")}
            </button>
            {data.role === "admin" && (
              <button
                aria-current={view === "settings" ? "page" : undefined}
                onClick={() => setView("settings")}
              >
                {t("Admin Settings")}
              </button>
            )}
          </nav>
          {view === "settings" && data.role === "admin" ? (
            <Settings
              key={data.version}
              data={data}
              busy={busy}
              save={async (config) => {
                await action({
                  action: "config",
                  config,
                  version: data.version,
                });
              }}
            />
          ) : (
            <>
              <div className="desk-filter-bar">
                <label>
                  {t("Service date")}
                  <input
                    type="date"
                    value={date}
                    onInput={(e) => setDate(e.currentTarget.value)}
                    onChange={(e) => setDate(e.target.value)}
                  />
                </label>
                <button
                  className="secondary today-button"
                  onClick={() => setDate(todayDate)}
                >
                  {t("Today")}
                </button>
                {view === "reservations" && (
                  <>
                    <label>
                      {t("Dining area")}
                      <select
                        value={area}
                        onChange={(e) => setArea(e.target.value)}
                      >
                        <option value="all">{t("All areas")}</option>
                        <option value="counter">{t("Counter Seating")}</option>
                        <option value="private">{t("Private Room")}</option>
                      </select>
                    </label>
                    <label>
                      {t("Status")}
                      <select
                        value={status}
                        onChange={(e) => setStatus(e.target.value)}
                      >
                        <option value="all">{t("All statuses")}</option>
                        {[
                          "pending",
                          "confirmed",
                          "seated",
                          "completed",
                          "cancelled",
                          "declined",
                          "expired",
                          "no_show",
                        ].map((s) => (
                          <option value={s} key={s}>
                            {t(s)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="desk-search">
                      {t("Find a reservation")}
                      <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t("Name, phone or reference")}
                      />
                    </label>
                    <button
                      className="text-button"
                      onClick={() => {
                        setDate(todayDate);
                        setArea("all");
                        setStatus("all");
                        setQuery("");
                      }}
                    >
                      {t("Reset filters")}
                    </button>
                  </>
                )}
              </div>
              {view === "timeline" ? (
                <Timeline
                  bookings={data.bookings}
                  config={data.config}
                  date={date || todayDate}
                  now={now}
                />
              ) : (
                <>
                  <section
                    className="pending-section"
                    aria-labelledby="pending-heading"
                  >
                    <div className="desk-section-heading">
                      <div>
                        <span className="eyebrow">{t("ACTION REQUIRED")}</span>
                        <h2 id="pending-heading">
                          {t("Pending requests")}{" "}
                          <span className="count-pill">{pending.length}</span>
                        </h2>
                      </div>
                      <p>
                        {t(
                          "Sorted by arrival · confirm before the hold expires",
                        )}
                      </p>
                    </div>
                    {pending.length ? (
                      [
                        ...new Set(pending.map((b) => serviceDay(b.starts_at))),
                      ].map((d) => (
                        <div className="arrival-group" key={d}>
                          <h3 className="service-day-heading">
                            {formatDay(d, locale)}
                          </h3>
                          <div className="booking-list">
                            {pending
                              .filter((b) => serviceDay(b.starts_at) === d)
                              .map(card)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="pending-clear">
                        {t("No pending requests match these filters.")}
                      </p>
                    )}
                  </section>
                  <section
                    className="arrivals-section"
                    aria-labelledby="arrivals-heading"
                  >
                    <div className="desk-section-heading">
                      <div>
                        <span className="eyebrow">{t("SERVICE BOOK")}</span>
                        <h2 id="arrivals-heading">
                          {t("Arrivals")}{" "}
                          <span className="count-pill">{arrivals.length}</span>
                        </h2>
                      </div>
                      <p>{t("Grouped by date · earliest arrival first")}</p>
                    </div>
                    {days.length ? (
                      days.map((d) => (
                        <div className="arrival-group" key={d}>
                          <h3 className="service-day-heading">
                            {formatDay(d, locale)}
                          </h3>
                          <div className="booking-list">
                            {arrivals
                              .filter((b) => serviceDay(b.starts_at) === d)
                              .map(card)}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="empty-state">
                        <h3>{t("A clear service book.")}</h3>
                        <p>{t("No reservations match these filters.")}</p>
                      </div>
                    )}
                  </section>
                </>
              )}
            </>
          )}
          {data.notifications.failed !== undefined && (
            <details className="notification-health">
              <summary>
                {t("Notification delivery")} · {data.notifications.queued}{" "}
                {t("queued")} · {data.notifications.failed}{" "}
                {t("need attention")}
              </summary>
              <p className={data.notifications.failed ? "error" : "field-note"}>
                {t("WhatsApp delivery queue: ")}
                {data.notifications.queued}
                {t(" waiting ·")} {data.notifications.failed}
                {t(" exhausted retries.")}{" "}
                {data.notifications.failed
                  ? t(
                      "Check the notification worker and provider before resending manually.",
                    )
                  : ""}
              </p>
            </details>
          )}
          {booking && (
            <ReservationDetails
              key={booking.id}
              booking={booking}
              config={data.config}
              now={now}
              busy={busy}
              error={error}
              editing={editing}
              setEditing={setEditing}
              decision={decision}
              setDecision={setDecision}
              close={close}
              action={action}
            />
          )}
        </>
      )}
    </main>
  );
}
function Stat({
  title,
  value,
  hint,
  attention,
  onClick,
}: {
  title: string;
  value: number;
  hint: string;
  attention?: boolean;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </>
  );
  return onClick ? (
    <button
      className={`stat stat-button ${attention ? "pending-stat" : ""}`}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className="stat">{content}</div>
  );
}
function ReservationDetails({
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
}) {
  const { t, locale, errorText } = useLanguage();
  const dialog = useRef<HTMLDialogElement>(null);
  const [room, setRoom] = useState(b.room || "");
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
          <span className={`badge ${current}`}>{t(current)}</span>
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
      </div>
    </dialog>
  );
}
function Timeline({
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
function Settings({
  data,
  busy,
  save,
}: {
  data: Data;
  busy: boolean;
  save: (c: Config) => Promise<void>;
}) {
  const { t, errorText } = useLanguage();
  const [c, setC] = useState<Config>(data.config);
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
          "Each entry has area, times and either day (0 Sunday – 6 Saturday) or date (YYYY-MM-DD). A date-specific entry replaces weekly times for that area. Use an empty times array to close a date. Times are in MYT.",
        )}
      </p>
      <p className="field-note">
        {t("Example structure:")}{" "}
        {t('{"day":2,"area":"counter","times":["18:00","20:00"]}')}
        {t(
          ". List only approved start times; dining may continue for the configured duration after each start.",
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
