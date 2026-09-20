import { ApiError, SiriusApi } from "./api.ts";
import type { Failure } from "./api.ts";
import { decodeItems, decodeSites } from "./model.ts";
import type { Item, Kind, Site } from "./model.ts";

export const CACHE_MS = 5 * 60_000;
export type Scope = { site: Site; kind: Kind; state: "pending" | "ok" | "unsupported" | "error"; skipped: number; error?: Failure; fetchedAt?: number };
export type LoadState = { loading: boolean; sites: Site[]; items: Item[]; scopes: Scope[]; fetchedAt: number | null; error: Failure | null; retryAt: number; skippedSites: number; pagingComplete: boolean };
function empty(): LoadState {
  return { loading: false, sites: [], items: [], scopes: [], fetchedAt: null, error: null, retryAt: 0, skippedSites: 0, pagingComplete: false };
}
export class Loader {
  state = empty();
  readonly #api: SiriusApi;
  readonly #notify: () => void;
  readonly #now: () => number;
  #controller = new AbortController();
  #generation = 0;
  #task: Promise<void> | null = null;
  constructor(api: SiriusApi, notify: () => void, now = Date.now) { this.#api = api; this.#notify = notify; this.#now = now; }
  refresh(force = false): Promise<void> {
    if (this.#task) return this.#task;
    if (this.#now() < this.state.retryAt) return Promise.resolve();
    if (!force && this.state.fetchedAt !== null && this.#now() - this.state.fetchedAt < CACHE_MS) return Promise.resolve();
    this.#controller = new AbortController();
    const generation = ++this.#generation;
    this.state = { ...empty(), loading: true };
    // Begin in a microtask so even synchronous refresh listeners coalesce.
    this.#task = Promise.resolve().then(() => this.#load(generation, this.#controller.signal)).finally(() => {
      this.#task = null;
      if (generation === this.#generation) { this.state.loading = false; this.#notify(); }
    });
    this.#notify();
    return this.#task;
  }
  clear(): void {
    this.#generation++;
    this.#controller.abort();
    this.state = empty();
    this.#notify();
  }
  async #load(generation: number, signal: AbortSignal): Promise<void> {
    const current = () => generation === this.#generation && !signal.aborted;
    const fail = (error: unknown): void => {
      if (!current()) return;
      const failure = error instanceof ApiError ? error : new ApiError("network");
      this.state.error = failure.code;
      if (failure.code === "rate-limit") this.state.retryAt = failure.retryAt ?? this.#now() + 60_000;
      if (failure.code === "auth" || failure.code === "html") {
        // Unknown HTML may be a login page: clear private data without claiming a verified logout.
        this.state = { ...empty(), loading: true, error: failure.code };
      }
      this.#controller.abort();
      this.#notify();
    };
    try {
      const seen = new Set<string>();
      let start = 0;
      // ponytail: cap discovery at 10 pages; report partial coverage instead of unbounded LMS traffic.
      for (let page = 0; page < 10; page++) {
        if (!current()) return;
        const decoded = decodeSites(await this.#api.sites(start, signal));
        if (!current()) return;
        if (decoded.count === 0) { this.state.pagingComplete = true; break; }
        if (decoded.ids.some(id => seen.has(id))) throw new ApiError("schema");
        decoded.ids.forEach(id => seen.add(id));
        this.state.sites.push(...decoded.sites);
        this.state.skippedSites += decoded.skipped;
        start += decoded.count;
      }
      if (!current()) return;
      this.state.scopes = this.state.sites.flatMap(site => (["assignment", "quiz"] as const).map(kind => ({ site, kind, state: "pending" as const, skipped: 0 })));
      this.#notify();
      let next = 0;
      const worker = async () => {
        while (current()) {
          const scope = this.state.scopes[next++];
          if (!scope) return;
          try {
            const response = scope.kind === "assignment" ? await this.#api.assignments(scope.site.id, signal) : await this.#api.quizzes(scope.site.id, signal);
            if (!current()) return;
            const fetchedAt = this.#now();
            const decoded = decodeItems(response, scope.site, scope.kind, fetchedAt);
            scope.state = decoded.unsupported ? "unsupported" : "ok";
            scope.skipped = decoded.skipped;
            scope.fetchedAt = fetchedAt;
            this.state.items.push(...decoded.items);
          } catch (error) {
            if (!current()) return;
            const failure = error instanceof ApiError ? error : new ApiError("network");
            scope.state = "error"; scope.error = failure.code;
            if (["auth", "html", "rate-limit"].includes(failure.code)) { fail(failure); return; }
          }
          if (current()) this.#notify();
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));
      if (current()) this.state.fetchedAt = this.#now();
    } catch (error) { fail(error); }
  }
}
