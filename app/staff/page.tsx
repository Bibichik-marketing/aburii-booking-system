"use client";
import { useEffect, useState } from "react";
import type { z } from "zod";
import type { configSchema } from "@/lib/schema";
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
const displayTime = (s: string) =>
  new Intl.DateTimeFormat("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(s));
const day = (s: string) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(s));
const effectiveStatus = (b: Booking) =>
  b.status === "pending" && new Date(b.expires_at).getTime() <= Date.now()
    ? "expired"
    : b.status;
const transitions: Record<string, string[]> = {
  pending: ["confirmed", "declined", "cancelled"],
  confirmed: ["seated", "no_show", "cancelled"],
  seated: ["completed", "cancelled", "no_show"],
};
export default function Staff() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(true);
  const [settings, setSettings] = useState(false);
  const [date, setDate] = useState(day(new Date().toISOString()));
  const [query, setQuery] = useState("");
  const [area, setArea] = useState("all");
  const [status, setStatus] = useState("all");
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
  }
  useEffect(() => {
    void load()
      .catch(() => setError("Unable to connect."))
      .finally(() => setChecking(false));
    const timer = setInterval(() => {
      void load().catch(() =>
        setError(
          "Could not refresh. Displayed reservations may be out of date.",
        ),
      );
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  async function action(payload: Record<string, unknown>) {
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
        return;
      }
      await load();
      setMessage(payload.action === "login" ? "Signed in." : "Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete request.");
    } finally {
      setBusy(false);
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
  const items =
    data?.bookings.filter(
      (b) =>
        (!date || day(b.starts_at) === date) &&
        (area === "all" || b.area === area) &&
        (status === "all" || effectiveStatus(b) === status) &&
        `${b.name} ${b.reference} ${b.phone}`
          .toLowerCase()
          .includes(query.toLowerCase()),
    ) || [];
  const today = data?.bookings.filter((b) => day(b.starts_at) === date) || [];
  return (
    <main id="main" className="staff-main">
      {checking ? (
        <p className="notice">Checking your session…</p>
      ) : !data ? (
        <form className="booking-panel login" onSubmit={login}>
          <span className="eyebrow">ABURII · STAFF ACCESS</span>
          <h1 style={{ marginTop: 20 }}>
            A warm welcome
            <br />
            <em>starts with you.</em>
          </h1>
          <p className="field-note">Sign in with your Aburii staff account.</p>
          <label>
            Email
            <input type="email" name="email" autoComplete="username" required />
          </label>
          <label>
            Password
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
              {error}
            </p>
          )}
          <button className="button submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"} <span>↗</span>
          </button>
        </form>
      ) : (
        <>
          <div className="staff-title">
            <div>
              <span className="eyebrow">
                SERVICE, WITH CARE · {data.role.toUpperCase()}
              </span>
              <h1>Reservation desk</h1>
              <p className="field-note">
                All times in Malaysia time · refreshes every minute
              </p>
            </div>
            <div className="staff-actions">
              <button
                className="secondary"
                onClick={() =>
                  void load().catch(() => setError("Unable to refresh."))
                }
              >
                ↻ Refresh
              </button>
              {data.role === "admin" && (
                <button
                  className="secondary"
                  onClick={() => setSettings(!settings)}
                >
                  {settings ? "Close settings" : "Booking settings"}
                </button>
              )}
              <button
                className="secondary"
                disabled={busy}
                onClick={() => action({ action: "logout" })}
              >
                Sign out
              </button>
            </div>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          {message && (
            <p className="field-note" role="status">
              {message}
            </p>
          )}
          {settings && data.role === "admin" && (
            <Settings
              key={data.version}
              data={data}
              busy={busy}
              save={(config) =>
                action({ action: "config", config, version: data.version })
              }
            />
          )}
          <div className="dashboard-stats">
            <Stat
              title="RESERVATIONS"
              value={
                today.filter(
                  (b) =>
                    !["cancelled", "declined", "expired", "no_show"].includes(
                      effectiveStatus(b),
                    ),
                ).length
              }
            />
            <Stat
              title="EXPECTED GUESTS"
              value={today
                .filter((b) =>
                  ["confirmed", "seated", "completed"].includes(
                    effectiveStatus(b),
                  ),
                )
                .reduce((a, b) => a + b.guests, 0)}
            />
            <Stat
              title="AWAITING CONFIRMATION"
              value={
                today.filter((b) => effectiveStatus(b) === "pending").length
              }
            />
            <Stat
              title="PRIVATE ROOMS"
              value={
                today.filter(
                  (b) =>
                    b.area === "private" &&
                    ["pending", "confirmed", "seated"].includes(
                      effectiveStatus(b),
                    ),
                ).length
              }
            />
          </div>
          {data.notifications.failed !== undefined && (
            <p className={data.notifications.failed ? "error" : "field-note"}>
              WhatsApp delivery queue: {data.notifications.queued} waiting ·{" "}
              {data.notifications.failed} exhausted retries.{" "}
              {data.notifications.failed
                ? "Check the notification worker and provider before resending manually."
                : ""}
            </p>
          )}
          <div className="toolbar">
            <label>
              Service date
              <input
                type="date"
                value={date}
                onInput={(e) => setDate(e.currentTarget.value)}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Dining area
              <select value={area} onChange={(e) => setArea(e.target.value)}>
                <option value="all">All areas</option>
                <option value="counter">Counter Seating</option>
                <option value="private">Private Room</option>
              </select>
            </label>
            <label>
              Status
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">All statuses</option>
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
                  <option key={s}>{s}</option>
                ))}
              </select>
            </label>
            <label>
              Find a reservation
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name, phone or reference"
              />
            </label>
          </div>
          <div className="booking-list">
            {items.length === 0 ? (
              <div className="empty-state">
                <h2>A clear service book.</h2>
                <p>No reservations match these filters.</p>
              </div>
            ) : (
              items.map((b) => (
                <article className="reservation" key={b.id}>
                  <div>
                    <span className={`badge ${effectiveStatus(b)}`}>
                      {effectiveStatus(b).replace("_", " ")}
                    </span>
                    <h3>
                      {b.name}{" "}
                      <span className="small">· {b.guests} guests</span>
                    </h3>
                    <span className="reference">{b.reference}</span>
                    <p>
                      <a href={`tel:${b.phone}`}>{b.phone}</a>
                      {b.email && (
                        <>
                          <br />
                          <a href={`mailto:${b.email}`}>{b.email}</a>
                        </>
                      )}
                    </p>
                  </div>
                  <div>
                    <h3>
                      {displayTime(b.starts_at)} – {displayTime(b.ends_at)}
                    </h3>
                    <p>
                      {b.area === "counter"
                        ? "Counter Seating"
                        : "Private Room"}
                      {b.room &&
                        ` · ${data.config.rooms.find((r) => r.id === b.room)?.name || b.room}`}
                    </p>
                    {b.minimum_spend > 0 && (
                      <p>
                        Minimum spend RM {Number(b.minimum_spend).toFixed(2)}
                      </p>
                    )}
                    {effectiveStatus(b) === "pending" && (
                      <p>Hold expires {displayTime(b.expires_at)}</p>
                    )}
                    {b.capacity_committed &&
                      [
                        "cancelled",
                        "declined",
                        "no_show",
                        "expired",
                        "completed",
                      ].includes(effectiveStatus(b)) && (
                        <p>
                          <strong>
                            Capacity remains occupied until{" "}
                            {displayTime(b.ends_at)}.
                          </strong>
                        </p>
                      )}
                    {b.requests && (
                      <p>
                        <strong>Requests:</strong> {b.requests}
                      </p>
                    )}
                  </div>
                  <div>
                    <div className="reservation-actions">
                      {(transitions[effectiveStatus(b)] || []).map((s) => (
                        <button
                          key={s}
                          disabled={busy}
                          onClick={() =>
                            action({
                              action: "status",
                              id: b.id,
                              expected: b.status,
                              status: s,
                            })
                          }
                        >
                          {s === "confirmed"
                            ? "Confirm"
                            : s === "declined"
                              ? "Decline"
                              : s === "seated"
                                ? "Seat guests"
                                : s === "completed"
                                  ? "Complete"
                                  : s === "no_show"
                                    ? "No-show"
                                    : "Cancel"}
                        </button>
                      ))}
                    </div>
                    {b.area === "private" &&
                      new Date(b.starts_at).getTime() > Date.now() &&
                      ["pending", "confirmed"].includes(effectiveStatus(b)) && (
                        <label style={{ marginTop: 16 }}>
                          Internal room assignment
                          <select
                            aria-label={`Assign room for ${b.reference}`}
                            disabled={busy}
                            value={b.room || ""}
                            onChange={(e) =>
                              action({
                                action: "assign",
                                id: b.id,
                                room: e.target.value,
                              })
                            }
                          >
                            {data.config.rooms
                              .filter(
                                (r) => r.enabled && r.capacity >= b.guests,
                              )
                              .map((r) => (
                                <option key={r.id} value={r.id}>
                                  {r.name} · up to {r.capacity}
                                </option>
                              ))}
                          </select>
                        </label>
                      )}
                  </div>
                </article>
              ))
            )}
          </div>
        </>
      )}
    </main>
  );
}
function Stat({ title, value }: { title: string; value: number }) {
  return (
    <div className="stat">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
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
        throw Error(
          result.error.issues
            .map((i) => `${i.path.join(".")}: ${i.message}`)
            .join("; "),
        );
      await save(result.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Invalid settings");
    }
  }
  return (
    <form className="settings" onSubmit={submit}>
      <span className="eyebrow">ADMINISTRATION</span>
      <h2>Shape your service</h2>
      <p className="notice">
        New installations start closed. Enter verified inventory and service
        times before enabling bookings. Inventory changes are blocked while
        active reservations remain. Existing bookings retain their dining
        duration and minimum spend.
      </p>
      <div className="settings-grid">
        {(["counter", "private"] as const).map((a) => (
          <div key={a}>
            <h3>{a === "counter" ? "Counter Seating" : "Private Room"}</h3>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={c[a].enabled}
                onChange={(e) => setArea(a, "enabled", e.target.checked)}
              />
              <span>Enable online availability</span>
            </label>
            {(a === "counter"
              ? ["capacity", "min", "max", "duration", "minimumSpend"]
              : ["min", "max", "duration", "minimumSpend"]
            ).map((k) => (
              <label key={k}>
                {
                  {
                    capacity: "Total counter seats",
                    min: "Minimum guests",
                    max: "Maximum guests",
                    duration: "Dining duration (minutes)",
                    minimumSpend: "Minimum spend (RM per booking)",
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
                noticeMinutes: "Advance notice (minutes)",
                advanceDays: "Booking horizon (days)",
                holdMinutes: "Pending capacity hold (minutes)",
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
      <h3>Private-room inventory</h3>
      <p className="field-note">
        One object per room: id, name, capacity, enabled. These details are
        visible only to staff. Example structure:{" "}
        {`[{"id":"room-a","name":"Room A","capacity":6,"enabled":true}]`}.
        Example capacity is illustrative.
      </p>
      <textarea
        aria-label="Private room inventory JSON"
        rows={7}
        value={rooms}
        onChange={(e) => setRooms(e.target.value)}
      />
      <h3>Available booking times</h3>
      <p className="field-note">
        Each entry has area, times and either day (0 Sunday – 6 Saturday) or
        date (YYYY-MM-DD). A date-specific entry replaces weekly times for that
        area. Use an empty times array to close a date. Times are in MYT.
      </p>
      <p className="field-note">
        Example structure:{" "}
        {`{"day":2,"area":"counter","times":["18:00","20:00"]}`}. List only
        approved start times; dining may continue for the configured duration
        after each start.
      </p>
      <textarea
        aria-label="Service times JSON"
        rows={9}
        value={services}
        onChange={(e) => setServices(e.target.value)}
      />
      <h3>Temporary closures</h3>
      <p className="field-note">
        Each entry has area (all, counter or private), start and end in ISO
        format with +08:00. Any overlapping dining interval is unavailable for
        new requests. Closures do not cancel existing bookings; contact affected
        guests.
      </p>
      <textarea
        aria-label="Temporary closures JSON"
        rows={5}
        value={closures}
        onChange={(e) => setClosures(e.target.value)}
      />
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      <button className="button" disabled={busy}>
        {busy ? "Saving…" : "Save booking settings"} ↗
      </button>
    </form>
  );
}
