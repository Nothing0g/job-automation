import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildJobDiscoveryLinks } from "@/lib/jobDiscovery";
import { trpc } from "@/lib/trpc";
import { ArrowUpRight, BriefcaseBusiness, Building2, CalendarDays, Compass, MapPin, Search, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const suggestedRoles = ["Product Analyst", "AI Product Intern", "Business Analyst", "Software Engineer"];
const markets = [
  { code: "in", label: "India" }, { code: "us", label: "United States" }, { code: "gb", label: "United Kingdom" }, { code: "au", label: "Australia" },
  { code: "ca", label: "Canada" }, { code: "de", label: "Germany" }, { code: "fr", label: "France" }, { code: "nl", label: "Netherlands" },
] as const;

type SearchBrief = { role: string; location: string; market: (typeof markets)[number]["code"] };

function displayDate(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function displayContract(value: string | null) {
  return value ? value.replace(/[_-]/g, " ").replace(/\b\w/g, letter => letter.toUpperCase()) : null;
}

function displaySalary(minimum: number | null, maximum: number | null, currency: string | null) {
  if (minimum === null && maximum === null) return null;
  const formatter = new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 0 });
  if (minimum !== null && maximum !== null) return `${formatter.format(minimum)}–${formatter.format(maximum)}`;
  return formatter.format(minimum ?? maximum ?? 0);
}

