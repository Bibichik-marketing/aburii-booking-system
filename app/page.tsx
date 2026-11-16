"use client";
import { useLanguage } from "@/lib/language";
import Booking from "./booking";
export default function Home() {
  const { t } = useLanguage();
  return (
    <main id="main">
      <section className="intro">
        <div className="eyebrow">
          <span />
          {t(" THE ART OF GATHERING")}
        </div>
        <p className="japanese" lang="ja">
          炙り · 心を込めて
        </p>
        <h1>
          {t("A seat. A moment.")}
          <br />
          <em>{t("Something memorable.")}</em>
        </h1>
        <p className="intro-copy">
          {t("Exceptional Japanese dining, shared at your own pace.")}
          <br />
          {t("Your next Aburii experience begins here.")}
        </p>
        <div className="intro-bottom">
          <span>{t("TTDI, KUALA LUMPUR")}</span>
          <span>{t("RESERVATIONS ↓")}</span>
        </div>
      </section>
      <section className="booking-layout" aria-label={t("Make a reservation")}>
        <aside>
          <span className="eyebrow">{t("YOUR EXPERIENCE")}</span>
          <h2>
            {t("Make room")}
            <br />
            {t("for a little")}
            <br />
            <em>{t("extraordinary.")}</em>
          </h2>
          <div className="fine-line" />
          <p>
            {t(
              "Take a place at the counter, or make the evening your own in a private room.",
            )}
          </p>
          <div className="aside-note">
            <span>{t("01 — CHOOSE YOUR SETTING")}</span>
            <span>{t("02 — FIND YOUR MOMENT")}</span>
            <span>{t("03 — LEAVE THE DETAILS TO US")}</span>
          </div>
          <p className="small">
            5, Lorong Datuk Sulaiman 7<br />
            Taman Tun Dr Ismail
            <br />
            60000 Kuala Lumpur
          </p>
        </aside>
        <Booking />
      </section>
    </main>
  );
}
