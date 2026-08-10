import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.PGHOST || "db",
  port: process.env.PGPORT || 5432,
  user: process.env.PGUSER || "spinner",
  password: process.env.PGPASSWORD || "spinner",
  database: process.env.PGDATABASE || "word_spinner",
});

// Returns today's date as YYYY-MM-DD in the configured local timezone,
// so the daily reset lines up with the family's actual midnight rather than UTC.
export function todayLocal() {
  const tz = process.env.APP_TIMEZONE || "Australia/Sydney";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date()); // en-CA gives YYYY-MM-DD
}