export default function JobDiscoveryPage() {
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [market, setMarket] = useState<SearchBrief["market"]>("in");
  const [searchBrief, setSearchBrief] = useState<SearchBrief | null>(null);
  const links = useMemo(() => buildJobDiscoveryLinks(role, location), [role, location]);
  const hasRole = Boolean(role.trim());
  const liveResults = trpc.jobDiscovery.search.useQuery(searchBrief ?? { role: "placeholder", location: "", market: "in" }, { enabled: Boolean(searchBrief), retry: false });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (hasRole) setSearchBrief({ role: role.trim(), location: location.trim(), market });
  }

  function useSuggestedRole(value: string) {
    setRole(value);
    setSearchBrief({ role: value, location: location.trim(), market });
  }

  return (
    <div className="studio-page mx-auto max-w-7xl space-y-6">
      <section className="studio-hero overflow-hidden p-6 sm:p-8">
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-primary"><Compass className="h-4 w-4" /><p className="data-label">Public job discovery</p></div>
          <h1 className="editorial-title mt-3 text-4xl leading-[0.95] sm:text-6xl">See current openings before you leave your workspace.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">Search a role and optional location to view fresh job cards here. When an opening is worth pursuing, the application step still opens on its original site.</p>
        </div>
        <div className="studio-hero-orb" />
      </section>

      <section className="studio-panel p-5 sm:p-6">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div><p className="data-label text-primary">Search brief</p><h2 className="editorial-title mt-2 text-3xl">Choose your next opening</h2></div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">Live cards are retrieved when you search, not copied into your tracker. Review each original posting before you add it to your pipeline.</p>
        </div>
        <form onSubmit={submit} className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr_0.7fr_auto] lg:items-end">
          <div className="space-y-2"><Label htmlFor="discovery-role">Role or keywords</Label><Input id="discovery-role" value={role} onChange={event => setRole(event.target.value)} placeholder="e.g. Product Analyst" autoComplete="off" /></div>
          <div className="space-y-2"><Label htmlFor="discovery-location">Location <span className="text-muted-foreground">(optional)</span></Label><div className="relative"><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="discovery-location" value={location} onChange={event => setLocation(event.target.value)} placeholder="e.g. Bengaluru or Remote" className="pl-9" autoComplete="off" /></div></div>
          <div className="space-y-2"><Label htmlFor="discovery-market">Search market</Label><Select value={market} onValueChange={(value) => setMarket(value as SearchBrief["market"])}><SelectTrigger id="discovery-market"><SelectValue /></SelectTrigger><SelectContent>{markets.map(option => <SelectItem key={option.code} value={option.code}>{option.label}</SelectItem>)}</SelectContent></Select></div>
          <Button type="submit" disabled={!hasRole || liveResults.isFetching} className="min-w-40"><Search className="mr-2 h-4 w-4" />{liveResults.isFetching ? "Searching…" : "Show live jobs"}</Button>
        </form>
        <div className="mt-5 flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-muted-foreground">Try a role:</span>{suggestedRoles.map(suggestion => <Button key={suggestion} type="button" size="sm" variant="outline" className="bg-background" onClick={() => useSuggestedRole(suggestion)}>{suggestion}</Button>)}</div>
      </section>

      {searchBrief ? (
        <section aria-live="polite">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="data-label text-primary">Live openings</p><h2 className="editorial-title mt-2 text-3xl">{searchBrief.role}{searchBrief.location ? ` in ${searchBrief.location}` : ""}</h2></div><p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground"><ShieldCheck className="h-4 w-4 shrink-0 text-primary" />Retrieved on demand from Adzuna; not saved to your tracker.</p></div>
          {liveResults.isLoading ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-72 animate-pulse rounded-xl border border-border bg-card/60" />)}</div> : null}
          {liveResults.error ? <div className="mt-5 rounded-xl border border-destructive/40 bg-destructive/5 p-5"><h3 className="font-semibold text-foreground">Live results are temporarily unavailable.</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{liveResults.error.message}</p><Button className="mt-4" variant="outline" onClick={() => liveResults.refetch()}>Try again</Button></div> : null}
          {liveResults.data ? <>
            <p className="mt-4 text-sm text-muted-foreground">{liveResults.data.total.toLocaleString()} matching openings reported by the source. Showing the first {liveResults.data.jobs.length}.</p>
            {liveResults.data.jobs.length ? <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">{liveResults.data.jobs.map(job => <article key={job.id} className="flex min-h-72 flex-col rounded-xl border border-border bg-card p-5 shadow-sm transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg">
              <div className="flex items-start justify-between gap-4"><div className="min-w-0"><p className="data-label text-primary">{job.category || "Live job"}</p><h3 className="editorial-title mt-2 line-clamp-2 text-2xl">{job.title}</h3></div><BriefcaseBusiness className="h-5 w-5 shrink-0 text-primary" /></div>
              <div className="mt-4 space-y-2 text-sm text-muted-foreground"><p className="flex items-center gap-2"><Building2 className="h-4 w-4 shrink-0" />{job.company}</p><p className="flex items-center gap-2"><MapPin className="h-4 w-4 shrink-0" />{job.location}</p>{displayDate(job.postedAt) ? <p className="flex items-center gap-2"><CalendarDays className="h-4 w-4 shrink-0" />Posted {displayDate(job.postedAt)}</p> : null}</div>
              <p className="mt-4 line-clamp-3 text-sm leading-6 text-muted-foreground">{job.description}</p>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">{displayContract(job.contractType) ? <span className="rounded-full border border-border bg-muted/45 px-2.5 py-1 text-xs font-medium text-muted-foreground">{displayContract(job.contractType)}</span> : null}{displaySalary(job.salaryMin, job.salaryMax, job.currency) ? <span className="rounded-full border border-border bg-muted/45 px-2.5 py-1 text-xs font-medium text-muted-foreground">{displaySalary(job.salaryMin, job.salaryMax, job.currency)}</span> : null}</div>
              <a href={job.applyUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary transition-colors hover:text-primary/75 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">Review and apply on original site <ArrowUpRight className="h-4 w-4" /></a>
            </article>)}</div> : <div className="mt-5 rounded-xl border border-dashed border-border bg-card/45 px-6 py-10 text-center"><Search className="mx-auto h-6 w-6 text-primary" /><h3 className="editorial-title mt-4 text-2xl">No current matches from this source.</h3><p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-muted-foreground">Try a broader title, remove the location, or inspect the selected public sources below.</p></div>}
          </> : null}
          <div className="mt-10 flex flex-col justify-between gap-3 border-t border-border pt-7 sm:flex-row sm:items-end"><div><p className="data-label text-primary">Broaden your scan</p><h3 className="editorial-title mt-2 text-2xl">Selected public sources</h3></div><p className="text-sm text-muted-foreground">Use these only when you want to inspect another provider’s own live search.</p></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {links.map(link => <a key={link.id} href={link.href} target="_blank" rel="noreferrer" className="group rounded-xl border border-border bg-card p-5 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <div className="flex items-start justify-between gap-4"><div><p className="data-label text-primary">{link.focus}</p><h3 className="editorial-title mt-2 text-2xl">{link.name}</h3></div><ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" /></div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{link.description}</p>
              <p className="mt-5 text-sm font-medium text-primary">Open search <span aria-hidden="true">→</span></p>
            </a>)}
          </div>
          <p className="mt-5 rounded-lg border border-border/70 bg-muted/25 px-4 py-3 text-xs leading-5 text-muted-foreground">Availability, dates, compensation, and application requirements come from the live source and can change. Review the original posting before adding a role to your application pipeline.</p>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-card/45 px-6 py-12 text-center"><Compass className="mx-auto h-6 w-6 text-primary" /><h2 className="editorial-title mt-4 text-3xl">Your live job cards will appear here.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Enter a role above to search current openings without leaving your workspace.</p></section>
      )}
    </div>
  );
}
