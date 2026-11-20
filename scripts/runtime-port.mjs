// Hosting assigns PORT. A fallback is only for an unhosted local invocation.
export function runtimePort(env = process.env) {
  const value = env.PORT;
  if (value === undefined && env.NODE_ENV === 'production') {
    throw new Error('PORT must be supplied by the production hosting platform.');
  }
  const port = value === undefined ? 3100 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  return String(port);
}
