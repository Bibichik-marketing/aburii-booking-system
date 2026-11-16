import { chinese } from "./messages.mjs";
const englishLabels = {
  pending: "Pending",
  confirmed: "Confirmed",
  seated: "Seated",
  completed: "Completed",
  cancelled: "Cancelled",
  declined: "Declined",
  expired: "Expired",
  no_show: "No-show",
  admin: "Administrator",
  manager: "Manager",
  staff: "Staff",
};
export const languages = Object.freeze(["en", "zh-CN"]);
/** @param {unknown} value @returns {'en'|'zh-CN'} */
export function normalizeLanguage(value) {
  return value === "zh-CN" ? "zh-CN" : "en";
}
/** @param {'en'|'zh-CN'} language @param {string} source @param {Record<string,string|number>} [values] */
export function translate(language, source, values = {}) {
  const key = source.trim();
  const dictionary = /** @type {Record<string,string>} */ (chinese);
  const labels = /** @type {Record<string,string>} */ (englishLabels);
  const replacement = language === "zh-CN" ? dictionary[key] : labels[key];
  const result =
    replacement === undefined ? source : source.replace(key, () => replacement);
  return result.replace(/\{([a-zA-Z]+)\}/g, (match, key) =>
    Object.hasOwn(values, key) ? String(values[key]) : match,
  );
}
/** @param {'en'|'zh-CN'} language @param {string} message */
export function translateError(language, message) {
  if (!message) return "";
  if (Object.hasOwn(chinese, message.trim()))
    return translate(language, message);
  return translate(language, "Please check your details and try again.");
}
/** @param {ValidityState} validity @param {{min?:string,max?:string,minLength?:number,maxLength?:number,type?:string,title?:string}} field @returns {[string,Record<string,string|number>]} */
export function validationMessage(validity, field) {
  if (validity.valueMissing) return ["Please fill out this field.", {}];
  if (validity.typeMismatch && field.type === "email")
    return ["Please enter a valid email address.", {}];
  if (validity.patternMismatch)
    return [field.title || "Please use the requested format.", {}];
  if (validity.tooShort)
    return [
      "Please enter at least {min} characters.",
      { min: field.minLength ?? 0 },
    ];
  if (validity.tooLong)
    return [
      "Please use no more than {max} characters.",
      { max: field.maxLength ?? 0 },
    ];
  if (validity.rangeUnderflow)
    return [
      "Please enter a value of at least {min}.",
      { min: field.min || "" },
    ];
  if (validity.rangeOverflow)
    return [
      "Please enter a value no greater than {max}.",
      { max: field.max || "" },
    ];
  return ["Please enter a valid value.", {}];
}
