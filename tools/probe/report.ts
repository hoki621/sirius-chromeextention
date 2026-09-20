// These names only control diagnostic output. They are NOT an assumed API schema.
// Unknown names and all scalar values stay out of the report, including keys in props/maps.
const allowedFields = new Set([
  "entityPrefix", "site_collection", "assignment_collection", "sam_pub_collection",
  "id", "title", "type", "published", "context", "contextId", "siteId",
  "entityId", "entityURL", "entityReference", "reference", "url", "status",
  "dueTime", "dueDate", "dueTimeString", "openTime", "openDate", "closeTime",
  "closeDate", "dropDeadTime", "date", "time", "display", "displayTime",
  "epochSecond", "nano", "createdDate", "createdTime", "modifiedDate", "modifiedTime",
  "activeEdit", "sitePages", "siteOwner", "owner", "props", "attachments",
  "submissionStatus", "access", "assignmentId", "assessmentId", "publishedAssessmentId",
]);
const opaqueFields = new Set(["props", "siteOwner", "owner", "attachments", "access", "sitePages"]);

function valueType(value: unknown): string {
  return value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
}

export function describeShape(value: unknown, depth = 0): unknown {
  const type = valueType(value);
  if (type !== "object" && type !== "array") return type;
  if (depth >= 4) return type;
  if (Array.isArray(value)) {
    return { type: "array", empty: value.length === 0, first: value.length ? describeShape(value[0], depth + 1) : null };
  }
  const entries = Object.entries(value as Record<string, unknown>);
  return {
    type: "object",
    fields: Object.fromEntries(entries.filter(([key]) => allowedFields.has(key)).map(([key, field]) => [
      key, opaqueFields.has(key) ? valueType(field) : describeShape(field, depth + 1),
    ])),
    omittedFieldCount: entries.filter(([key]) => !allowedFields.has(key)).length,
  };
}

export function courseIdFromLink(href: string): string | null {
  try {
    const url = new URL(href, "https://lms.sirius.tuat.ac.jp");
    if (url.origin !== "https://lms.sirius.tuat.ac.jp" || url.username || url.password) return null;
    const match = /^\/portal\/site\/([^/]+)$/.exec(url.pathname);
    const id = match?.[1] ? decodeURIComponent(match[1]) : "";
    return /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}

type ProbeResult = { endpoint: string; status?: number; format?: string; shape?: unknown; error?: string };

export async function runProbe(courseIds: string[], request: typeof fetch = fetch): Promise<ProbeResult[]> {
  const ids = [...new Set(courseIds)].filter(id => /^[a-zA-Z0-9_-]{1,128}$/.test(id)).slice(0, 2);
  const targets: [string, string][] = [["sites", "/direct/site.json?_limit=200"]];
  for (const [index, id] of ids.entries()) {
    targets.push([`assignments-${index + 1}`, `/direct/assignment/site/${encodeURIComponent(id)}.json`]);
    targets.push([`quizzes-${index + 1}`, `/direct/sam_pub/context/${encodeURIComponent(id)}.json`]);
  }
  const results: ProbeResult[] = [];
  for (const [endpoint, path] of targets) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await request(`https://lms.sirius.tuat.ac.jp${path}`, {
        method: "GET", credentials: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal,
      });
      const contentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
      const json = contentType === "application/json";
      const result: ProbeResult = { endpoint, status: response.status, format: json ? "json" : contentType === "text/html" ? "html" : "other" };
      results.push(result);
      if (response.status === 401 || response.status === 429) break;
      if (response.ok && json) {
        try { result.shape = describeShape(await response.json()); }
        catch { result.error = controller.signal.aborted ? "timeout" : "invalid-json"; }
      }
    } catch {
      results.push({ endpoint, error: controller.signal.aborted ? "timeout" : "network-or-redirect" });
    } finally {
      clearTimeout(timer);
    }
  }
  return results;
}
