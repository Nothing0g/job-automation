type DraftJobContext = { company: string; role: string; contextMode: "full" | "limited" };

function words(value: string | null | undefined) {
  return value?.match(/[A-Za-z0-9][A-Za-z0-9'-]*/g)?.length ?? 0;
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function sectionBody(resume: string, expression: RegExp) {
  const headings = /^##\s+(.+)$/gim;
  let heading: RegExpExecArray | null;
  while ((heading = headings.exec(resume)) !== null) {
    if (!expression.test(heading[1])) continue;
    const following = resume.slice(heading.index + heading[0].length);
    const nextSection = following.search(/^##\s+/m);
    return (nextSection >= 0 ? following.slice(0, nextSection) : following).trim();
  }
  return "";
}

/** Returns a public-safe reason when a substantial supplied resume was reduced to an unusable draft. */
export function resumeDraftQualityIssue(draft: string, masterResume: string | null | undefined) {
  const source = masterResume?.trim() ?? "";
  const sourceWords = words(source);
  if (sourceWords < 50) return null;

  const minimumDraftWords = Math.max(60, Math.min(300, Math.floor(sourceWords * 0.22)));
  if (words(draft) < minimumDraftWords) {
    return "it was too short for the supplied master resume";
  }

  const requirements: Array<{ source: RegExp; output: RegExp; label: string }> = [
    { source: /\b(?:education|b\.?tech|bachelor|university|college)\b/i, output: /\beducation\b/i, label: "education" },
    { source: /\b(?:experience|internship|employment|work history|work experience)\b/i, output: /\b(?:experience|internship)\b/i, label: "experience" },
    { source: /\bprojects?\b/i, output: /\bprojects?\b/i, label: "projects" },
    { source: /\b(?:skills|technical skills|tools)\b/i, output: /\b(?:skills|tools)\b/i, label: "skills" },
  ];

  for (const requirement of requirements) {
    if (requirement.source.test(source) && words(sectionBody(draft, requirement.output)) < 8) {
      return `it omitted the supported ${requirement.label} section`;
    }
  }
  return null;
}

/** Ensures outreach is long enough to be personal and visibly anchored in the supplied profile. */
export function outreachDraftQualityIssue(
  draft: string,
  masterResume: string | null | undefined,
  personalBio: string | null | undefined,
  job: DraftJobContext,
) {
  const source = `${masterResume ?? ""}\n${personalBio ?? ""}`;
  if (words(source) < 50) return null;

  const minimumWords = job.contextMode === "limited" ? 105 : 130;
  if (words(draft) < minimumWords) return "it was shorter than the requested personalized outreach length";

  const lowerDraft = normalized(draft);
  if (!lowerDraft.includes(normalized(job.company)) || !lowerDraft.includes(normalized(job.role))) {
    return "it did not identify the saved company and role";
  }
  if (!/^(?:hello|hi|dear)\b/im.test(draft.trim())) return "it did not include a natural greeting";

  const candidateTerms = Array.from(new Set(
    (source.match(/\b[A-Za-z][A-Za-z0-9+-]{5,}\b/g) ?? [])
      .map(term => term.toLowerCase())
      .filter(term => !["experience", "professional", "education", "project", "projects", "candidate", "resume", "summary", "analysis", "analyst", "skills"].includes(term)),
  ));
  if (candidateTerms.length > 0 && !candidateTerms.some(term => lowerDraft.includes(term))) {
    return "it did not reference a distinctive fact from the saved Master Profile";
  }
  return null;
}
