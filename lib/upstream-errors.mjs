/** Safe classifications only: never return an upstream message, body or token.
 * @param {'auth'|'staff'|'service'} mode @param {number} status @param {unknown} body
 */
export function upstreamError(mode, status, body) {
  const code = body && typeof body === 'object'
    ? ('error_code' in body ? body.error_code : 'code' in body ? body.code : undefined)
    : undefined;
  const result = (code, message, status) => ({code, message, status});
  if (status === 429) return result('AUTH_RATE_LIMITED', 'Too many requests. Please try again in a minute.', 429);
  if (mode === 'auth') {
    if (code === 'invalid_credentials') return result('INVALID_CREDENTIALS', 'Email or password is incorrect. Please try again.', 401);
    if (code === 'email_not_confirmed') return result('EMAIL_UNCONFIRMED', 'Confirm your email before signing in.', 403);
    if (code === 'refresh_token_not_found' || code === 'refresh_token_already_used' || code === 'session_not_found') return result('SESSION_EXPIRED', 'Your session has expired. Please sign in again.', 401);
    if (status === 401 || code === 'email_provider_disabled' || status === 501) return result('AUTH_CONFIGURATION', 'Staff sign-in is not configured correctly. Please contact the administrator.', 503);
    return result('AUTH_SERVICE', 'The sign-in service is temporarily unavailable. Please try again later.', 503);
  }
  if (mode === 'staff' && (status === 401 || status === 403)) return result('STAFF_ACCESS', 'Sign in with an active staff account.', 401);
  if (mode === 'service' && (status === 401 || status === 403)) return result('SERVER_CONFIGURATION', 'The server connection is not configured correctly. Please contact the administrator.', 503);
  return null;
}
