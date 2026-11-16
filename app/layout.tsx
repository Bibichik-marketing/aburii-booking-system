import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
export const metadata: Metadata = {
  title: "Reserve your experience | ABURII",
  description:
    "Request counter seating or a private dining room at Aburii Japanese Restaurant, TTDI.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a className="skip" href="#main">
          Skip to content
        </a>
        <header className="header">
          <Link href="/" aria-label="Aburii reservations">
            <img
              src="/aburii-logo.png"
              alt="Aburii Japanese Restaurant"
              width="140"
              height="60"
            />
          </Link>
          <nav aria-label="Main navigation">
            <a href="https://www.aburii.com/">Discover Aburii ↗</a>
            <Link href="/staff" className="staff-link">
              Staff access
            </Link>
          </nav>
        </header>
        {children}
        <footer>
          <div>
            <span className="wordmark">ABURII</span>
            <p>Japanese dining · Taman Tun Dr Ismail</p>
          </div>
          <div>
            <a href="tel:+60109100267">+60 10 910 0267</a>
            <Link href="/policies">Privacy & booking policy</Link>
            <span>© {new Date().getFullYear()} Aburii</span>
          </div>
        </footer>
      </body>
    </html>
  );
}
