"use client";
import Link from "next/link";
import { activePending } from "@/lib/pending-approval.mjs";
import { whatsappUrl } from "@/lib/staff-view.mjs";
import { usePendingSound } from "./pending-sound";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/language";
import { serviceDay, displayStatus, sortArrivals } from "@/lib/staff-view.mjs";
import {
  ReservationDetails,
  Settings,
  Timeline,
  formatTime,
  formatDay,
} from "./components";
import type { Booking, Data, Decision } from "./components";
type Page = "dashboard" | "today" | "pending" | "settings";
type List = { bookings: Booking[]; total: number; page: number; size: number };
type Daily = { date: string; bookings: Booking[]; occupancy: Booking[] };
const defaults = {
  q: "",
  from: "",
  to: "",
  status: "all",
  area: "all",
  archive: "all",
  sort: "arrival",
  order: "desc",
  page: 1,
  size: 25,
};
export default function StaffWorkspace({ page }: { page: Page }) {
  const { t, locale, errorText } = useLanguage();
  const sound = usePendingSound();
  const [approvalQueue, setApprovalQueue] = useState<Booking[]>([]);
  const [confirmedChat, setConfirmedChat] = useState<Booking | null>(null);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const [data, setData] = useState<Data | null>(null),
    [list, setList] = useState<List>({
      bookings: [],
      total: 0,
      page: 1,
      size: 25,
    }),
    [daily, setDaily] = useState<Daily | null>(null);
  const [filters, setFilters] = useState(defaults),
    [query, setQuery] = useState(""),
    [debounced, setDebounced] = useState("");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(true);
  const [selected, setSelected] = useState<Booking | null>(null),
    [decision, setDecision] = useState<Decision | null>(null),
    [editing, setEditing] = useState(false),
    [updated, setUpdated] = useState<string | null>(null),
    [now, setNow] = useState(Date.now());
  const sequence = useRef(0),
    mutation = useRef(false),
    selectedId = useRef<string | null>(null);
  useEffect(() => {
    const id = setTimeout(() => {
      setDebounced(query);
      setFilters((f) => ({ ...f, page: 1 }));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);
  const params = new URLSearchParams({
    ...Object.fromEntries(
      Object.entries(filters).map(([k, v]) => [k, String(v)]),
    ),
    q: debounced,
    view: "list",
  }).toString();
  async function read(url: string) {
    let r = await fetch(url, { cache: "no-store" });
    if (r.status === 401) {
      const refresh = await fetch("/api/staff", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "refresh" }),
      });
      if (refresh.ok) r = await fetch(url, { cache: "no-store" });
    }
    if (!r.ok) {
      const d = await r.json();
      throw Object.assign(Error(d.error), { status: r.status });
    }
    return r.json();
  }
  async function load() {
    const id = ++sequence.current;
    setLoading(true);
    try {
      const context = await read("/api/staff?view=context");
      if (id !== sequence.current) return;
      setData(context);
      if (page === "dashboard") {
        const result = await read("/api/staff?" + params);
        if (id !== sequence.current) return;
        setList(result);
      }
      if (page === "today") {
        const result = await read("/api/staff?view=today");
        if (id !== sequence.current) return;
        setDaily(result);
      }
      const approvals: Booking[] = [];
      for (let n = 1; ; n++) {
        const result: List = await read(`/api/staff?view=list&status=pending&sort=arrival&order=asc&size=50&page=${n}`);
        if (id !== sequence.current) return;
        approvals.push(...result.bookings);
        if (n * result.size >= result.total) break;
      }
      setApprovalQueue(approvals);
      await sound.observe(activePending(approvals).map(b => b.id));
      if (selectedId.current) {
        const booking = await read(
          "/api/staff?view=detail&id=" + selectedId.current,
        );
        if (id !== sequence.current) return;
        setSelected(booking);
      }
      setUpdated(new Date().toISOString());
      setNow(Date.now());
      setError("");
    } catch (e) {
      if (id !== sequence.current) return;
      if ((e as { status?: number }).status === 401) {
        setData(null);
        setApprovalQueue([]);
        setConfirmedChat(null);
        setSelected(null);
        selectedId.current = null;
      } else setError(e instanceof Error ? e.message : "Unable to refresh.");
    } finally {
      if (id === sequence.current) {
        setLoading(false);
        setChecking(false);
      }
    }
  }
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 15000);
    return () => {
      clearInterval(timer);
      sequence.current++;
    };
  }, [page, params, sound.enabled]);
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
        sequence.current++;
        setData(null);
        setApprovalQueue([]);
        setConfirmedChat(null);
        setSelected(null);
        selectedId.current = null;
        return true;
      }
      if (payload.action === "status") {
        setApprovalQueue(queue => queue.filter(b => b.id !== payload.id));
        if (payload.status === "confirmed") {
          const booking = approvalQueue.find(b => b.id === payload.id);
          if (booking) setConfirmedChat(booking);
        }
      }
      await load();
      setMessage(payload.action === "login" ? "Signed in." : "Saved.");
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
  function filter(key: string, value: string | number) {
    setFilters((f) => ({ ...f, [key]: value, page: 1 }));
  }
  function sort(key: string) {
    setFilters((f) => ({
      ...f,
      sort: key,
      order: f.sort === key && f.order === "asc" ? "desc" : "asc",
      page: 1,
    }));
  }
  function open(b: Booking, next?: string) {
    if (loading) return;
    setSelected(b);
    selectedId.current = b.id;
    setDecision(next ? { id: b.id, expected: b.status, next } : null);
    setEditing(false);
    setError("");
  }
  function close() {
    setSelected(null);
    selectedId.current = null;
    setDecision(null);
    setEditing(false);
  }
  const statusText = (s: string) => t(s === "declined" ? "Rejected" : s);
  const today = daily?.date || serviceDay(new Date(now).toISOString());
  const records =
    page === "today"
      ? sortArrivals(daily?.bookings || []).sort(
          (a, b) =>
            Number(displayStatus(b, now) === "pending") -
            Number(displayStatus(a, now) === "pending"),
        )
      : page === "pending" ? activePending(approvalQueue, now) : list.bookings;
  const pending = (daily?.bookings || []).filter(
    (b) => displayStatus(b, now) === "pending",
  );
  const totalGuests = (daily?.bookings || [])
    .filter((b) =>
      ["pending", "confirmed", "seated", "completed"].includes(
        displayStatus(b, now),
      ),
    )
    .reduce((n, b) => n + b.guests, 0);
  const title =
    page === "dashboard"
      ? "Dashboard"
      : page === "today"
        ? "Today"
        : page === "pending" ? "Pending Approval" : "Settings";
  const columns = [
    ["arrival", "Date & time"],
    ["name", "Customer"],
    ["guests", "Guests"],
    ["area", "Seating area"],
    ["status", "Status"],
  ];
  function quickActions(b: Booking) {
    return (
      <div className="compact-row-actions" onClick={(e) => e.stopPropagation()}>
        {(page === "today" || page === "pending") && displayStatus(b, now) === "pending" && (
          <>
            <button
              className="button compact"
              disabled={busy || loading}
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
              disabled={busy || loading}
              onClick={() => open(b, "declined")}
            >
              {t("Reject")}
            </button>
          </>
        )}
        <button
          className="text-button"
          onClick={() => open(b)}
          aria-label={t("View reservation {reference}", {
            reference: b.reference,
          })}
        >
          {t(page === "pending" ? "View Details" : "Details")} ↗
        </button>
      </div>
    );
  }
  const rowData = (b: Booking) => {
    const current = displayStatus(b, now);
    return {
      current,
      seat: t(b.area === "counter" ? "Counter Seating" : "Private Room"),
      date: formatDay(serviceDay(b.starts_at), locale),
    };
  };
  return (
    <main id="main" className="staff-main staff-workspace">
      {checking ? (
        <p className="notice">{t("Checking your session…")}</p>
      ) : !data ? (
        <form className="booking-panel login" onSubmit={login}>
          <span className="eyebrow">{t("ABURII · STAFF ACCESS")}</span>
          <h1>{t("Sign in")}</h1>
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
            <p className="error" role="alert">
              {errorText(error)}
            </p>
          )}
          <button className="button submit" disabled={busy}>
            {busy ? t("Signing in…") : t("Sign in")} ↗
          </button>
        </form>
      ) : (
        <>
          <div className="workspace-header">
            <div>
              <span className="eyebrow">ABURII · {t(data.role)}</span>
              <h1>{t(title)}</h1>
              <p>
                {t(
                  page === "dashboard"
                    ? "All reservations · all dates"
                    : page === "today"
                      ? "Today’s service · Malaysia time"
                      : page === "pending" ? "Awaiting approval · all dates" : "Capacity, hours and booking policies",
                )}
                {updated && (
                  <span>
                    {" "}
                    ·{" "}
                    {t("Updated at {time}", {
                      time: formatTime(updated, locale),
                    })}
                  </span>
                )}
              </p>
            </div>
            <div className="staff-actions">
              <button
                className="secondary"
                disabled={loading || busy}
                onClick={() => void load()}
              >
                {loading ? t("Refreshing…") : t("↻ Refresh")}
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
          <nav className="workspace-nav" aria-label={t("Staff navigation")}>
            <Link
              href="/staff"
              aria-current={page === "dashboard" ? "page" : undefined}
            >
              {t("Dashboard")}
            </Link>
            <Link
              href="/staff/today"
              aria-current={page === "today" ? "page" : undefined}
            >
              {t("Today")}
            </Link>
            <Link href="/staff/pending" aria-current={page === "pending" ? "page" : undefined}>
              {t("Pending Approval")} <span className="pending-count" aria-live="polite">{activePending(approvalQueue, now).length}</span>
            </Link>
            {data.role === "admin" && (
              <Link
                href="/staff/settings"
                aria-current={page === "settings" ? "page" : undefined}
              >
                {t("Settings")}
              </Link>
            )}
          </nav>
          {error && !selected && (
            <p role="alert" className="error">
              {errorText(error)}
            </p>
          )}
          {message && (
            <p role="status" className="desk-feedback">
              {t(message)}
            </p>
          )}
          <div className="pending-tools">
            <button className="text-button" onClick={() => void sound.toggle()} aria-pressed={sound.enabled}>
              {t(sound.enabled ? "Sound notifications on" : "Enable sound notifications")}
            </button>
            {sound.failed && <span role="status">{t("Sound unavailable. Please use the live pending badge.")}</span>}
          </div>
          {confirmedChat && whatsappUrl(confirmedChat.phone) && (
            <div className="confirmation-chat" role="status">
              <span>{t("Reservation confirmed: {reference}", {reference: confirmedChat.reference})}</span>
              <a className="secondary" href={whatsappUrl(confirmedChat.phone)!} target="_blank" rel="noreferrer">{t("Open WhatsApp")} ↗</a>
              <button className="text-button" onClick={() => setConfirmedChat(null)}>{t("Dismiss")}</button>
            </div>
          )}
          {page === "settings" ? (
            data.role === "admin" ? (
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
              <p className="notice">{t("Admin access required.")}</p>
            )
          ) : (
            <>
              {page === "dashboard" ? (
                <form
                  className="reservation-filters"
                  onSubmit={(e) => e.preventDefault()}
                >
                  <label className="filter-search">
                    {t("Search reservations")}
                    <input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      maxLength={150}
                      placeholder={t("Name, phone or reference")}
                    />
                  </label>
                  <label>
                    {t("From date")}
                    <input
                      type="date"
                      value={filters.from}
                      onInput={(e) => filter("from", e.currentTarget.value)}
                      onChange={(e) => filter("from", e.target.value)}
                    />
                  </label>
                  <label>
                    {t("To date")}
                    <input
                      type="date"
                      min={filters.from || undefined}
                      value={filters.to}
                      onInput={(e) => filter("to", e.currentTarget.value)}
                      onChange={(e) => filter("to", e.target.value)}
                    />
                  </label>
                  <label>
                    {t("Status")}
                    <select
                      value={filters.status}
                      onChange={(e) => filter("status", e.target.value)}
                    >
                      {[
                        "all",
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
                          {s === "all" ? t("All statuses") : statusText(s)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t("Seating area")}
                    <select
                      value={filters.area}
                      onChange={(e) => filter("area", e.target.value)}
                    >
                      <option value="all">{t("All areas")}</option>
                      <option value="counter">{t("Counter Seating")}</option>
                      <option value="private">{t("Private Room")}</option>
                    </select>
                  </label>
                  <label>
                    {t("Archive")}
                    <select
                      value={filters.archive}
                      onChange={(e) => filter("archive", e.target.value)}
                    >
                      <option value="all">{t("All reservations")}</option>
                      <option value="active">{t("Not archived")}</option>
                      <option value="archived">{t("Archived")}</option>
                    </select>
                  </label>
                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      setFilters(defaults);
                      setQuery("");
                    }}
                  >
                    {t("Reset filters")}
                  </button>
                </form>
              ) : page === "today" ? (
                <>
                  <div
                    className="today-summary"
                    aria-label={t("Today at Aburii")}
                  >
                    <div>
                      <span>{t("Total Reservations")}</span>
                      <strong>{daily?.bookings.length || 0}</strong>
                    </div>
                    <div className="summary-pending">
                      <span>{t("Pending")}</span>
                      <strong>{pending.length}</strong>
                    </div>
                    <div>
                      <span>{t("Confirmed")}</span>
                      <strong>
                        {
                          (daily?.bookings || []).filter(
                            (b) => displayStatus(b, now) === "confirmed",
                          ).length
                        }
                      </strong>
                    </div>
                    <div>
                      <span>{t("Total Guests")}</span>
                      <strong>{totalGuests}</strong>
                    </div>
                  </div>
                  <div className="today-queue-note">
                    <strong>
                      {t("Pending to review: {count}", {
                        count: pending.length,
                      })}
                    </strong>
                    <span>
                      {t("Pending first, then arrivals in time order.")}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="list-caption">
                <span>
                  {page === "today"
                    ? formatDay(today, locale)
                    : t("{count} reservations", { count: page === "pending" ? records.length : list.total })}
                </span>
                <span>
                  {loading
                    ? t("Loading reservations…")
                    : t("Malaysia time (UTC+8)")}
                </span>
              </div>
              <section
                aria-label={t("Reservations")}
                aria-busy={loading}
                className={`reservation-results ${loading ? "is-loading" : ""}`}
              >
                <div className="reservation-table-wrap">
                  <table className="reservation-table">
                    <thead>
                      <tr>
                        {columns.map(([key, label]) => (
                          <th
                            key={key}
                            aria-sort={
                              page === "dashboard" && filters.sort === key
                                ? filters.order === "asc"
                                  ? "ascending"
                                  : "descending"
                                : undefined
                            }
                          >
                            {page === "dashboard" ? (
                              <button onClick={() => sort(key)}>
                                {t(label)}
                                {filters.sort === key ? (
                                  <span aria-hidden="true">
                                    {" "}
                                    {filters.order === "asc" ? "↑" : "↓"}
                                  </span>
                                ) : null}
                              </button>
                            ) : (
                              t(key === "arrival" ? "Arrival time" : label)
                            )}
                          </th>
                        ))}
                        <th>
                          <span className="sr-only">{t("Actions")}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {records.map((b) => {
                        const r = rowData(b);
                        return (
                          <tr
                            key={b.id}
                            className={
                              r.current === "pending" ? "pending-row" : ""
                            }
                            onClick={() => open(b)}
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (
                                e.target === e.currentTarget &&
                                (e.key === "Enter" || e.key === " ")
                              ) {
                                e.preventDefault();
                                open(b);
                              }
                            }}
                          >
                            <td>
                              <strong>
                                {page === "today"
                                  ? formatTime(b.starts_at, locale)
                                  : r.date}
                              </strong>
                              <span>
                                {page === "today" ? (
                                  t("Until {time}", {
                                    time: formatTime(b.ends_at, locale),
                                  })
                                ) : (
                                  <>
                                    {formatTime(b.starts_at, locale)} –{" "}
                                    {formatTime(b.ends_at, locale)}
                                  </>
                                )}
                              </span>
                            </td>
                            <td>
                              <strong>{b.name}</strong>
                              {page === "pending" && <span>{b.phone}</span>}
                              <span className="reference">
                                {b.reference}
                                {b.archived && <> · {t("Archived")}</>}
                              </span>
                            </td>
                            <td>{b.guests}</td>
                            <td>
                              <span className={`area-label ${b.area}`}>
                                {r.seat}
                              </span>
                            </td>
                            <td>
                              <span className={`badge ${r.current}`}>
                                {statusText(r.current)}
                              </span>
                            </td>
                            <td>{quickActions(b)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="reservation-mobile-list">
                  {records.map((b) => {
                    const r = rowData(b);
                    return (
                      <article
                        className={`reservation-mobile-card ${r.current === "pending" ? "pending-row" : ""}`}
                        key={b.id}
                        onClick={() => open(b)}
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (
                            e.target === e.currentTarget &&
                            (e.key === "Enter" || e.key === " ")
                          ) {
                            e.preventDefault();
                            open(b);
                          }
                        }}
                      >
                        <div className="mobile-record-heading">
                          <h2>{b.name}</h2>
                          <span className={`badge ${r.current}`}>
                            {statusText(r.current)}
                          </span>
                        </div>
                        <span className="reference">
                          {b.reference}
                          {b.archived && <> · {t("Archived")}</>}
                        </span>
                        {page === "pending" && <p>{b.phone}</p>}
                        <p>
                          {page === "today"
                            ? `${formatTime(b.starts_at, locale)} – ${formatTime(b.ends_at, locale)}`
                            : `${r.date} · ${formatTime(b.starts_at, locale)}`}
                        </p>
                        <div className="mobile-record-meta">
                          <span className={`area-label ${b.area}`}>
                            {r.seat}
                          </span>
                          <span>
                            {b.guests} {t("guests")}
                          </span>
                        </div>
                        {quickActions(b)}
                      </article>
                    );
                  })}
                </div>
                {!records.length && !loading && (
                  <p className="empty-reservation-list">
                    {t(page === "pending" ? "No reservations awaiting approval." : "No reservations match these filters.")}
                  </p>
                )}
              </section>
              {page === "dashboard" && (
                <div className="reservation-pagination">
                  <div>
                    <label>
                      {t("Rows per page")}
                      <select
                        value={filters.size}
                        onChange={(e) => filter("size", Number(e.target.value))}
                      >
                        {[10, 25, 50].map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {t("Sort by")}
                      <select
                        value={filters.sort}
                        onChange={(e) => filter("sort", e.target.value)}
                      >
                        {columns.map(([key, label]) => (
                          <option key={key} value={key}>
                            {t(label)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      className="secondary"
                      onClick={() =>
                        filter(
                          "order",
                          filters.order === "asc" ? "desc" : "asc",
                        )
                      }
                    >
                      {t(filters.order === "asc" ? "Ascending" : "Descending")}
                    </button>
                  </div>
                  <div>
                    <span>
                      {t("Page {page} of {pages}", {
                        page: list.page,
                        pages: Math.max(1, Math.ceil(list.total / list.size)),
                      })}
                    </span>
                    <button
                      className="secondary"
                      disabled={loading || list.page <= 1}
                      onClick={() =>
                        setFilters((f) => ({ ...f, page: list.page - 1 }))
                      }
                    >
                      {t("Previous")}
                    </button>
                    <button
                      className="secondary"
                      disabled={loading || list.page * list.size >= list.total}
                      onClick={() =>
                        setFilters((f) => ({ ...f, page: list.page + 1 }))
                      }
                    >
                      {t("Next")}
                    </button>
                  </div>
                </div>
              )}
              {page === "today" && (
                <details className="today-occupancy">
                  <summary>{t("Read-only occupancy timeline")}</summary>
                  <Timeline
                    bookings={daily?.occupancy || []}
                    config={data.config}
                    date={today}
                    now={now}
                  />
                </details>
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
              <p className="field-note">
                {t("WhatsApp delivery queue: ")}
                {data.notifications.queued}
                {t(" waiting ·")} {data.notifications.failed}
                {t(" exhausted retries.")}
              </p>
            </details>
          )}
          {selected && (
            <ReservationDetails
              key={selected.id}
              booking={selected}
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
              admin={data.role === "admin"}
            />
          )}
        </>
      )}
    </main>
  );
}
