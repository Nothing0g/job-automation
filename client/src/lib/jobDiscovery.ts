export type JobRecency = "any" | "day" | "week" | "month";

export type JobDiscoverySource = {
  id: "linkedin" | "indeed" | "glassdoor" | "naukri" | "wellfound" | "yc" | "himalayas" | "remoteok" | "climatebase" | "google";
  name: string;
  description: string;
  focus: string;
};

export type JobDiscoveryLink = JobDiscoverySource & {
  href: string;
  filterNote: string;
  directFiltersApplied: boolean;
};

export const jobDiscoverySources: readonly JobDiscoverySource[] = [
  { id: "linkedin", name: "LinkedIn", focus: "Network", description: "Role, place, and posting-date search." },
  { id: "indeed", name: "Indeed", focus: "Broad search", description: "Role, place, and recent-post search." },
  { id: "glassdoor", name: "Glassdoor", focus: "Research", description: "Job search with company context and a date window." },
  { id: "naukri", name: "Naukri", focus: "India", description: "India-focused role routes with a recent-post window." },
  { id: "wellfound", name: "Wellfound", focus: "Startups", description: "Venture-backed and startup roles with native title and location selectors." },
  { id: "yc", name: "YC Work at a Startup", focus: "YC startups", description: "Official roles at Y Combinator companies, with mapped role categories." },
  { id: "himalayas", name: "Himalayas", focus: "Remote", description: "Remote-first roles with native country, skill, and experience filters." },
  { id: "remoteok", name: "Remote OK", focus: "Remote", description: "Remote-first role pages for distributed work." },
  { id: "climatebase", name: "Climatebase", focus: "Climate tech", description: "Mission-driven climate and clean-tech opportunities." },
  { id: "google", name: "Google Jobs", focus: "Wide scan", description: "A broad current-jobs scan across the public web." },
];

