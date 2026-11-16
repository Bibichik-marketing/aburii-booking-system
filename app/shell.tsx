"use client";
import Link from "next/link";
import { useLanguage, LanguageSwitcher } from "@/lib/language";
export default function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();
  return (
    <>
      {" "}
      <a className="skip" href="#main">
        {t("Skip to content")}
      </a>
      <header className="header">
        <Link href="/" aria-label={t("Aburii reservations")}>
          <img
            src="/aburii-logo.png"
            alt={t("Aburii Japanese Restaurant")}
            width="140"
            height="60"
          />
        </Link>
        <nav aria-label={t("Main navigation")}>
          <a href="https://www.aburii.com/">{t("Discover Aburii ↗")}</a>
          <Link href="/staff" className="staff-link">
            {t("Staff access")}
          </Link>
          <LanguageSwitcher />
        </nav>
      </header>
      {children}
      <footer>
        <div>
          <span className="wordmark">ABURII</span>
          <p>{t("Japanese dining · Taman Tun Dr Ismail")}</p>
        </div>
        <div>
          <a href="tel:+60109100267">+60 10 910 0267</a>
          <Link href="/policies">{t("Privacy & booking policy")}</Link>
          <span>© {new Date().getFullYear()} Aburii</span>
        </div>
      </footer>
    </>
  );
}
