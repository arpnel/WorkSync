export const LISTING_MODERATION_POLICY = {
  minimumTitleLength: 5,
  minimumDescriptionLength: 30,
  maximumDescriptionLength: 12_000,
  duplicateWindowDays: 30,
  repeatedLineThreshold: 4,
  suspiciousLinkThreshold: 3,
  automaticRejectionConfidence: 0.95,
} as const;

export function validateListingRules(title: string, description: string): string[] {
  const issues: string[] = [];
  const cleanTitle = title.trim();
  const cleanDescription = description.trim();
  if (cleanTitle.length < LISTING_MODERATION_POLICY.minimumTitleLength) issues.push("Add a more descriptive listing title.");
  if (cleanDescription.length < LISTING_MODERATION_POLICY.minimumDescriptionLength) issues.push("Add at least 30 characters describing the work or service.");
  if (cleanDescription.length > LISTING_MODERATION_POLICY.maximumDescriptionLength) issues.push("Shorten the description before resubmitting.");
  const lines = cleanDescription.toLowerCase().split(/\r?\n/).map((line) => line.replace(/[^\p{L}\p{N}]+/gu, " ").trim()).filter((line) => line.length > 10);
  if (lines.some((line) => lines.filter((candidate) => candidate === line).length >= LISTING_MODERATION_POLICY.repeatedLineThreshold)) issues.push("Remove repeated lines or keyword stuffing from the description.");
  const links = cleanDescription.match(/https?:\/\/|www\./gi)?.length ?? 0;
  if (links >= LISTING_MODERATION_POLICY.suspiciousLinkThreshold) issues.push("Remove excessive external links and explain any necessary reference links.");
  if (/\b(pay|message|contact|deal)\s+(me\s+)?(off[- ]platform|outside\s+(worksync|the platform))\b/i.test(cleanDescription)) issues.push("Keep project communication and payment arrangements within WorkSync.");
  return issues;
}
