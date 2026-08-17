export const adzunaMarkets = [
  { code: "in", label: "India" },
  { code: "us", label: "United States" },
  { code: "gb", label: "United Kingdom" },
  { code: "au", label: "Australia" },
  { code: "ca", label: "Canada" },
  { code: "de", label: "Germany" },
  { code: "fr", label: "France" },
  { code: "nl", label: "Netherlands" },
] as const;

export type AdzunaMarketCode = (typeof adzunaMarkets)[number]["code"];

export type LiveJob = {
  id: string;
  title: string;
  company: string;
  location: string;
  description: string;
  applyUrl: string;
  postedAt: string | null;
  contractType: string | null;
  category: string | null;
  salaryMin: number | null;
  salaryMax: number | null;
  currency: string | null;
};

type AdzunaApiJob = {
  id?: string | number;
  title?: string;
  description?: string;
  redirect_url?: string;
  created?: string;
  contract_type?: string;
  category?: { label?: string };
  company?: { display_name?: string };
  location?: { display_name?: string };
  salary_min?: number;
  salary_max?: number;
  salary_currency?: string;
};

type AdzunaApiPayload = {
  count?: number;
  results?: AdzunaApiJob[];
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function textFromMarkup(value: string) {
  return compact(
    value
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'"),
  );
}

export function toLiveJob(job: AdzunaApiJob): LiveJob | null {
  const id = String(job.id ?? "").trim();
  const title = compact(job.title ?? "");
  const applyUrl = (job.redirect_url ?? "").trim();
  if (!id || !title || !applyUrl) return null;

  return {
    id,
    title,
    company: compact(job.company?.display_name ?? "Unknown company"),
    location: compact(job.location?.display_name ?? "Location not specified"),
    description: textFromMarkup(job.description ?? "No description provided by the source."),
    applyUrl,
    postedAt: job.created?.trim() || null,
    contractType: job.contract_type?.trim() || null,
    category: job.category?.label?.trim() || null,
    salaryMin: typeof job.salary_min === "number" ? job.salary_min : null,
    salaryMax: typeof job.salary_max === "number" ? job.salary_max : null,
    currency: job.salary_currency?.trim() || null,
  };
}

export function buildAdzunaSearchUrl(input: { role: string; location?: string; market: AdzunaMarketCode; page?: number; resultsPerPage?: number; appId: string; appKey: string }) {
  const page = input.page ?? 1;
  const query = new URLSearchParams({
    app_id: input.appId,
    app_key: input.appKey,
    what: compact(input.role),
    results_per_page: String(input.resultsPerPage ?? 12),
    "content-type": "application/json",
  });
  const location = compact(input.location ?? "");
  if (location) query.set("where", location);
  return `https://api.adzuna.com/v1/api/jobs/${input.market}/search/${page}?${query.toString()}`;
}

export async function searchLiveJobs(input: { role: string; location?: string; market: AdzunaMarketCode }) {
  const appId = process.env.ADZUNA_APP_ID;
  const appKey = process.env.ADZUNA_APP_KEY;
  if (!appId || !appKey) throw new Error("Live job search is not configured yet.");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(buildAdzunaSearchUrl({ ...input, appId, appKey }), {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error("The live job source could not return results right now.");
    const payload = (await response.json()) as AdzunaApiPayload;
    return {
      total: typeof payload.count === "number" ? payload.count : 0,
      jobs: (payload.results ?? []).map(toLiveJob).filter((job): job is LiveJob => Boolean(job)),
    };
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw new Error("The live job search took too long. Please try again.");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
