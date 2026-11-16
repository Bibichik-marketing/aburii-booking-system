"use client";
import { createContext, useContext, useEffect, useState } from "react";
import {
  normalizeLanguage,
  translate,
  translateError,
  validationMessage,
} from "./i18n.mjs";
export type Language = "en" | "zh-CN";
type Context = {
  language: Language;
  locale: "en-MY" | "zh-CN";
  setLanguage: (value: Language) => void;
  t: (source: string, values?: Record<string, string | number>) => string;
  errorText: (source: string) => string;
};
const LanguageContext = createContext<Context | null>(null);
const storageKey = "aburii_language";
export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>("en");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    try {
      setLanguage(normalizeLanguage(localStorage.getItem(storageKey)));
    } catch {}
    setReady(true);
  }, []);
  useEffect(() => {
    if (!ready) return;
    document.documentElement.lang = language;
    document.title = translate(language, "Reserve your experience | ABURII");
    document
      .querySelector('meta[name="description"]')
      ?.setAttribute(
        "content",
        translate(
          language,
          "Request counter seating or a private dining room at Aburii Japanese Restaurant, TTDI.",
        ),
      );
    try {
      localStorage.setItem(storageKey, language);
    } catch {}
    // Recompute any already displayed constraint error when the language changes.
    document
      .querySelectorAll<
        HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
      >("input,textarea,select")
      .forEach((field) => {
        if (field.validity.customError) {
          field.setCustomValidity("");
          if (!field.validity.valid) {
            const [message, values] = validationMessage(field.validity, field);
            field.setCustomValidity(translate(language, message, values));
          }
        }
      });
  }, [language, ready]);
  const t = (source: string, values?: Record<string, string | number>) =>
    translate(language, source, values);
  return (
    <LanguageContext.Provider
      value={{
        language,
        locale: language === "zh-CN" ? "zh-CN" : "en-MY",
        setLanguage,
        t,
        errorText: (source) => translateError(language, source),
      }}
    >
      <div
        className="language-root"
        onInvalidCapture={(event) => {
          const field = event.target;
          if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            field instanceof HTMLSelectElement
          ) {
            field.setCustomValidity("");
            const [message, values] = validationMessage(field.validity, field);
            field.setCustomValidity(t(message, values));
          }
        }}
        onInputCapture={(event) => {
          const field = event.target;
          if (
            field instanceof HTMLInputElement ||
            field instanceof HTMLTextAreaElement ||
            field instanceof HTMLSelectElement
          )
            field.setCustomValidity("");
        }}
      >
        {children}
      </div>
    </LanguageContext.Provider>
  );
}
export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw Error("LanguageProvider required");
  return value;
}
export function LanguageSwitcher() {
  const { language, setLanguage, t } = useLanguage();
  return (
    <div
      className="language-switcher"
      role="group"
      aria-label={t("Select language")}
    >
      <button
        type="button"
        lang="en"
        aria-pressed={language === "en"}
        onClick={() => setLanguage("en")}
      >
        EN
      </button>
      <span aria-hidden="true">/</span>
      <button
        type="button"
        lang="zh-CN"
        aria-label="简体中文"
        aria-pressed={language === "zh-CN"}
        onClick={() => setLanguage("zh-CN")}
      >
        中文
      </button>
    </div>
  );
}
