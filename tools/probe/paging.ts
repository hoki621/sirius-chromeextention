export function siteIds(payload: unknown): string[] | null {
  if (payload === null || typeof payload !== "object" || !Object.hasOwn(payload, "site_collection")) return null;
  const collection: unknown = (payload as Record<string, unknown>).site_collection;
  if (!Array.isArray(collection)) return null;
  const ids = collection.map(item => item !== null && typeof item === "object" ? (item as Record<string, unknown>).id : null);
  return ids.every((id): id is string => typeof id === "string" && id.length > 0) && new Set(ids).size === ids.length ? ids : null;
}

export function pagingObservations(pages: Map<string, unknown>) {
  const initial = siteIds(pages.get("sites"));
  const starts = [0, 1, 2].map(start => siteIds(pages.get(`site-start-${start}`)));
  const tail = siteIds(pages.get("site-after-initial"));
  const zeroBased = initial !== null && initial.length >= 2 && starts.every((ids, i) => ids !== null &&
    ids.length === (i < initial.length ? 1 : 0) && (ids.length === 0 || ids[0] === initial[i]));
  const oneBased = initial !== null && initial.length >= 2 && starts.every(ids => ids?.length === 1) &&
    starts[0]?.[0] === initial[0] && starts[1]?.[0] === initial[0] && starts[2]?.[0] === initial[1];
  return {
    initialCount: initial?.length ?? null,
    personalSiteCount: initial?.filter(id => id.startsWith("~")).length ?? null,
    startCounts: starts.map(ids => ids?.length ?? null),
    indexEvidence: zeroBased ? "zero-based-sample" : oneBased ? "one-based-or-zero-clamped-sample" : "inconclusive",
    afterInitialCount: tail?.length ?? null,
    // Empty continuation is evidence for this snapshot, not a promise about all accessible courses.
    boundaryEvidence: !zeroBased || tail === null ? "inconclusive" : tail.length ? "more-items-exist" : "empty-at-initial-count",
  };
}
