"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useLanguage } from "@/lib/language";
export default function PasswordPage() {
  const { t } = useLanguage();
  const link = useRef<{token_hash:string; type:"invite"|"recovery"} | null>(null);
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const submitted = useRef(false);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const token_hash = params.get("token_hash") || "", type = params.get("type");
    // The one-time token is removed from browser history before any request.
    window.history.replaceState(null, "", window.location.pathname);
    if (/^[a-fA-F0-9]{32,128}$/.test(token_hash) && (type === "invite" || type === "recovery")) {
      link.current = {token_hash, type};
      setReady(true);
    } else if (!link.current) {
      setError("This link is missing or invalid. Ask your Aburii administrator for a new link.");
    }
  }, []);
  async function submit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitted.current || !link.current) return;
    const form = event.currentTarget, values = new FormData(form);
    const password = String(values.get("password") || "");
    if (password !== values.get("confirm")) { setError("Passwords do not match."); return; }
    submitted.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/staff", {
        method:"POST", headers:{"Content-Type":"application/json"},
        body:JSON.stringify({action:"setup_password", ...link.current, password}),
      });
      if (!response.ok) throw Error();
      form.reset(); link.current = null;
      window.location.assign("/staff");
    } catch {
      setError("Password setup failed. Check your password or request a new link from your administrator.");
      submitted.current = false; setBusy(false);
    }
  }
  return <main id="main" className="staff-main">
    <form className="booking-panel login" onSubmit={submit}>
      <span className="eyebrow">{t("ABURII · STAFF ACCESS")}</span>
      <h1>{t("Set your staff password")}</h1>
      <p className="field-note">{t("Use the secure invitation or recovery link sent by your Aburii administrator.")}</p>
      {ready && <>
        <label>{t("New password")}<input type="password" name="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /></label>
        <label>{t("Confirm password")}<input type="password" name="confirm" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} /></label>
        <p className="field-note">{t("Use at least 12 characters and a unique password.")}</p>
      </>}
      {error && <p className="error" role="alert">{t(error)}</p>}
      <button className="button submit" disabled={!ready || busy}>{t(busy ? "Saving password…" : "Save password")}</button>
      <Link href="/staff">{t("Back to staff sign in")}</Link>
    </form>
  </main>;
}
