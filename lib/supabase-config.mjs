// Server infrastructure only: never import this module from a client component.
export const ABURII_PROJECT_REF = "oemwlqisfwrhfxsvuszi";
const unavailable = () => Error('Aburii Supabase configuration is missing or invalid.');
/** Validates without network access or including any supplied value in errors.
 * @param {Record<string,string|undefined>} [env]
 */
export function supabaseConfig(env = process.env) {
  if (typeof window !== 'undefined') throw unavailable();
  let url;
  try { url = new URL(env.ABURII_SUPABASE_URL || ''); } catch { throw unavailable(); }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw unavailable();
  const local = env.NODE_ENV !== 'production' && env.ABURII_LOCAL_DEVELOPMENT === 'true'
    && url.protocol === 'http:' && url.hostname === '127.0.0.1' && Boolean(url.port);
  const publishable = env.ABURII_SUPABASE_PUBLISHABLE_KEY;
  const secret = env.ABURII_SUPABASE_SECRET_KEY;
  if (!publishable || !secret || publishable === secret) throw unavailable();
  if (env.ABURII_SUPABASE_ANON_KEY || env.ABURII_SUPABASE_SERVICE_ROLE_KEY) throw unavailable();
  if (!local) {
    const ref = env.ABURII_SUPABASE_PROJECT_REF || '';
    if (ref !== ABURII_PROJECT_REF || url.origin !== `https://${ref}.supabase.co`
      || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(publishable)
      || !/^sb_secret_[A-Za-z0-9_-]+$/.test(secret)
      || env.ABURII_LOCAL_DEVELOPMENT === 'true') throw unavailable();
  }
  if (Object.keys(env).some(name => name.startsWith('NEXT_PUBLIC_ABURII_SUPABASE_') && env[name])) throw unavailable();
  return { url: url.origin, publishable, secret, local };
}
/** @param {ReturnType<typeof supabaseConfig>} config @param {'service'|'auth'|'staff'} mode @param {string} [token] */
export function supabaseHeaders(config, mode, token) {
  const key = mode === 'service' ? config.secret : config.publishable;
  /** @type {Record<string,string>} */
  const headers = { apikey: key, 'Content-Type': 'application/json' };
  if (mode === 'staff') {
    // Access JWTs are issued/verified by Supabase, never substitute an API key.
    if (!token || (!config.local && !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token))) throw unavailable();
    headers.Authorization = `Bearer ${token}`;
  } else if (config.local) headers.Authorization = `Bearer ${key}`;
  return headers;
}
/** Production origin is explicit; never derive a trusted origin from an untrusted request. @param {Record<string,string|undefined>} [env] */
export function productionIssues(env = process.env) {
  const issues = [];
  try { supabaseConfig({...env, NODE_ENV:'production'}); } catch { issues.push('Supabase URL, pinned project reference or current API keys are missing/invalid.'); }
  try {
    const site = new URL(env.ABURII_SITE_URL || '');
    if (site.protocol !== 'https:' || site.origin !== env.ABURII_SITE_URL || site.username || site.password) throw Error();
  } catch { issues.push('Set ABURII_SITE_URL to the approved HTTPS origin, without a trailing slash.'); }
  if (!env.ABURII_RATE_LIMIT_SECRET || env.ABURII_RATE_LIMIT_SECRET.length < 32) issues.push('Set a new Aburii-only rate-limit secret of at least 32 characters.');
  return issues;
}
