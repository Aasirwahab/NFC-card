type CaptureDraft = {
  name: string;
  company: string;
  website: string;
  email: string;
  phone: string;
  linkedin: string;
  niche: string;
  problems: string[];
  customProblems: string;
  line: string;
};

/** Only these fields may be kept on the phone; never the private note. */
export function serializeCaptureDraft(draft: CaptureDraft): string {
  return JSON.stringify({
    savedAt: Date.now(),
    name: draft.name,
    company: draft.company,
    website: draft.website,
    email: draft.email,
    phone: draft.phone,
    linkedin: draft.linkedin,
    niche: draft.niche,
    problems: draft.problems,
    customProblems: draft.customProblems,
    line: draft.line,
  });
}
