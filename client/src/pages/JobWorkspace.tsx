import { Button } from "@/components/ui/button";
import { GmailComposeAction } from "@/components/GmailComposeAction";
import { GmailDraftAttachmentAction } from "@/components/GmailDraftAttachmentAction";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import {
  exportDocx,
  exportPdf,
  resumeFitsOnePage,
  resumeHeader,
  type ContactLinks,
  type ExportDocumentKind,
} from "@/lib/documentExport";
import { cleanEmailDraftForDisplay } from "@/lib/emailDraft";
import { buildGmailComposeUrl, gmailComposeGuidance } from "@/lib/gmailCompose";
import {
  ArrowLeft,
  CalendarClock,
  CheckCircle2,
  Clipboard,
  Download,
  Eye,
  FileDown,
  FileText,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { toast } from "sonner";

const statuses = [
  ["to-apply", "To apply"],
  ["applied", "Applied"],
  ["interview", "Interview"],
  ["offer", "Offer"],
  ["rejected", "Rejected"],
] as const;

const draftProviderStorageKey = "job-automation:draft-provider";
type DraftProvider = "gemini" | "groq";

type WorkspaceForm = {
  company: string;
  role: string;
  jobDescription: string;
  contextMode: "full" | "limited";
  contactEmail: string;
  sourceUrl: string;
  status: string;
  notes: string;
  tailoredResume: string;
  emailDraft: string;
  nextAction: string;
  followUpAt: string;
};

const emptyForm: WorkspaceForm = {
  company: "",
  role: "",
  jobDescription: "",
  contextMode: "full",
  contactEmail: "",
  sourceUrl: "",
  status: "to-apply",
  notes: "",
  tailoredResume: "",
  emailDraft: "",
  nextAction: "",
  followUpAt: "",
};

function dateInput(value: Date | null) {
  return value ? new Date(value).toISOString().slice(0, 10) : "";
}

function copyText(value: string, label: string) {
  void navigator.clipboard
    .writeText(value)
    .then(() => toast.success(`${label} copied.`))
    .catch(() => toast.error("Copy was unavailable. Please select the text manually."));
}

function downloadText(value: string, filename: string) {
  const url = URL.createObjectURL(new Blob([value], { type: "text/plain;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function ExportActions({
  content,
  kind,
  fileStem,
  company,
  role,
  contactLinks,
  requiresApproval = false,
  approved = false,
}: {
  content: string;
  kind: ExportDocumentKind;
  fileStem: string;
  company: string;
  role: string;
  contactLinks?: ContactLinks;
  requiresApproval?: boolean;
  approved?: boolean;
}) {
  const label = kind === "resume" ? "Resume" : "Cover letter";
  const disabled = !content.trim() || (requiresApproval && !approved);
  const disabledTitle = requiresApproval && !approved
    ? "Approve the reviewed resume before exporting or copying it."
    : undefined;
  const input = { content, kind, fileStem, company, role, contactLinks };

  async function createDocx() {
    try {
      await exportDocx(input);
      toast.success(`${label} DOCX downloaded.`);
    } catch {
      toast.error(`Could not create the ${label.toLowerCase()} DOCX.`);
    }
  }

  function createPdf() {
    try {
      exportPdf(input);
      toast.success(`${label} PDF downloaded.`);
    } catch {
      toast.error(`Could not create the ${label.toLowerCase()} PDF.`);
    }
  }

  return (
    <div className="flex flex-wrap gap-1">
      <Button type="button" size="sm" variant="ghost" title={disabledTitle} disabled={disabled} onClick={() => copyText(content, label)}>
        <Clipboard className="mr-1.5 h-3.5 w-3.5" />Copy
      </Button>
      <Button type="button" size="sm" variant="ghost" title={disabledTitle} disabled={disabled} onClick={() => downloadText(content, `${fileStem}-${kind}.txt`)}>
        <Download className="mr-1.5 h-3.5 w-3.5" />Text
      </Button>
      <Button type="button" size="sm" variant="outline" className="bg-background" title={disabledTitle} disabled={disabled} onClick={() => void createDocx()}>
        <FileText className="mr-1.5 h-3.5 w-3.5" />DOCX
      </Button>
      <Button type="button" size="sm" variant="outline" className="bg-background" title={disabledTitle} disabled={disabled} onClick={createPdf}>
        <FileDown className="mr-1.5 h-3.5 w-3.5" />PDF
      </Button>
    </div>
  );
}

function ResumePreview({ content, contactLinks, emptyMessage = "Generate a resume to review it here before any export is enabled." }: { content: string; contactLinks?: ContactLinks; emptyMessage?: string }) {
  const { data: previewProfile } = trpc.profile.get.useQuery();
  const { name, links, body } = resumeHeader(content, contactLinks ?? previewProfile?.contactLinks);

  return (
    <article aria-label="One-page resume preview" className="rounded-lg border bg-card px-5 py-4 font-serif text-[11px] leading-[1.35] text-foreground sm:px-7">
      {content.trim() ? (
        <>
          {name && <p className="text-center text-base font-bold tracking-[0.08em]">{name.toUpperCase()}</p>}
          {links.length > 0 && (
            <p className="mb-1 text-center font-sans text-[10px] text-primary">
              {links.map((link, index) => (
                <span key={link.label}>
                  {index > 0 && <span className="px-1 text-muted-foreground">·</span>}
                  <a href={link.href} target="_blank" rel="noreferrer" className="underline decoration-primary/50 underline-offset-2 hover:text-foreground">
                    {link.label}
                  </a>
                </span>
              ))}
            </p>
          )}
          {body.map((block, index) => {
            if (block.type === "heading" && block.level === 2) {
              return <p key={index} className="mt-2 border-b border-foreground pb-0.5 text-[10px] font-bold tracking-[0.04em]">{block.text.toUpperCase()}</p>;
            }
            if (block.type === "heading" && block.level === 3) {
              return <p key={index} className="mt-1 font-bold">{block.text}</p>;
            }
            if (block.type === "bullet") {
              return <p key={index} className="ml-3 pl-1 before:mr-1 before:content-['•']">{block.text}</p>;
            }
            return <p key={index}>{block.text}</p>;
          })}
        </>
      ) : (
        <p className="font-sans text-sm text-muted-foreground">{emptyMessage}</p>
      )}
    </article>
  );
}

export default function JobWorkspace() {
  const [, params] = useRoute("/jobs/:id");
  const jobId = Number(params?.id);
  const utils = trpc.useUtils();
  const { data: job, isLoading } = trpc.jobs.get.useQuery({ id: jobId }, { enabled: Number.isFinite(jobId) });
  const { data: profile } = trpc.profile.get.useQuery();
  const { data: providerStatus } = trpc.drafting.providers.useQuery();
  const [form, setForm] = useState<WorkspaceForm>(emptyForm);
  const [showResumeEditor, setShowResumeEditor] = useState(false);
  const [resumeApprovedAt, setResumeApprovedAt] = useState<Date | null>(null);
  const [draftProvider, setDraftProvider] = useState<DraftProvider>("gemini");

  useEffect(() => {
    if (!job) return;
    setForm({
      company: job.company,
      role: job.role,
      jobDescription: job.jobDescription,
      contextMode: job.contextMode,
      contactEmail: job.contactEmail ?? "",
      sourceUrl: job.sourceUrl ?? "",
      status: job.status,
      notes: job.notes ?? "",
      tailoredResume: job.tailoredResume ?? "",
      emailDraft: cleanEmailDraftForDisplay(job.emailDraft ?? ""),
      nextAction: job.nextAction ?? "",
      followUpAt: dateInput(job.followUpAt),
    });
    setResumeApprovedAt(job.tailoredResumeApprovedAt ?? null);
  }, [job]);

  useEffect(() => {
    const storedProvider = window.localStorage.getItem(draftProviderStorageKey);
    if (storedProvider === "gemini" || storedProvider === "groq") {
      setDraftProvider(storedProvider);
    }
  }, []);

  const save = trpc.jobs.update.useMutation({
    onSuccess: data => {
      if (data) {
        setForm({
          company: data.company,
          role: data.role,
          jobDescription: data.jobDescription,
          contextMode: data.contextMode,
          contactEmail: data.contactEmail ?? "",
          sourceUrl: data.sourceUrl ?? "",
          status: data.status,
          notes: data.notes ?? "",
          tailoredResume: data.tailoredResume ?? "",
          emailDraft: cleanEmailDraftForDisplay(data.emailDraft ?? ""),
          nextAction: data.nextAction ?? "",
          followUpAt: dateInput(data.followUpAt),
        });
        setResumeApprovedAt(data.tailoredResumeApprovedAt ?? null);
      }
      toast.success("Workspace saved.");
      void utils.jobs.list.invalidate();
      void utils.jobs.get.invalidate({ id: jobId });
    },
    onError: error => toast.error(error.message),
  });

  const generate = trpc.jobs.generateDrafts.useMutation({
    onSuccess: data => {
      if (data) {
        setForm(current => ({ ...current, tailoredResume: data.tailoredResume ?? "", emailDraft: cleanEmailDraftForDisplay(data.emailDraft ?? "") }));
        setResumeApprovedAt(data.tailoredResumeApprovedAt ?? null);
      }
      toast.success(form.contextMode === "limited" ? "A one-page role-based resume and factual outreach email are ready to review." : "A one-page resume draft is ready to preview and approve.");
      void utils.jobs.list.invalidate();
      void utils.jobs.get.invalidate({ id: jobId });
    },
    onError: error => toast.error(error.message),
  });

  const setApproval = trpc.jobs.setResumeApproval.useMutation({
    onSuccess: data => {
      setResumeApprovedAt(data?.tailoredResumeApprovedAt ?? null);
      toast.success(data?.tailoredResumeApprovedAt ? "Resume approved. DOCX and PDF exports are now ready." : "Resume returned to review.");
      void utils.jobs.list.invalidate();
      void utils.jobs.get.invalidate({ id: jobId });
    },
    onError: error => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate({
      id: jobId,
      ...form,
      contactEmail: form.contactEmail || null,
      sourceUrl: form.sourceUrl || null,
      status: form.status as typeof statuses[number][0],
      nextAction: form.nextAction || null,
      followUpAt: form.followUpAt || null,
    });
  }

  if (isLoading) {
    return <div className="mx-auto max-w-6xl space-y-5"><div className="h-12 w-48 animate-pulse rounded bg-muted" /><div className="h-96 animate-pulse rounded-[1.5rem] border bg-card" /></div>;
  }

  if (!job) {
    return <div className="mx-auto max-w-2xl rounded-2xl border bg-card p-8"><h1 className="editorial-title text-4xl">Application unavailable</h1><p className="mt-3 text-muted-foreground">This workspace cannot be found in your personal pipeline.</p><Button asChild className="mt-6"><Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />Back to applications</Link></Button></div>;
  }

  const fileStem = `${form.company}-${form.role}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const resumeHasUnsavedEdits = form.tailoredResume !== (job.tailoredResume ?? "");
  const resumeFits = !form.tailoredResume.trim() || resumeFitsOnePage(form.tailoredResume);
  const resumeApproved = Boolean(resumeApprovedAt) && !resumeHasUnsavedEdits;
  const gmailComposeUrl = buildGmailComposeUrl({
    to: form.contactEmail,
    subject: `Application for ${form.role} at ${form.company}`,
    body: form.emailDraft,
  });
  const hasRecipient = Boolean(form.contactEmail.trim());
  const gmailGuidance = gmailComposeGuidance(form.contactEmail);
  const selectedProvider = providerStatus?.providers.find(provider => provider.id === draftProvider);
  const selectedProviderConfigured = providerStatus ? Boolean(selectedProvider?.configured) : true;

  function changeDraftProvider(provider: DraftProvider) {
    setDraftProvider(provider);
    window.localStorage.setItem(draftProviderStorageKey, provider);
  }

  return (
    <form onSubmit={submit} className="studio-page mx-auto max-w-7xl space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <Button asChild variant="ghost" className="w-fit px-0 text-muted-foreground hover:bg-transparent hover:text-foreground">
          <Link href="/"><ArrowLeft className="mr-2 h-4 w-4" />All applications</Link>
        </Button>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-52 space-y-1">
            <Label htmlFor="draft-provider" className="text-xs text-muted-foreground">AI provider</Label>
            <select id="draft-provider" className="h-10 w-full rounded-md border bg-card px-3 text-sm" value={draftProvider} onChange={event => changeDraftProvider(event.target.value as DraftProvider)}>
              <option value="gemini">Gemini{providerStatus && !providerStatus.providers.find(provider => provider.id === "gemini")?.configured ? " — needs Vercel key" : ""}</option>
              <option value="groq">Groq{providerStatus && !providerStatus.providers.find(provider => provider.id === "groq")?.configured ? " — needs Vercel key" : ""}</option>
            </select>
            {providerStatus && !selectedProviderConfigured && <p className="text-[11px] leading-4 text-amber-700 dark:text-amber-300">Add {selectedProvider?.environmentKey} in Vercel, redeploy, then generate.</p>}
          </div>
          <Button type="button" variant="outline" className="bg-card" onClick={() => generate.mutate({ id: jobId, provider: draftProvider })} disabled={generate.isPending || !selectedProviderConfigured} title={!selectedProviderConfigured ? `Add ${selectedProvider?.environmentKey ?? "the provider key"} in Vercel Environment Variables, redeploy, then try again.` : undefined}>
            <Sparkles className="mr-2 h-4 w-4" />{generate.isPending ? "Creating drafts…" : form.contextMode === "limited" ? "Generate role-based resume & outreach" : "Refresh tailored drafts"}
          </Button>
          <Button type="submit" disabled={save.isPending}>{save.isPending ? "Saving…" : "Save changes"}</Button>
        </div>
      </div>

      <section className="studio-hero overflow-hidden p-6 sm:p-8">
        <div className="relative z-10">
          <p className="data-label text-primary">Application workspace</p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <div className="space-y-2"><Label htmlFor="company">Company</Label><Input id="company" value={form.company} onChange={event => setForm({ ...form, company: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="role">Role</Label><Input id="role" value={form.role} onChange={event => setForm({ ...form, role: event.target.value })} /></div>
            <div className="space-y-2"><Label htmlFor="status">Status</Label><select id="status" className="h-10 min-w-32 rounded-md border bg-background px-3 text-sm" value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{statuses.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </div>
        </div>
        <div className="studio-hero-orb" />
      </section>

      <div className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
        <div className="space-y-6">
          <section className="studio-panel p-5">
            <div className="flex items-center gap-2"><CalendarClock className="h-4 w-4 text-primary" /><p className="data-label text-primary">Action tracker</p></div>
            <h2 className="editorial-title mt-2 text-3xl">Keep the next move clear</h2>
            <div className="mt-5 space-y-4">
              <div className="space-y-2"><Label htmlFor="next-action">Next action</Label><Input id="next-action" value={form.nextAction} onChange={event => setForm({ ...form, nextAction: event.target.value })} placeholder="Send a follow-up, prepare for a screen, or review the role…" /></div>
              <div className="space-y-2"><Label htmlFor="workspace-follow-up">Follow-up date</Label><Input id="workspace-follow-up" type="date" value={form.followUpAt} onChange={event => setForm({ ...form, followUpAt: event.target.value })} /></div>
            </div>
          </section>

          <section className="studio-panel p-5">
            {form.contextMode === "limited" ? (
              <>
                <p className="data-label text-primary">No JD Mode</p><h2 className="editorial-title mt-2 text-3xl">Role-based resume + outreach</h2>
                <p className="mt-3 text-sm leading-6 text-muted-foreground">No job description was supplied. Generate a one-page role-based resume using the role title to prioritize only relevant, supported facts from your master profile, alongside a factual email that asks for the detailed role information.</p>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">This is not JD-tailored: the studio will not invent duties, skills, or employer requirements from the title alone.</p>
                <div className="mt-5 space-y-2"><Label htmlFor="workspace-contact">Contact email</Label><Input id="workspace-contact" type="email" value={form.contactEmail} onChange={event => setForm({ ...form, contactEmail: event.target.value })} /></div>
              </>
            ) : (
              <>
                <p className="data-label text-primary">Job description</p>
                {form.sourceUrl && <p className="mt-2 break-all text-xs leading-5 text-muted-foreground">Imported from: {form.sourceUrl}</p>}
                <div className="mt-4 space-y-2">
                  <Label htmlFor="workspace-contact">Company or hiring email</Label>
                  <Input id="workspace-contact" type="email" value={form.contactEmail} onChange={event => setForm({ ...form, contactEmail: event.target.value })} placeholder="hiring@company.com" />
                  <p className="text-xs leading-5 text-muted-foreground">Used to prefill the recipient when you open the personalized draft in Gmail.</p>
                </div>
                <Textarea value={form.jobDescription} onChange={event => setForm({ ...form, jobDescription: event.target.value })} className="mt-4 min-h-[300px] leading-6" />
              </>
            )}
          </section>

          <section className="studio-panel p-5"><p className="data-label text-primary">Private notes</p><Textarea value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} placeholder="Interview context, follow-up reminders, or anything useful for this application…" className="mt-4 min-h-44 leading-6" /></section>
        </div>

        <div className="space-y-6">
          <section className="studio-panel p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div><p className="data-label text-primary">{form.contextMode === "limited" ? "Role-based resume" : "Tailored resume"}</p><h2 className="editorial-title mt-1 text-3xl">A factual, one-page draft</h2><p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{form.contextMode === "limited" ? "With no job description, the studio uses your role title only to prioritize and rephrase supported master-profile facts. It never assumes the employer’s requirements." : "The studio uses AI only to select, reorder, and rephrase facts from your master profile for this job. It follows the compact reference format and never adds unsupported claims."}</p></div>
              <ExportActions content={form.tailoredResume} kind="resume" fileStem={fileStem} company={form.company} role={form.role} contactLinks={profile?.contactLinks} requiresApproval approved={resumeApproved} />
            </div>
            <div className="mt-5 rounded-xl border border-primary/15 bg-accent/30 p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex gap-3"><Eye className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div><p className="text-sm font-semibold">Preview before export</p><p className="mt-1 text-xs leading-5 text-muted-foreground">This compact preview mirrors the one-page DOCX/PDF format. Saving edits or refreshing the draft returns it to review.</p></div></div>
                <div className="shrink-0">{resumeApproved ? <Button type="button" size="sm" variant="outline" className="bg-card" disabled={setApproval.isPending} onClick={() => setApproval.mutate({ id: jobId, approved: false })}><RotateCcw className="mr-1.5 h-3.5 w-3.5" />Return to review</Button> : <Button type="button" size="sm" disabled={!form.tailoredResume.trim() || !resumeFits || resumeHasUnsavedEdits || setApproval.isPending} onClick={() => setApproval.mutate({ id: jobId, approved: true })}><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{resumeHasUnsavedEdits ? "Save edits to approve" : !resumeFits ? "Shorten to one page" : "Approve resume"}</Button>}</div>
              </div>
              <div className="mt-4"><ResumePreview content={form.tailoredResume} contactLinks={profile?.contactLinks} emptyMessage={form.contextMode === "limited" ? "Generate a role-based resume to review it here before any export is enabled." : undefined} /></div>
              {resumeApproved ? <p className="mt-3 text-xs font-medium text-emerald-700 dark:text-emerald-300">Approved {resumeApprovedAt ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(new Date(resumeApprovedAt)) : ""}. Export controls are enabled.</p> : <p className={`mt-3 text-xs ${!resumeFits && form.tailoredResume.trim() ? "font-medium text-amber-700 dark:text-amber-300" : "text-muted-foreground"}`}>{resumeHasUnsavedEdits ? "Save the edited resume, preview it again, then approve the saved version." : !resumeFits && form.tailoredResume.trim() ? "This draft is too long for the fixed one-page format. Remove or tighten a few bullets, save it, and preview again." : "Approve this reviewed version to enable copy, DOCX, and PDF exports."}</p>}
            </div>
            <div className="mt-4 rounded-lg border border-border/70 bg-background/40 p-3">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                <div><p className="text-sm font-medium">Edit source draft</p><p className="text-xs text-muted-foreground">The preview above is the clean resume. Open the source only to make deliberate content edits.</p></div>
                <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => setShowResumeEditor(open => !open)}>{showResumeEditor ? "Hide editor" : "Edit resume"}</Button>
              </div>
              {showResumeEditor && <Textarea value={form.tailoredResume} onChange={event => setForm({ ...form, tailoredResume: event.target.value })} placeholder="Generate a tailored resume after saving your master profile…" className="mt-3 min-h-[350px] font-mono text-[13px] leading-6" />}
            </div>
          </section>

          <section className="studio-panel p-5">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
              <div>
                <p className="data-label text-primary">Personalized email</p>
                <h2 className="editorial-title mt-1 text-3xl">Grounded and ready to refine</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">Open Gmail with an editable subject and personalized draft filled in. {gmailGuidance} The studio never sends email for you.</p>
              </div>
              <div className="flex flex-wrap items-start gap-2">
                <GmailComposeAction
                  composeUrl={gmailComposeUrl}
                  recipient={form.contactEmail}
                  onComposeOpen={recipientKnown => toast.success(recipientKnown ? "Gmail compose opened in a new tab. Review and send it manually when ready." : "Gmail compose opened. Add the recipient there, then review and send it manually.")}
                />
                <GmailDraftAttachmentAction jobId={jobId} eligible={resumeApproved && hasRecipient && Boolean(form.emailDraft.trim())} saveRequired={resumeHasUnsavedEdits || form.contactEmail !== (job.contactEmail ?? "") || form.emailDraft !== (job.emailDraft ?? "")} />
                <ExportActions content={form.emailDraft} kind="cover-letter" fileStem={fileStem} company={form.company} role={form.role} contactLinks={profile?.contactLinks} />
              </div>
            </div>
            <Textarea value={form.emailDraft} onChange={event => setForm({ ...form, emailDraft: event.target.value })} placeholder="Generate a personalized draft grounded in your profile and this job description…" className="mt-5 min-h-64 leading-6" />
            <p className="mt-3 text-xs text-muted-foreground">Gmail opens in a separate tab with the subject and draft prepared. When portable Gmail is connected, <strong>Draft with resume</strong> creates an unsent Gmail draft with the approved DOCX attached. {hasRecipient ? "Review everything there and press Send yourself." : "Add the recipient in Gmail, then review everything and press Send yourself."}</p>
          </section>
        </div>
      </div>
    </form>
  );
}
