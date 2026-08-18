import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { portableFileUploadEnabled } from "@/lib/portableRuntime";
import { AtSign, FileText, Github, Globe2, Linkedin, Mail, Phone, Save, Upload } from "lucide-react";
import { ChangeEvent, FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";

type ContactLinks = { email: string; phone: string; linkedin: string; github: string; portfolio: string };
const emptyLinks: ContactLinks = { email: "", phone: "", linkedin: "", github: "", portfolio: "" };

async function readAsBase64(file: File) {
  const encoded = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file); });
  return encoded.split(",")[1] ?? "";
}

function ContactField({ id, label, icon: Icon, value, type = "url", placeholder, onChange }: { id: keyof ContactLinks; label: string; icon: typeof Mail; value: string; type?: "url" | "email" | "tel"; placeholder: string; onChange: (value: string) => void }) {
  return <div className="space-y-2"><Label htmlFor={id} className="flex items-center gap-2 text-xs font-medium"><Icon className="h-3.5 w-3.5 text-primary" />{label}</Label><Input id={id} type={type} value={value} placeholder={placeholder} onChange={event => onChange(event.target.value)} /></div>;
}

export default function MasterProfilePage() {
  const allowResumeFileUpload = portableFileUploadEnabled();
  const utils = trpc.useUtils();
  const { data: profile, isLoading } = trpc.profile.get.useQuery();
  const [resumeText, setResumeText] = useState("");
  const [personalBio, setPersonalBio] = useState("");
  const [emailSignature, setEmailSignature] = useState("");
  const [contactLinks, setContactLinks] = useState<ContactLinks>(emptyLinks);
  useEffect(() => {
    setResumeText(profile?.resumeText ?? "");
    setPersonalBio(profile?.personalBio ?? "");
    setEmailSignature(profile?.emailSignature ?? "");
    setContactLinks({ ...emptyLinks, ...(profile?.contactLinks ?? {}) });
  }, [profile]);
  const save = trpc.profile.save.useMutation({ onSuccess: () => { toast.success("Master profile saved."); void utils.profile.get.invalidate(); }, onError: error => toast.error(error.message) });
  const upload = trpc.profile.uploadPdf.useMutation({ onSuccess: () => { toast.success("PDF resume stored securely."); void utils.profile.get.invalidate(); }, onError: error => toast.error(error.message) });
  function submit(event: FormEvent) { event.preventDefault(); save.mutate({ resumeText, personalBio, emailSignature, contactLinks }); }
  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) { toast.error("Choose a PDF smaller than 8 MB."); return; }
    try { upload.mutate({ filename: file.name, mimeType: file.type || "application/pdf", base64: await readAsBase64(file) }); }
    catch { toast.error("The selected file could not be read."); }
    finally { event.target.value = ""; }
  }
  const hasPdf = Boolean(profile?.resumeFileKey);
  const setLink = (key: keyof ContactLinks, value: string) => setContactLinks(current => ({ ...current, [key]: value }));

  return <form onSubmit={submit} className="studio-page mx-auto max-w-6xl space-y-6">
    <section className="studio-hero overflow-hidden px-6 py-8 sm:px-9 sm:py-10"><div className="relative z-10 max-w-2xl"><p className="data-label text-primary">Candidate source of truth</p><h1 className="editorial-title mt-3 text-5xl sm:text-6xl">Master profile</h1><p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground">Every tailored document begins here. Save the factual record you want the studio to use, then let the role determine what is emphasized—not invented.</p></div><div className="studio-hero-orb" /></section>

    <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.75fr)]">
      <div className="space-y-6">
        <section className="studio-panel p-5 sm:p-7"><div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start"><div><p className="data-label text-primary">01 · Evidence</p><h2 className="editorial-title mt-2 text-3xl">The resume AI may quote</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Paste the editable version of your resume. The system selects, prioritizes, and tightens these facts for each role; it does not add qualifications.</p></div>{allowResumeFileUpload && hasPdf ? <Badge variant="secondary" className="w-fit gap-1.5 rounded-full px-3 py-1"><FileText className="h-3.5 w-3.5" />Reference PDF stored</Badge> : null}</div><Textarea value={resumeText} onChange={event => setResumeText(event.target.value)} placeholder="Paste your full, factual master resume here…" className="mt-6 min-h-[28rem] resize-y leading-6" />{allowResumeFileUpload ? <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/45 p-3"><div><p className="text-sm font-medium">Keep a reference PDF too</p><p className="mt-0.5 text-xs text-muted-foreground">PDF only · up to 8 MB · stored separately from application records</p></div><Label htmlFor="resume-file" className="sr-only">Upload PDF resume</Label><Input id="resume-file" type="file" accept="application/pdf,.pdf" className="hidden" onChange={handleFile} /><Button type="button" variant="outline" className="bg-card" onClick={() => document.getElementById("resume-file")?.click()} disabled={upload.isPending}><Upload className="mr-2 h-4 w-4" />{upload.isPending ? "Uploading…" : hasPdf ? "Replace PDF" : "Upload PDF"}</Button></div> : <div className="mt-4 rounded-xl border bg-muted/45 p-3"><p className="text-sm font-medium">Original-file storage is off in private hosted mode</p><p className="mt-0.5 text-xs leading-5 text-muted-foreground">Keep your original PDF or DOCX in your own Google Drive or local backup. Paste its factual text above; tailored DOCX/PDF exports and approved Gmail attachments are generated from that reviewed text.</p></div>}</section>
        <section className="studio-panel p-5 sm:p-7"><p className="data-label text-primary">02 · Context</p><h2 className="editorial-title mt-2 text-3xl">How you want to be understood</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">Add only helpful facts: the work you seek, your positioning, and a concise professional point of view.</p><Textarea value={personalBio} onChange={event => setPersonalBio(event.target.value)} placeholder="Example: the work you want to be known for, your preferred tone, and other factual context…" className="mt-5 min-h-52 leading-6" /></section>
      </div>

      <aside className="space-y-6">
        <section className="studio-panel p-5 sm:p-6"><p className="data-label text-primary">03 · Contact identity</p><h2 className="editorial-title mt-2 text-3xl">Links that travel</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">These are shown as clickable links in your exported cover-letter DOCX and PDF. Leave anything blank you do not want to share.</p><div className="mt-6 space-y-4"><ContactField id="email" label="Professional email" icon={Mail} type="email" value={contactLinks.email} placeholder="you@example.com" onChange={value => setLink("email", value)} /><ContactField id="phone" label="Mobile number" icon={Phone} type="tel" value={contactLinks.phone} placeholder="+91 00000 00000" onChange={value => setLink("phone", value)} /><ContactField id="linkedin" label="LinkedIn" icon={Linkedin} value={contactLinks.linkedin} placeholder="https://linkedin.com/in/…" onChange={value => setLink("linkedin", value)} /><ContactField id="github" label="GitHub" icon={Github} value={contactLinks.github} placeholder="https://github.com/…" onChange={value => setLink("github", value)} /><ContactField id="portfolio" label="Portfolio or website" icon={Globe2} value={contactLinks.portfolio} placeholder="https://your-site.com" onChange={value => setLink("portfolio", value)} /></div></section>
        <section className="studio-panel p-5 sm:p-6"><div className="flex items-center gap-2"><AtSign className="h-4 w-4 text-primary" /><p className="data-label text-primary">04 · Closing</p></div><h2 className="editorial-title mt-2 text-3xl">Signature for outreach</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">This plain-text signature is appended to new email drafts. The clickable links above are used in exported documents.</p><Textarea value={emailSignature} onChange={event => setEmailSignature(event.target.value)} placeholder={"Best,\nYour Name"} className="mt-5 min-h-40 leading-6" /></section>
      </aside>
    </div>
    <div className="sticky bottom-4 z-20 flex justify-end"><Button type="submit" size="lg" className="shadow-lg shadow-primary/20" disabled={save.isPending || isLoading}><Save className="mr-2 h-4 w-4" />{save.isPending ? "Saving profile…" : "Save master profile"}</Button></div>
  </form>;
}
