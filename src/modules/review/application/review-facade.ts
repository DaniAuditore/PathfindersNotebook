export interface SubmitProgressCommand { progressId: string; actorId: string; submissionText?: string; creditKey?: string; evidenceIds?: string[]; }
export interface ReviewProgressCommand { clubId: string; progressId: string; attemptId: string; actorId: string; decision: "accepted" | "rejected"; reason?: string; }
export interface ReviewFacade {
  submit(command: SubmitProgressCommand): Promise<{ attemptId: string; enrollmentId: string }>;
  review(command: ReviewProgressCommand): Promise<{ enrollmentId: string }>;
  reverse(input: { clubId: string; progressId: string; attemptId: string; actorId: string; rationale: string }): Promise<{ enrollmentId: string }>;
}
