"use client";
import { useLanguage } from "@/lib/language";
import Booking from "./booking";
export default function Home() {
  const { t } = useLanguage();
  return (
    <main id="main">
      <section className="booking-layout" aria-label={t("Make a reservation")}>
        <Booking />
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
      </section>
    </main>
  );
}
