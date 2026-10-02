export const ORIGIN = "https://lms.sirius.tuat.ac.jp";
export type Failure = "auth" | "forbidden" | "rate-limit" | "http" | "network" | "timeout" | "aborted" | "html" | "json" | "redirect" | "schema";

export class ApiError extends Error {
  readonly code: Failure;
  readonly retryAt: number | undefined;
  constructor(code: Failure, retryAt?: number) {
    super(code); // Never retain response bodies, URLs or identifiers in errors.
    this.code = code;
    this.retryAt = retryAt;
  }
}

export function validId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_~-]{1,200}$/.test(value) && value !== "." && value !== "..";
}

export function retryAfter(value: string | null, now: number): number {
  if (value && /^\d+$/.test(value.trim())) {
    const delay = Number(value) * 1000;
    if (Number.isFinite(now + delay)) return now + delay;
  }
  const date = value ? Date.parse(value) : NaN;
  return Number.isFinite(date) && date > now ? date : now + 60_000;
}

export class SiriusApi {
  readonly #fetch: typeof fetch;
  readonly #timeout: number;
  constructor(fetcher: typeof fetch = fetch.bind(globalThis), timeout = 15_000) {
    this.#fetch = fetcher;
    this.#timeout = timeout;
  }
  sites(start: number, signal: AbortSignal): Promise<unknown> {
    if (!Number.isSafeInteger(start) || start < 0) throw new ApiError("schema");
    return this.#get(`/direct/site.json?_limit=200&_start=${start}`, signal);
  }
  assignments(siteId: string, signal: AbortSignal): Promise<unknown> {
    if (!validId(siteId)) throw new ApiError("schema");
    return this.#get(`/direct/assignment/site/${encodeURIComponent(siteId)}.json`, signal);
  }
  pages(siteId: string, signal: AbortSignal): Promise<unknown> {
    if (!validId(siteId)) throw new ApiError("schema");
    return this.#get(`/direct/site/${encodeURIComponent(siteId)}/pages.json`, signal);
  }
  quizzes(siteId: string, signal: AbortSignal): Promise<unknown> {
    if (!validId(siteId)) throw new ApiError("schema");
    return this.#get(`/direct/sam_pub/context/${encodeURIComponent(siteId)}.json`, signal);
  }
  async #get(path: string, signal: AbortSignal): Promise<unknown> {
    const controller = new AbortController();
    let timedOut = false;
    const abort = () => controller.abort();
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
    const timer = setTimeout(() => { timedOut = true; abort(); }, this.#timeout);
    const check = () => {
      if (signal.aborted) throw new ApiError("aborted");
      if (timedOut) throw new ApiError("timeout");
    };
    try {
      check();
      const response = await this.#fetch(ORIGIN + path, {
        method: "GET", credentials: "same-origin", redirect: "error", cache: "no-store", signal: controller.signal,
      });
      check();
      if (response.redirected || response.type === "opaqueredirect") throw new ApiError("redirect");
      if (response.status === 401) throw new ApiError("auth");
      if (response.status === 403) throw new ApiError("forbidden");
      if (response.status === 429) throw new ApiError("rate-limit", retryAfter(response.headers.get("retry-after"), Date.now()));
      if (!response.ok) throw new ApiError("http");
      // A verified Sirius login HTML signature is not available yet. Never parse HTML as data.
      if (!/^application\/(?:[a-z0-9.+-]+\+)?json(?:\s*;|$)/i.test(response.headers.get("content-type") ?? "")) throw new ApiError("html");
      let result: unknown;
      try { result = await response.json(); }
      catch { check(); throw new ApiError("json"); }
      check();
      return result;
    } catch (error) {
      check();
      if (error instanceof ApiError) throw error;
      // Fetch deliberately hides redirect/network details with redirect:error.
      throw new ApiError("network");
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
    }
  }
}
