// Login headers are never stored. We keep the latest value the page sent, in memory, for replays.

const SECRET_HEADER = /^(authorization|cookie|x-csrf-token|x-xsrf-token|x-auth-token|x-access-token|x-session-token)$/i;
const DROPPED_HEADER = /^(content-length|accept-encoding|user-agent|referer|origin|host|connection)$/i;
const latest = new Map(); // origin -> Map(header -> value)

// Splits headers into ones safe to store and the names of secret ones (whose values we only remember).
export function separateSecrets(origin, headers) {
  const safe = {}, secretHeaders = [];
  for (const [rawName, value] of Object.entries(headers)) {
    const name = rawName.toLowerCase();
    if (SECRET_HEADER.test(name)) {
      if (!latest.has(origin)) latest.set(origin, new Map());
      latest.get(origin).set(name, value);
      secretHeaders.push(name);
    } else if (!DROPPED_HEADER.test(name)) safe[name] = value;
  }
  return { safe, secretHeaders };
}

export const latestSecret = (origin, name) => latest.get(origin)?.get(name);
