export type AssignmentRow = { siteId: string; itemId: string; open: string; due: string };

// Extract identity only; these submission/grade links are never followed by the probe.
export function assignmentIdentity(href: string): { siteId: string; itemId: string } | null {
  try {
    const url = new URL(href);
    if (url.origin !== "https://lms.sirius.tuat.ac.jp" || url.username || url.password || url.hash) return null;
    const path = /^\/portal\/site\/([\w-]{1,128})\/tool\/([\w-]{1,128})$/.exec(url.pathname);
    if (!path || [...url.searchParams].length !== 2) return null;
    const action = url.searchParams.get("sakai_action");
    const reference = action === "doView_submission" ? url.searchParams.get("assignmentReference")
      : action === "doView_grade" ? url.searchParams.get("submissionId") : null;
    const match = action === "doView_submission"
      ? /^\/assignment\/a\/([\w-]{1,128})\/([\w-]{1,128})$/.exec(reference ?? "")
      : /^\/assignment\/s\/([\w-]{1,128})\/([\w-]{1,128})\/[\w-]{1,128}$/.exec(reference ?? "");
    return match?.[1] === path[1] && match?.[2] ? { siteId: match[1]!, itemId: match[2] } : null;
  } catch { return null; }
}

export function visibleAssignmentRows(doc: Document): { rows: AssignmentRow[]; unidentifiedRows: number; tableFound: boolean } {
  const tables = Array.from(doc.querySelectorAll("main table")).filter(table =>
    Array.from(table.querySelectorAll("th")).map(th => th.textContent?.trim()).join("|") === "添付|課題タイトル|状態|公開日時|締切日時");
  const rows: AssignmentRow[] = [];
  let unidentifiedRows = 0;
  if (tables.length !== 1) return { rows, unidentifiedRows, tableFound: false };
  for (const row of tables[0]!.querySelectorAll("tr")) {
    const cells = row.querySelectorAll("td");
    if (!cells.length) continue;
    const link = cells[1]?.querySelector<HTMLAnchorElement>("a[href]");
    const identity = link ? assignmentIdentity(link.href) : null;
    if (cells.length !== 5 || !identity) { unidentifiedRows++; continue; }
    rows.push({ ...identity, open: cells[3]!.textContent?.trim() ?? "", due: cells[4]!.textContent?.trim() ?? "" });
  }
  return { rows, unidentifiedRows, tableFound: true };
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

const jst = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

// Diagnostic hypothesis, not a production decoder: compare seconds+nanos in JST at UI minute precision.
function instantAsUiMinute(value: unknown): string | null {
  const instant = record(value);
  const seconds = instant?.epochSecond;
  const nanos = instant?.nano;
  if (typeof seconds !== "number" || !Number.isSafeInteger(seconds) || typeof nanos !== "number" ||
    !Number.isInteger(nanos) || nanos < 0 || nanos >= 1_000_000_000) return null;
  const ms = seconds * 1_000 + Math.floor(nanos / 1_000_000);
  if (!Number.isSafeInteger(ms) || Math.abs(ms) > 8.64e15) return null;
  const parts = Object.fromEntries(jst.formatToParts(new Date(ms)).map(p => [p.type, p.value]));
  return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
}

export function compareAssignmentDeadlines(payload: unknown, rows: AssignmentRow[], siteId: string) {
  const collection = record(payload)?.assignment_collection;
  const fields = ["openTime", "dueTime", "closeTime", "dropDeadTime"] as const;
  const comparisons = Object.fromEntries(fields.map(field => [field, { matched: 0, mismatched: 0, unknown: 0 }]));
  let missingOrAmbiguous = 0;
  const visible = rows.filter(row => row.siteId === siteId);
  // ponytail: scan one visible UI page; index by ID if this grows into a full-course comparison.
  for (const row of visible) {
    const matches = Array.isArray(collection) ? collection.map(record).filter(item => item?.id === row.itemId && item?.context === siteId) : [];
    if (matches.length !== 1 || visible.filter(other => other.itemId === row.itemId).length !== 1) { missingOrAmbiguous++; continue; }
    for (const field of fields) {
      const expected = field === "openTime" ? row.open : row.due;
      const actual = instantAsUiMinute(matches[0]?.[field]);
      const bucket = actual === null || !/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(expected)
        ? "unknown" : actual === expected ? "matched" : "mismatched";
      comparisons[field]![bucket]++;
    }
  }
  return { hypothesis: "epochSecond+nano, Asia/Tokyo, minute precision", visibleRows: visible.length, missingOrAmbiguous, comparisons };
}
