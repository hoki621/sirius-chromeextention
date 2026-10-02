import { ApiError, ORIGIN, validId } from "./api.ts";

export type Kind = "assignment" | "quiz";
export type Site = { id: string; title: string; assignmentHref?: string };
export type Deadline = { state: "known"; at: number } | { state: "none" | "unknown" };
export type Item = { key: string; id: string; site: Site; kind: Kind; title: string; deadline: Deadline; href: string; fetchedAt: number };
export type Group = "overdue" | "today" | "week" | "later" | "none" | "unknown";
export const GROUPS: Record<Group, string> = { overdue: "期限超過", today: "今日", week: "明日から7日以内", later: "それ以降", none: "期限なし", unknown: "期限不明" };
export function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function collection(value: unknown, name: string): unknown[] {
  if (!record(value) || !Array.isArray(value[name])) throw new ApiError("schema");
  return value[name];
}
function title(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 10_000;
}
export function decodeSites(value: unknown): { sites: Site[]; ids: string[]; count: number; skipped: number } {
  const rows = collection(value, "site_collection");
  const sites: Site[] = [], ids: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const row of rows) {
    if (!record(row) || !validId(row.id) || seen.has(row.id)) throw new ApiError("schema");
    seen.add(row.id);
    ids.push(row.id);
    if (row.id.startsWith("~") || row.published === false || row.type === "myworkspace") continue;
    if (!title(row.title) || row.published !== true) { skipped++; continue; }
    // Observed active teaching sites have type=project. Do not restrict to course.
    sites.push({ id: row.id, title: row.title });
  }
  return { sites, ids, count: rows.length, skipped };
}
export function decodeDeadline(value: unknown): Deadline {
  if (!record(value) || !Number.isSafeInteger(value.epochSecond) || !Number.isInteger(value.nano)) return { state: "unknown" };
  const seconds = value.epochSecond as number, nano = value.nano as number;
  const at = seconds * 1000 + Math.floor(nano / 1_000_000);
  if (nano < 0 || nano >= 1_000_000_000 || !Number.isSafeInteger(at) || Math.abs(at) > 8.64e15) return { state: "unknown" };
  return { state: "known", at };
}
export function courseLink(id: string): string {
  if (!validId(id)) throw new ApiError("schema");
  return `${ORIGIN}/portal/site/${encodeURIComponent(id)}`;
}
export function assignmentLink(siteId: string, placementId: string): string {
  if (!validId(placementId)) throw new ApiError("schema");
  return `${courseLink(siteId)}/tool/${encodeURIComponent(placementId)}?panel=Main`;
}
export function assignmentToolLink(siteId: string): string {
  // Sakai resolves the common tool ID on the server; do not prefix it with "sakai.".
  // ponytail: multiple assignment tools use Sakai's selection; add explicit selection only if needed.
  return `${courseLink(siteId)}/assignment.grades`;
}
export function assignmentNavigationLinks(links: Iterable<{ href: string; textContent: string | null }>): Map<string, string> {
  const found = new Map<string, string>(), ambiguous = new Set<string>();
  for (const link of links) {
    if (!/^(?:課題|Assignments)$/i.test(link.textContent?.trim() ?? "")) continue;
    try {
      const url = new URL(link.href, ORIGIN);
      const match = decodeURIComponent(url.pathname).match(/^\/portal\/site\/([^/]+)\/tool(?:-reset)?\/([^/]+)\/?$/);
      if (url.origin !== ORIGIN || url.username || url.password || !match || !validId(match[1]) || !validId(match[2])) continue;
      const href = assignmentLink(match[1], match[2]);
      if (found.has(match[1]) && found.get(match[1]) !== href) ambiguous.add(match[1]);
      found.set(match[1], href);
    } catch { /* Ignore unknown navigation links rather than guessing a destination. */ }
  }
  for (const siteId of ambiguous) found.delete(siteId);
  return found;
}
export function decodeItems(value: unknown, site: Site, kind: Kind, fetchedAt: number): { items: Item[]; skipped: number; unsupported: boolean } {
  const rows = collection(value, kind === "assignment" ? "assignment_collection" : "sam_pub_collection");
  if (kind === "quiz") return { items: [], skipped: 0, unsupported: rows.length > 0 };
  const items: Item[] = [], seen = new Set<string>();
  let skipped = 0;
  for (const row of rows) {
    if (!record(row) || !validId(row.id) || row.context !== site.id || !title(row.title) || seen.has(row.id)) { skipped++; continue; }
    seen.add(row.id);
    items.push({ key: JSON.stringify([site.id, kind, row.id]), id: row.id, site, kind, title: row.title,
      deadline: decodeDeadline(row.dueTime), href: site.assignmentHref ?? assignmentToolLink(site.id), fetchedAt });
  }
  return { items, skipped, unsupported: false };
}
const DAY = 86_400_000, JST = 9 * 3_600_000;
export function group(deadline: Deadline, now: number): Group {
  if (deadline.state !== "known") return deadline.state;
  if (deadline.at < now) return "overdue";
  const tomorrow = Math.floor((now + JST) / DAY) * DAY - JST + DAY;
  return deadline.at < tomorrow ? "today" : deadline.at < tomorrow + 7 * DAY ? "week" : "later";
}
const formatter = new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
export function formatDate(at: number): string { return Number.isFinite(new Date(at).getTime()) ? formatter.format(at) : "日時不明"; }
export function remainingTime(deadline: Deadline, now: number): string {
  if (deadline.state !== "known") return deadline.state === "none" ? "期限なし" : "期限不明";
  const difference = deadline.at - now;
  if (difference < 0) return "期限超過";
  if (difference < 60_000) return "まもなく締切";
  if (difference < 3_600_000) return `残り${Math.ceil(difference / 60_000)}分`;
  if (difference < DAY) return `残り${Math.ceil(difference / 3_600_000)}時間`;
  const days = Math.floor(difference / DAY), hours = Math.floor(difference % DAY / 3_600_000);
  return `残り${days}日${hours ? `${hours}時間` : ""}`;
}
export type Filters = { search: string; site: string; kind: string; showCompleted: boolean };
export function visibleItems(items: Item[], filters: Filters, completed: ReadonlySet<string>): Item[] {
  const search = filters.search.trim().toLocaleLowerCase("ja");
  return items.filter(item => (!filters.site || item.site.id === filters.site) && (!filters.kind || item.kind === filters.kind) &&
    (filters.showCompleted || !completed.has(item.key)) && item.title.toLocaleLowerCase("ja").includes(search)).sort((a, b) => {
    const dateA = a.deadline.state === "known" ? a.deadline.at : Infinity;
    const dateB = b.deadline.state === "known" ? b.deadline.at : Infinity;
    return (dateA === dateB ? 0 : dateA < dateB ? -1 : 1) || a.site.title.localeCompare(b.site.title, "ja") || a.title.localeCompare(b.title, "ja") || a.key.localeCompare(b.key);
  });
}
