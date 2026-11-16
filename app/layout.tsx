import type { Metadata } from "next";
import Shell from "./shell";
import { LanguageProvider } from "@/lib/language";
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
        <LanguageProvider>
          <Shell>{children}</Shell>
        </LanguageProvider>
      </body>
    </html>
  );
}
