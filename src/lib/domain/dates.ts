/**
 * Date parsing for messy exports. Naive timestamps are interpreted as IST (UTC+05:30).
 * Day-first (Indian) convention for numeric dates.
 */
export type DateParse = { status: "ok"; value: Date } | { status: "missing" } | { status: "invalid" };

const IST_OFFSET_MIN = 330;
const MISSING = new Set(["", "null", "nan", "na", "n/a", "none", "-", "--", "nat", "undefined"]);
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function build(
  y: number,
  mo: number,
  d: number,
  h = 0,
  mi = 0,
  s = 0,
  offsetMin: number = IST_OFFSET_MIN,
): Date | null {
  if (y < 2000 || y > 2100 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || s > 59) return null;
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  return new Date(Date.UTC(y, mo - 1, d, h, mi, s) - offsetMin * 60000);
}

function to24(h: number, ampm?: string): number {
  if (!ampm) return h;
  const pm = ampm.toLowerCase() === "pm";
  if (h === 12) return pm ? 12 : 0;
  return pm ? h + 12 : h;
}

function fullYear(y: number): number {
  return y < 100 ? 2000 + y : y;
}

export function parseDateDetailed(input: string | null | undefined): DateParse {
  if (input === null || input === undefined) return { status: "missing" };
  const s = String(input).trim();
  if (MISSING.has(s.toLowerCase())) return { status: "missing" };

  // ISO: 2025-09-10, 2025-09-10 09:12[:ss][.fff][Z|+05:30]
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?\s*(Z|[+-]\d{2}:?\d{2})?$/i);
  if (m) {
    let offset = IST_OFFSET_MIN;
    if (m[7]) {
      if (m[7].toUpperCase() === "Z") offset = 0;
      else {
        const sign = m[7][0] === "-" ? -1 : 1;
        const digits = m[7].slice(1).replace(":", "");
        offset = sign * (parseInt(digits.slice(0, 2), 10) * 60 + parseInt(digits.slice(2), 10));
      }
    }
    const d = build(+m[1], +m[2], +m[3], +(m[4] ?? 0), +(m[5] ?? 0), +(m[6] ?? 0), offset);
    return d ? { status: "ok", value: d } : { status: "invalid" };
  }

  // Day-first numeric: 10/09/2025, 10-09-25 09:12, 10.09.2025 9:12 PM
  m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})(?:[ T,]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    let day = +m[1];
    let month = +m[2];
    if (month > 12 && day <= 12) [day, month] = [month, day];
    const d = build(fullYear(+m[3]), month, day, to24(+(m[4] ?? 0), m[7]), +(m[5] ?? 0), +(m[6] ?? 0));
    return d ? { status: "ok", value: d } : { status: "invalid" };
  }

  // Text month: 10 Sep 2025 09:12, 10-Sep-25
  m = s.match(/^(\d{1,2})[ \-/]([A-Za-z]{3,9})[ \-/,]*(\d{2,4})?(?:[ ,T]+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (m) {
    const mo = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase()) + 1;
    if (mo === 0) return { status: "invalid" };
    const year = m[3] ? fullYear(+m[3]) : new Date().getUTCFullYear();
    const d = build(year, mo, +m[1], to24(+(m[4] ?? 0), m[7]), +(m[5] ?? 0), +(m[6] ?? 0));
    return d ? { status: "ok", value: d } : { status: "invalid" };
  }

  return { status: "invalid" };
}

export function parseDate(input: string | null | undefined): Date | null {
  const r = parseDateDetailed(input);
  return r.status === "ok" ? r.value : null;
}

export function formatIST(d: Date | string | null | undefined, withTime = true): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(date);
}
