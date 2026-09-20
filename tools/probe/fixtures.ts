type Kind = "site" | "assignment" | "sam_pub";

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function redactedType(value: unknown): unknown {
  if (value === null) return null;
  if (Array.isArray(value)) return [];
  if (typeof value === "object") return {};
  if (typeof value === "string") return "[redacted]";
  if (typeof value === "number") return 0;
  return typeof value === "boolean" ? value : null;
}

function instant(value: unknown): { epochSecond: number; nano: number } | null {
  const data = object(value);
  const seconds = data?.epochSecond;
  const nanos = data?.nano;
  return typeof seconds === "number" && Number.isSafeInteger(seconds) && Math.abs(seconds) < 8.64e12 &&
    typeof nanos === "number" && Number.isInteger(nanos) && nanos >= 0 && nanos < 1e9
    ? { epochSecond: seconds, nano: nanos } : null;
}

// One run shares ID aliases; names, URLs and original dates never enter the output.
export function createFixtureProjector(selectedSiteIds: string[]) {
  const ids = new Map<string, string>();
  const alias = (value: unknown) => {
    if (typeof value !== "string") return redactedType(value);
    if (value === "") return "";
    if (!ids.has(value)) ids.set(value, `${value.startsWith("~") ? "~" : ""}sample-${ids.size + 1}`);
    return ids.get(value)!;
  };
  return (payload: unknown, kind: Kind) => {
    const source = object(payload);
    const key = `${kind}_collection`;
    const collection = source?.[key];
    if (!Array.isArray(collection)) return { unavailable: "collection-not-array" };
    if (kind === "sam_pub" && collection.length) return { unavailable: "nonempty-quiz-fields-unverified" };
    const sample = kind === "site"
      ? collection.filter((item, i) => { const id = object(item)?.id; return i < 2 || typeof id === "string" && selectedSiteIds.includes(id); }).slice(0, 4)
      : collection.slice(0, 2);
    const dateFields = ["openTime", "dueTime", "closeTime", "dropDeadTime"];
    if (kind === "assignment" && sample.some(item => dateFields.some(field => {
      const data = object(item);
      return data && Object.hasOwn(data, field) && data[field] !== null && instant(data[field]) === null;
    }))) return { unavailable: "unsupported-date-value" };
    const times = sample.flatMap(item => dateFields.map(field => instant(object(item)?.[field])))
      .filter((time): time is NonNullable<typeof time> => time !== null)
      .sort((a, b) => a.epochSecond - b.epochSecond || a.nano - b.nano);
    const timeKeys = [...new Set(times.map(time => `${time.epochSecond}:${time.nano}`))];
    const projectTime = (value: unknown): unknown => {
      const valid = instant(value);
      if (valid) return { epochSecond: 1893456000 + timeKeys.indexOf(`${valid.epochSecond}:${valid.nano}`) * 86400, nano: 0 };
      return redactedType(value);
    };
    const fields = kind === "site" ? ["id", "title", "type", "published"] : ["id", "context", "title", ...dateFields];
    const projected = sample.map(item => {
      const data = object(item);
      if (!data) return redactedType(item);
      return Object.fromEntries(fields.filter(k => Object.hasOwn(data, k)).map(k => {
        const value = data[k];
        const replacement = k === "id" || k === "context" ? alias(value)
          : dateFields.includes(k) ? projectTime(value)
          : k === "title" && typeof value === "string" ? "Sample title"
          : k === "type" && typeof value === "string" && ["course", "project", "myworkspace"].includes(value) ? value
          : redactedType(value);
        return [k, replacement];
      }));
    });
    const fixture: Record<string, unknown> = { [key]: projected };
    if (source && Object.hasOwn(source, "entityPrefix")) fixture.entityPrefix = source.entityPrefix === kind ? kind : redactedType(source.entityPrefix);
    return {
      sourceCount: collection.length, sampleCount: sample.length,
      transformations: "selected fields only; shared ID aliases; dates replaced preserving order/equality within this response, not intervals or cross-response dates; unknown values redacted",
      fixture,
    };
  };
}
