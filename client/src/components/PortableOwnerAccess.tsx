import { Button } from "@/components/ui/button";
import { LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";

type PortableStatus = { enabled: boolean; signedIn: boolean; gmailConnected: boolean };

export function usePortableStatus() {
  const [status, setStatus] = useState<PortableStatus | null>(null);
  const refresh = () => fetch("/api/portable/auth/status", { credentials: "same-origin" }).then(async response => {
    if (!response.ok) throw new Error("Could not confirm private access status.");
    return response.json() as Promise<PortableStatus>;
  }).then(setStatus).catch(() => setStatus({ enabled: false, signedIn: true, gmailConnected: false }));
  useEffect(() => { void refresh(); }, []);
  return { status, refresh };
}

export function PortableOwnerAccess({ children }: { children: React.ReactNode }) {
  const { status } = usePortableStatus();
  if (status?.enabled && !status.signedIn) {
    return <main className="min-h-screen bg-background px-5 py-16 text-foreground"><section className="mx-auto max-w-lg rounded-[1.75rem] border border-primary/15 bg-card p-8 shadow-sm sm:p-10"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><LockKeyhole className="h-5 w-5" /></div><p className="data-label mt-6 text-primary">Private personal workspace</p><h1 className="editorial-title mt-2 text-4xl">Sign in to continue</h1><p className="mt-4 text-sm leading-6 text-muted-foreground">This workspace accepts only its configured owner Google account. Your Google passkey or authenticator protects the sign-in; the application never sees that credential.</p><Button asChild className="mt-7 w-full"><a href="/api/portable/auth/google"><ShieldCheck className="mr-2 h-4 w-4" />Continue with Google</a></Button></section></main>;
  }
  return <>{children}</>;
}
