import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Packer, Paragraph, TextRun } from "docx";

export type ResumeContactLinks = { email?: string; phone?: string; linkedin?: string; github?: string; portfolio?: string };

type Block = { kind: "name" | "section" | "subhead" | "bullet" | "text"; text: string };

function clean(line: string) {
  return line.replace(/^```(?:markdown|md|text)?\s*/i, "").replace(/\s*```$/i, "").replace(/\*\*(.*?)\*\*/g, "$1").trim();
}

function blocks(content: string): Block[] {
  return content.split(/\r?\n/).map(clean).filter(Boolean).filter(line => !/^(?:---|___|\*\*\*)$/.test(line)).map((line, index) => {
    if (line.startsWith("# ")) return { kind: "name" as const, text: line.slice(2).trim() };
    if (line.startsWith("## ")) return { kind: "section" as const, text: line.slice(3).trim() };
    if (line.startsWith("### ")) return { kind: "subhead" as const, text: line.slice(4).trim() };
    if (/^(?:[-*•])\s+/.test(line)) return { kind: "bullet" as const, text: line.replace(/^(?:[-*•])\s+/, "") };
    return { kind: index === 0 ? "name" as const : "text" as const, text: line };
  });
}

function contacts(input?: ResumeContactLinks) {
  return [
    input?.email ? { label: "Email", href: `mailto:${input.email}` } : null,
    input?.phone ? { label: "Mobile", href: `tel:${input.phone.replace(/[\s()-]/g, "")}` } : null,
    input?.linkedin ? { label: "LinkedIn", href: input.linkedin } : null,
    input?.github ? { label: "GitHub", href: input.github } : null,
    input?.portfolio ? { label: "Portfolio", href: input.portfolio } : null,
  ].filter((value): value is { label: string; href: string } => Boolean(value));
}

export async function createApprovedResumeDocx(content: string, contactLinks?: ResumeContactLinks) {
  if (!content.trim()) throw new Error("An approved resume is required before creating an attachment.");
  const parsed = blocks(content);
  const name = parsed.find(block => block.kind === "name");
  const body = parsed.filter(block => block !== name);
  const links = contacts(contactLinks);
  const children: Paragraph[] = [
    ...(name ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: name.text.toUpperCase(), bold: true, font: "Times New Roman", size: 28 })], spacing: { after: links.length ? 8 : 26 } })] : []),
    ...(links.length ? [new Paragraph({ alignment: AlignmentType.CENTER, children: links.flatMap((link, index) => [
      ...(index ? [new TextRun({ text: "  ·  ", size: 17, color: "355E4E" })] : []),
      new ExternalHyperlink({ link: link.href, children: [new TextRun({ text: link.label, size: 17, color: "355E4E", underline: { type: "single", color: "355E4E" } })] }),
    ]), spacing: { after: 48 } })] : []),
    ...body.map(block => {
      if (block.kind === "section") return new Paragraph({ children: [new TextRun({ text: block.text.toUpperCase(), bold: true, font: "Times New Roman", size: 17 })], border: { bottom: { style: BorderStyle.SINGLE, size: 5, color: "000000", space: 1 } }, spacing: { before: 80, after: 24 }, keepNext: true });
      if (block.kind === "subhead") return new Paragraph({ children: [new TextRun({ text: block.text, bold: true, font: "Times New Roman", size: 17 })], spacing: { before: 28, after: 0 }, keepNext: true });
      if (block.kind === "bullet") return new Paragraph({ children: [new TextRun({ text: `• ${block.text}`, font: "Times New Roman", size: 16 })], indent: { left: 180, hanging: 120 }, spacing: { after: 0, line: 150 } });
      return new Paragraph({ children: [new TextRun({ text: block.text, font: "Times New Roman", size: 16 })], spacing: { after: 0, line: 150 }, keepLines: true });
    }),
  ];
  const document = new Document({ creator: "Job Automation Studio", title: "Approved Resume", sections: [{ properties: { page: { margin: { top: 420, right: 450, bottom: 420, left: 450 } } }, children }] });
  return Packer.toBuffer(document);
}

export function approvedResumeFilename(company: string, role: string) {
  const stem = `${company}-${role}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "application";
  return `${stem}-approved-resume.docx`;
}
