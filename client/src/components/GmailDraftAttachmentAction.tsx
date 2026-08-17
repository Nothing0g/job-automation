import { Button } from "@/components/ui/button";
import { FilePlus2, Link2, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { usePortableStatus } from "./PortableOwnerAccess";

export function GmailDraftAttachmentAction({ jobId, eligible, saveRequired }: { jobId: string | number; eligible: boolean; saveRequired: boolean }) {
  const { status } = usePortableStatus();
  const [isCreating, setIsCreating] = useState(false);
  if (!status?.enabled || !status.signedIn) return null;
  if (!status.gmailConnected) return <Button type="button" variant="outline" size="sm" className="bg-card" asChild><a href="/api/portable/gmail/connect"><Link2 className="mr-1.5 h-3.5 w-3.5" />Connect Gmail for attachment</a></Button>;
  const createDraft = async () => {
    setIsCreating(true);
    try {
      const response = await fetch(`/api/portable/gmail/drafts/${jobId}`, { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" } });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Gmail draft could not be created.");
      toast.success("Gmail draft saved with the approved DOCX resume attached. It was not sent.");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Gmail draft could not be created."); } finally { setIsCreating(false); }
  };
  return <Button type="button" size="sm" variant="outline" className="bg-card" onClick={() => void createDraft()} disabled={!eligible || saveRequired || isCreating} title={saveRequired ? "Save changes before creating the attachment draft." : !eligible ? "An approved resume and stored recipient are required." : "Create an unsent Gmail draft with the approved DOCX attached."}>{isCreating ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />}{isCreating ? "Saving draft…" : "Draft with resume"}</Button>;
}
