import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { buildJobDiscoveryLinks, JobRecency } from "@/lib/jobDiscovery";
import { ArrowUpRight, Compass, Filter, MapPin, Search, SlidersHorizontal } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";

const suggestedRoles = ["Product Analyst", "AI Product Intern", "Business Analyst", "Software Engineer"];
const recencyOptions: { value: JobRecency; label: string }[] = [
  { value: "any", label: "Any time" }, { value: "day", label: "Past 24 hours" }, { value: "week", label: "Past week" }, { value: "month", label: "Past month" },
];

export default function JobDiscoveryPage() {
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [recency, setRecency] = useState<JobRecency>("week");
  const [searched, setSearched] = useState(false);
  const links = useMemo(() => buildJobDiscoveryLinks(role, location, recency), [role, location, recency]);
  const hasRole = Boolean(role.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (hasRole) setSearched(true);
  }

  function useSuggestedRole(value: string) {
    setRole(value);
    setSearched(true);
  }

  return (
    <div className="studio-page mx-auto max-w-7xl space-y-6">
      <section className="studio-hero overflow-hidden p-6 sm:p-8">
        <div className="relative z-10 max-w-3xl">
          <div className="flex items-center gap-2 text-primary"><Compass className="h-4 w-4" /><p className="data-label">Targeted job discovery</p></div>
          <h1 className="editorial-title mt-3 text-4xl leading-[0.95] sm:text-6xl">Open the right live search, not a generic job board.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">Set your role, location, and posting window once. The studio opens each provider’s own current results—mainstream, startup, YC, remote, and climate-tech—without copying listings into your tracker.</p>
        </div>
        <div className="studio-hero-orb" />
      </section>

      <section className="studio-panel p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
          <div><p className="data-label text-primary">Search brief</p><h2 className="editorial-title mt-2 text-3xl">Set the filters once</h2></div>
          <p className="max-w-md text-sm leading-6 text-muted-foreground">Filters are embedded only where a provider has a supported URL shape. Otherwise, the card says exactly which native filters to use after it opens.</p>
        </div>
        <form onSubmit={submit} className="mt-6 grid gap-4 lg:grid-cols-[1.2fr_1fr_0.8fr_auto] lg:items-end">
          <div className="space-y-2"><Label htmlFor="discovery-role">Role or keywords</Label><Input id="discovery-role" value={role} onChange={event => { setRole(event.target.value); setSearched(false); }} placeholder="e.g. Product Analyst" autoComplete="off" /></div>
          <div className="space-y-2"><Label htmlFor="discovery-location">Location <span className="text-muted-foreground">(optional)</span></Label><div className="relative"><MapPin className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input id="discovery-location" value={location} onChange={event => { setLocation(event.target.value); setSearched(false); }} placeholder="e.g. Bengaluru or Remote" className="pl-9" autoComplete="off" /></div></div>
          <div className="space-y-2"><Label htmlFor="discovery-recency">Posted</Label><Select value={recency} onValueChange={value => { setRecency(value as JobRecency); setSearched(false); }}><SelectTrigger id="discovery-recency"><SelectValue /></SelectTrigger><SelectContent>{recencyOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent></Select></div>
          <Button type="submit" disabled={!hasRole} className="min-w-44"><Filter className="mr-2 h-4 w-4" />Build targeted searches</Button>
        </form>
        <div className="mt-5 flex flex-wrap items-center gap-2"><span className="text-xs font-medium text-muted-foreground">Try a role:</span>{suggestedRoles.map(suggestion => <Button key={suggestion} type="button" size="sm" variant="outline" className="bg-background" onClick={() => useSuggestedRole(suggestion)}>{suggestion}</Button>)}</div>
      </section>

      {searched && links.length ? (
        <section aria-live="polite">
          <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end"><div><p className="data-label text-primary">Your provider searches</p><h2 className="editorial-title mt-2 text-3xl">{role.trim()}{location.trim() ? ` in ${location.trim()}` : ""}</h2></div><p className="flex items-center gap-2 text-xs leading-5 text-muted-foreground"><SlidersHorizontal className="h-4 w-4 shrink-0 text-primary" />Posting window: {recencyOptions.find(option => option.value === recency)?.label.toLowerCase()}.</p></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {links.map(link => <a key={link.id} href={link.href} target="_blank" rel="noreferrer" className="group flex min-h-56 flex-col rounded-xl border border-border bg-card p-5 transition-[transform,border-color,box-shadow] duration-200 hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              <div className="flex items-start justify-between gap-4"><div><p className="data-label text-primary">{link.focus}</p><h3 className="editorial-title mt-2 text-2xl">{link.name}</h3></div><ArrowUpRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-primary" /></div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{link.description}</p>
              <p className="mt-4 rounded-lg border border-border/70 bg-muted/25 px-3 py-2 text-xs leading-5 text-muted-foreground">{link.directFiltersApplied ? "Targeted search ready. " : "Native handoff. "}{link.filterNote}</p>
              <p className="mt-auto pt-4 text-sm font-semibold text-primary">Open targeted search <span aria-hidden="true">→</span></p>
            </a>)}
          </div>
          <p className="mt-5 rounded-lg border border-border/70 bg-muted/25 px-4 py-3 text-xs leading-5 text-muted-foreground">These are provider-owned live search pages. Listings, dates, filters, and eligibility can change at the source; review the original posting before adding a role to your application pipeline.</p>
        </section>
      ) : (
        <section className="rounded-xl border border-dashed border-border bg-card/45 px-6 py-12 text-center"><Search className="mx-auto h-6 w-6 text-primary" /><h2 className="editorial-title mt-4 text-3xl">Your focused provider searches will appear here.</h2><p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">Enter a role, optional location, and posting window. You will receive a clear source-by-source plan—not duplicated listings or a generic home-page redirect.</p></section>
      )}
    </div>
  );
}