function trimmed(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function toSlug(value: string) {
  return trimmed(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function recencyDays(recency: JobRecency) {
  return recency === "day" ? "1" : recency === "week" ? "7" : recency === "month" ? "30" : null;
}

function linkedInRecency(recency: JobRecency) {
  return recency === "day" ? "r86400" : recency === "week" ? "r604800" : recency === "month" ? "r2592000" : null;
}

function googleRecency(recency: JobRecency) {
  return recency === "day" ? "qdr:d" : recency === "week" ? "qdr:w" : recency === "month" ? "qdr:m" : null;
}

function ycRoleFor(role: string) {
  const normalized = role.toLowerCase();
  if (/product/.test(normalized)) return "product-manager";
  if (/design|ux|ui/.test(normalized)) return "designer";
  if (/sales|business development/.test(normalized)) return "sales-manager";
  if (/market/.test(normalized)) return "marketing";
  if (/support|customer success/.test(normalized)) return "support";
  if (/operations|ops/.test(normalized)) return "operations";
  if (/engineer|developer|software|data|machine learning|ai/.test(normalized)) return "software-engineer";
  return null;
}

function jobDateLabel(recency: JobRecency) {
  return recency === "any" ? "any posting date" : recency === "day" ? "past 24 hours" : recency === "week" ? "past week" : "past month";
}

/**
 * Creates provider-owned live search links. The builder applies terms only to
 * documented or browser-verified URL shapes; sources with native picker-only
 * filters intentionally open their job board with an explicit handoff note.
 */
export function buildJobDiscoveryLinks(role: string, location = "", recency: JobRecency = "week"): JobDiscoveryLink[] {
  const searchRole = trimmed(role);
  const searchLocation = trimmed(location);
  if (!searchRole) return [];

  const days = recencyDays(recency);
  const linkedIn = new URL("https://www.linkedin.com/jobs/search/");
  linkedIn.searchParams.set("keywords", searchRole);
  if (searchLocation) linkedIn.searchParams.set("location", searchLocation);
  const linkedInTime = linkedInRecency(recency);
  if (linkedInTime) linkedIn.searchParams.set("f_TPR", linkedInTime);

  const indeed = new URL("https://www.indeed.com/jobs");
  indeed.searchParams.set("q", searchRole);
  if (searchLocation) indeed.searchParams.set("l", searchLocation);
  if (days) indeed.searchParams.set("fromage", days);

  const glassdoor = new URL("https://www.glassdoor.com/Job/jobs.htm");
  glassdoor.searchParams.set("sc.keyword", searchRole);
  if (searchLocation) glassdoor.searchParams.set("locKeyword", searchLocation);
  if (days) glassdoor.searchParams.set("fromAge", days);

  const naukriRole = toSlug(searchRole);
  const naukriLocation = toSlug(searchLocation);
  const naukriPath = naukriLocation ? `/${naukriRole}-jobs-in-${naukriLocation}` : `/${naukriRole}-jobs`;
  const naukri = new URL(`https://www.naukri.com${naukriPath}`);
  if (days) naukri.searchParams.set("jobAge", days);

  const remoteOk = new URL(`https://remoteok.com/remote-${toSlug(searchRole)}-jobs`);
  const broadSearch = new URL("https://www.google.com/search");
  broadSearch.searchParams.set("q", `${searchRole}${searchLocation ? ` ${searchLocation}` : ""} jobs`);
  const googleTime = googleRecency(recency);
  if (googleTime) broadSearch.searchParams.set("tbs", googleTime);

  const ycRole = ycRoleFor(searchRole);
  const ycLocation = searchLocation.toLowerCase();
  const yc = new URL(ycRole ? `https://www.workatastartup.com/jobs/${ycLocation.includes("remote") ? "r" : "l"}/${ycRole}` : "https://www.workatastartup.com/");

  const values: Record<JobDiscoverySource["id"], Pick<JobDiscoveryLink, "href" | "filterNote" | "directFiltersApplied">> = {
    linkedin: { href: linkedIn.toString(), directFiltersApplied: true, filterNote: `Role${searchLocation ? ", location" : ""}, and ${jobDateLabel(recency)} are ready.` },
    indeed: { href: indeed.toString(), directFiltersApplied: true, filterNote: `Role${searchLocation ? ", location" : ""}, and ${jobDateLabel(recency)} are ready.` },
    glassdoor: { href: glassdoor.toString(), directFiltersApplied: true, filterNote: `Role${searchLocation ? ", location" : ""}, and ${jobDateLabel(recency)} are ready.` },
    naukri: { href: naukri.toString(), directFiltersApplied: true, filterNote: `Role${searchLocation ? ", India location" : ""}, and ${jobDateLabel(recency)} are ready.` },
    wellfound: { href: "https://wellfound.com/jobs", directFiltersApplied: false, filterNote: "Open Wellfound’s verified jobs page, then use its native Job title and Location selectors." },
    yc: { href: yc.toString(), directFiltersApplied: Boolean(ycRole), filterNote: ycRole ? `Closest official YC category is ready${ycLocation.includes("remote") ? " with Remote applied" : ""}.` : "Open YC’s board, then choose its closest native category." },
    himalayas: { href: "https://himalayas.app/jobs", directFiltersApplied: false, filterNote: "Open the remote board, then use its native role, country, salary, and experience filters." },
    remoteok: { href: remoteOk.toString(), directFiltersApplied: true, filterNote: `A remote ${searchRole} role route is ready; refine tags on Remote OK if needed.` },
    climatebase: { href: "https://climatebase.org/jobs", directFiltersApplied: false, filterNote: "Open the climate-tech board, then use its native title, skill, company, and location search." },
    google: { href: broadSearch.toString(), directFiltersApplied: true, filterNote: `Role${searchLocation ? ", location" : ""}, and ${jobDateLabel(recency)} are ready.` },
  };

  return jobDiscoverySources.map(source => ({ ...source, ...values[source.id] }));
}
