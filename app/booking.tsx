"use client";
import { mondayClosed, officialHours } from "@/lib/operating-hours.mjs";
import { useLanguage } from "@/lib/language";
import { useEffect, useRef, useState } from "react";
type Area = "counter" | "private";
type Slot = { start: string; end: string };
type Receipt = {
  area: Area;
  guests: number;
  reference: string;
  status: string;
  expiresAt: string;
  start: string;
  end: string;
  minimumSpend: number;
};
const formatDate = (value: string, locale: string) =>
  new Intl.DateTimeFormat(locale, {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
export default function Booking() {
  const { t, locale, errorText } = useLanguage();
  const format = (value: string) => formatDate(value, locale);
  const [area, setArea] = useState<Area>("counter");
  const [date, setDate] = useState("");
  const [guests, setGuests] = useState(2);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [start, setStart] = useState("");
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [availabilityError, setAvailabilityError] = useState("");
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [spend, setSpend] = useState(0);
  const [hold, setHold] = useState(0);
  const [dateError, setDateError] = useState("");
  const [bookingOpen, setBookingOpen] = useState<boolean | null>(null);
  const [closed, setClosed] = useState(false);
  const [hours, setHours] = useState(officialHours);
  function chooseDate(value: string) {
    if (mondayClosed(value)) {
      setDate("");
      setDateError("Monday is closed. Please choose another date.");
      return;
    }
    setDateError("");
    setDate(value);
  }
  const key = useRef<{ payload: string; id: string } | null>(null);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  useEffect(() => {
    setStart("");
    setSlots([]);
    setAvailabilityError("");
    setLoading(false);
    setSpend(0);
    setHold(0);
    if (!date || !Number.isInteger(guests) || guests < 1 || guests > 200)
      return;
    const controller = new AbortController();
    setLoading(true);
    fetch(
      `/api/availability?${new URLSearchParams({ date, area, guests: String(guests) })}`,
      { signal: controller.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (controller.signal.aborted) return;
        setSlots(d.slots);
        setBookingOpen(d.bookingOpen === true);
        setClosed(d.closed ?? false);
        if (d.operatingHours) setHours(d.operatingHours);
        setSpend(Number(d.minimumSpend));
        setHold(d.holdMinutes);
      })
      .catch((e) => {
        if (e.name !== "AbortError")
          setAvailabilityError(e.message || "Unable to load availability.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [area, date, guests]);
  async function submit(e: React.SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    if (!date || mondayClosed(date) || !start || bookingOpen === false) return;
    setBusy(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      area,
      start,
      guests,
      name: String(fd.get("name")).trim(),
      phone: String(fd.get("phone")).replace(/[ ()-]/g, ""),
      email: String(fd.get("email")).trim(),
      requests: String(fd.get("requests")).trim(),
      consent: fd.get("consent") === "on",
      whatsapp: fd.get("whatsapp") === "on",
    };
    const serialized = JSON.stringify(payload);
    if (key.current?.payload !== serialized)
      key.current = { payload: serialized, id: crypto.randomUUID() };
    try {
      const r = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, id: key.current!.id }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setReceipt(d);
      window.scrollTo({ top: 300, behavior: "smooth" });
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to submit. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (receipt)
    return (
      <div className="booking-panel receipt" role="status">
        <div className="success-mark">✓</div>
        <div className="eyebrow">
          {receipt.status === "pending"
            ? t("REQUEST RECEIVED")
            : t("RESERVATION STATUS")}
        </div>
        <h2>
          {receipt.status === "pending" ? (
            <>
              {t("A lovely evening")}
              <br />
              <em>{t("starts here.")}</em>
            </>
          ) : (
            <>
              {t("Your reservation")}
              <br />
              <em>{t("update.")}</em>
            </>
          )}
        </h2>
        <p>
          {t("Your reference is ")}
          <strong>{receipt.reference}</strong>
        </p>
        <dl>
          <dt>{t("Status")}</dt>
          <dd>{t(receipt.status)}</dd>
          <dt>{t("When")}</dt>
          <dd>
            {format(receipt.start)}
            {t(" (MYT)")}
          </dd>
          <dt>{t("Guests")}</dt>
          <dd>{receipt.guests}</dd>
          <dt>{t("Setting")}</dt>
          <dd>
            {receipt.area === "counter"
              ? t("Counter Seating")
              : t("Private Room")}
          </dd>
          {receipt.minimumSpend > 0 && (
            <>
              <dt>{t("Minimum spend")}</dt>
              <dd>
                RM {receipt.minimumSpend.toFixed(2)}
                {t(" per booking")}
              </dd>
            </>
          )}
        </dl>
        <p className="notice">
          {receipt.status === "pending"
            ? t(
                "This is a request, not a confirmed reservation. Your capacity hold expires {expiry} MYT unless our team confirms it. Please call us if you need assistance.",
                { expiry: format(receipt.expiresAt) },
              )
            : t("Please contact our team with your reference for assistance.")}
        </p>
        <a className="button" href="tel:+60109100267">
          {t("Contact Aburii ↗")}
        </a>
        <button
          className="text-button"
          onClick={() => {
            setReceipt(null);
            setStart("");
            setSlots([]);
            setDate("");
            key.current = null;
          }}
        >
          {t("Make another request")}
        </button>
      </div>
    );
  return (
    <form className="booking-panel" onSubmit={submit}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">{t("RESERVATIONS")}</span>
          <h2>{t("Your place at Aburii")}</h2>
        </div>
        <span className="seal" lang="ja">
          炙
        </span>
      </div>
      <details className="booking-hours">
        <summary>{t("Operating hours · Malaysia time")}</summary>
        <dl>
          {[1, 2, 3, 4, 5, 6, 0].map((day) => (
            <div key={day}>
              <dt>
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
              </dt>
              <dd>
                {hours.find((h) => h.day === day)?.periods.length
                  ? hours
                      .find((h) => h.day === day)!
                      .periods.map((p) => `${p.start}–${p.end}`)
                      .join(" · ")
                  : t("Closed")}
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <fieldset disabled={busy}>
        <legend>
          <span className="step">01</span>
          {t(" Choose your setting")}
        </legend>
        <div className="area-grid">
          {(
            [
              {
                id: "counter",
                jp: "吧台",
                title: "Counter Seating",
                description:
                  "A front-row seat to the craft. Dine close to the energy of our chefs.",
                icon: "▤",
              },
              {
                id: "private",
                jp: "包间",
                title: "Private Room",
                description:
                  "A more intimate setting. Your own space for meaningful gatherings.",
                icon: "◫",
              },
            ] as const
          ).map((x) => (
            <label
              className={`area-card ${area === x.id ? "selected" : ""}`}
              key={x.id}
            >
              <input
                type="radio"
                name="area"
                value={x.id}
                checked={area === x.id}
                onChange={() => setArea(x.id)}
              />
              <span className="card-top">
                <span className="area-icon" aria-hidden="true">
                  {x.icon}
                </span>
                <span lang="zh">{x.jp}</span>
                <span className="radio-mark" />
              </span>
              <strong>{t(x.title)}</strong>
              <span>{t(x.description)}</span>
            </label>
          ))}
        </div>
        <p className="field-note">
          {t(
            "Select a dining area. Our team will arrange your seats or private room.",
          )}
        </p>
      </fieldset>
      <fieldset disabled={busy}>
        <legend>
          <span className="step">02</span>
          {t(" Find your moment")}
        </legend>
        <div className="two-col">
          <label>
            {t("Reservation date")}
            <input
              type="date"
              required
              min={today}
              value={date}
              onInput={(e) => chooseDate(e.currentTarget.value)}
              onChange={(e) => chooseDate(e.target.value)}
            />
          </label>
          <label>
            {t("Number of guests")}
            <input
              type="number"
              required
              min="1"
              max="200"
              value={guests || ""}
              onChange={(e) => setGuests(Number(e.target.value))}
            />
          </label>
        </div>
        {dateError && (
          <p className="error" role="alert">
            {t(dateError)}
          </p>
        )}
        <p className="field-note">
          {t("Monday closed · all times are Malaysia time (UTC+8).")}
        </p>
        <div className="time-label">
          {t("Available times ")}
          <span>{t("Malaysia time (UTC+8)")}</span>
        </div>
        <div aria-live="polite">
          {loading ? (
            <p className="notice">{t("Finding your moment…")}</p>
          ) : availabilityError ? (
            <p className="notice">
              {errorText(availabilityError)}{" "}
              <a href="tel:+60109100267">{t("Call our team ↗")}</a>
            </p>
          ) : date && closed ? (
            <p className="notice">
              {t(
                "The restaurant is closed on this date. Please choose another date.",
              )}
            </p>
          ) : date && bookingOpen === false ? (
            <p className="notice">
              {t(
                "Online bookings will open after seating capacities and policies are confirmed. Please contact Aburii for assistance.",
              )}
            </p>
          ) : !date ? (
            <p className="time-empty">
              {t("Choose a date and party size to see available times.")}
            </p>
          ) : slots.length === 0 ? (
            <p className="notice">
              {t(
                "No online availability for this party size and setting. Try another date or contact our team.",
              )}
            </p>
          ) : (
            <div className="time-grid">
              {slots.map((x) => (
                <button
                  type="button"
                  key={x.start}
                  aria-pressed={start === x.start}
                  className={`time ${start === x.start ? "chosen" : ""}`}
                  onClick={() => setStart(x.start)}
                >
                  {new Intl.DateTimeFormat(locale, {
                    timeZone: "Asia/Kuala_Lumpur",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(x.start))}
                </button>
              ))}
            </div>
          )}
        </div>
        {start && (
          <p className="field-note">
            {t("Your dining time: ")}
            {format(start)} –{" "}
            {new Intl.DateTimeFormat(locale, {
              timeZone: "Asia/Kuala_Lumpur",
              hour: "numeric",
              minute: "2-digit",
            }).format(new Date(slots.find((s) => s.start === start)!.end))}
            {t(". Pending hold: ")}
            {hold}
            {t(" minutes, or until arrival if sooner.")}
          </p>
        )}
        {spend > 0 && (
          <p className="notice">
            {t("Minimum spend for this setting: RM ")}
            {spend.toFixed(2)}
            {t(" per booking.")}
          </p>
        )}
      </fieldset>
      <fieldset disabled={busy}>
        <legend>
          <span className="step">03</span>
          {t(" A few details")}
        </legend>
        <div className="two-col">
          <label>
            {t("Full name")}
            <input
              name="name"
              autoComplete="name"
              required
              minLength={2}
              maxLength={100}
              placeholder={t("Your full name")}
            />
          </label>
          <label>
            {t("Phone / WhatsApp")}
            <input
              name="phone"
              type="tel"
              autoComplete="tel"
              required
              pattern="\+[1-9][0-9 ()-]{7,20}"
              title={t("Include country code, for example +60 12 345 6789")}
              maxLength={24}
              placeholder="+60 12 345 6789"
            />
          </label>
        </div>
        <label>
          {t("Email ")}
          <span className="optional">{t("optional")}</span>
          <input
            name="email"
            type="email"
            autoComplete="email"
            maxLength={254}
            placeholder="you@example.com"
          />
        </label>
        <label>
          {t("Special requests ")}
          <span className="optional">{t("optional")}</span>
          <textarea
            name="requests"
            maxLength={1000}
            rows={3}
            placeholder={t(
              "A celebration, dietary needs, or anything we should know?",
            )}
          />
        </label>
        <p className="field-note">
          {t(
            "We’ll do our best to accommodate requests. Please call to discuss allergies before your visit.",
          )}
        </p>
      </fieldset>
      <label className="checkbox">
        <input type="checkbox" name="consent" required />
        <span>
          {t("I agree to the")}{" "}
          <a href="/policies" target="_blank" rel="noreferrer">
            {t("privacy & booking policy")}
          </a>{" "}
          {t(
            "and understand this is a reservation request, subject to confirmation.",
          )}
        </span>
      </label>
      <label className="checkbox">
        <input type="checkbox" name="whatsapp" />
        <span>{t("Send reservation updates to my WhatsApp number.")}</span>
      </label>
      {error && (
        <p className="error" role="alert">
          {errorText(error)}
        </p>
      )}
      <button className="button submit" disabled={busy || !start || loading}>
        {busy ? t("Sending your request…") : t("Request a reservation")}
        <span aria-hidden="true">↗</span>
      </button>
      <p className="bottom-note">
        {t("A considered experience, from the very first moment.")}
      </p>
    </form>
  );
}
