export type QuestionType = "single" | "multiple" | "boolean";
export interface QuizQuestion {
  id: string;
  prompt: string;
  type: QuestionType;
  points: number;
  skillIds: string[];
  options: { id: string; text: string }[];
  correctOptionIds: string[];
}
export interface Quiz {
  title: string;
  instructions: string;
  passingPercentage: number;
  timeLimitMinutes: number | null;
  questions: QuizQuestion[];
}
export type PublicQuiz = Omit<Quiz, "questions"> & {
  questions: Omit<QuizQuestion, "correctOptionIds" | "skillIds">[];
};
export interface OpeningSummary {
  id: string;
  version: number;
  openedAt: string;
  opensAt: string;
  closesAt: string;
  closedAt: string | null;
  status: "open" | "scheduled" | "closed";
}
export interface AdminAssessment {
  categoryId: string;
  category: string;
  assessmentId: string | null;
  version: number | null;
  quiz: Quiz | null;
  openings: OpeningSummary[];
}
export interface AttemptResult {
  status: "started" | "submitted" | "expired";
  score: number | null;
  total: number | null;
  percentage: number | null;
  passed: boolean | null;
  submittedAt: string | null;
  deadlineAt?: string;
  startedAt?: string;
}
export interface MemberAssessment extends OpeningSummary {
  category: string;
  title: string;
  instructions: string;
  questionCount: number;
  passingPercentage: number;
  timeLimitMinutes: number | null;
  attempt: AttemptResult | null;
}
export interface AttemptResponse extends Partial<AttemptResult> {
  status: AttemptResult["status"];
  quiz?: PublicQuiz;
  answers?: Record<string, string[]>;
  serverNow?: string;
}
export interface AssessmentEvidence {
  category_id: string;
  category: string;
  version: number;
  percentage: number;
  passed: true;
  completed_at: string;
}
export interface ResultRow {
  userId: string;
  name: string;
  status: "not_started" | "started" | "expired" | "submitted";
  startedAt: string | null;
  submittedAt: string | null;
  percentage: number | null;
  passed: boolean | null;
}
export interface OpeningResults {
  openingId: string;
  category: string;
  openedAt: string;
  closesAt: string;
  closedAt: string | null;
  rows: ResultRow[];
}
