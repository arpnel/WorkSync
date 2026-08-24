export function normalizeSkills(input: string[]): string[] {
  const cleaned = input
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => s.replace(/\s+/g, " "));

  const uniq: string[] = [];
  for (const s of cleaned) {
    if (!uniq.some((x) => x.toLowerCase() === s.toLowerCase())) {
      uniq.push(s);
    }
  }

  return uniq;
}

export function parseSkillsFromText(text: string): string[] {
  return normalizeSkills(
    text
      .split(/[,\n]/g)
      .map((x) => x.trim())
      .filter(Boolean),
  );
}

export function formatSkillsForDisplay(skills: string[]): string {
  return skills.join(", ");
}
