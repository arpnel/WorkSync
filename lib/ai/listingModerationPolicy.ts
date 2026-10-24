export const LISTING_MODERATION_POLICY = {
  minimumTitleLength: 5,
  minimumDescriptionLength: 30,
  maximumDescriptionLength: 12_000,
  duplicateWindowDays: 30,
  repeatedLineThreshold: 4,
  suspiciousLinkThreshold: 3,
  automaticRejectionConfidence: 0.95,
} as const;

// Keep this as a review signal, not an automatic rejection list. Matching is
// whole-token after normalization so ordinary words containing a short term
// (for example, "class") are not flagged.
const profanityTokens = new Set([
  "asshole",
  "bastard",
  "bitch",
  "bullshit",
  "cunt",
  "fuck",
  "fucker",
  "fucking",
  "motherfucker",
  "shit",
  "shitty",
  "gago",
  "gaga",
  "putangina",
  "puta",
  "tangina",
  "tarantado",
  "ulol",
]);

function containsProfanity(value: string) {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[0]/g, "o")
    .replace(/[1!|]/g, "i")
    .replace(/[3]/g, "e")
    .replace(/[@4]/g, "a")
    .replace(/[5$]/g, "s")
    .replace(/[7]/g, "t");
  const tokens = normalized
    .split(/\s+/)
    .map((token) => token.replace(/[^a-z]/g, ""))
    .filter(Boolean);

  return tokens.some((token) => profanityTokens.has(token)) ||
    /putang\s*ina/.test(normalized.replace(/[^a-z]/g, ""));
}

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
  if (containsProfanity(`${cleanTitle}\n${cleanDescription}`)) issues.push("Remove profanity or vulgar insults. Listings containing profanity are held for administrator review.");
  return issues;
}
