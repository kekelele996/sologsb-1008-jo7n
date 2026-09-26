export type ReviewStatus = "draft" | "pending" | "confirmed" | "changes";

export interface Reply {
  id: string;
  author: string;
  body: string;
  createdAt: string;
}

export interface ReviewComment {
  id: string;
  author: string;
  body: string;
  createdAt: string;
  resolved: boolean;
  replies: Reply[];
}

export interface TermBinding {
  id: string;
  source: string;
  target: string;
  required: boolean;
  confirmed: boolean;
}

export interface VersionSnapshot {
  id: string;
  label: string;
  createdAt: string;
  sourceText: string;
  targetText: string;
  status: ReviewStatus;
  terms: TermBinding[];
}

export type GlossaryAction = "baseline" | "create" | "update" | "required" | "delete";

export interface GlossaryTerm {
  id: string;
  source: string;
  target: string;
  language: string;
  required: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface GlossaryChange {
  id: string;
  termId: string;
  source: string;
  language: string;
  action: GlossaryAction;
  oldTarget: string;
  newTarget: string;
  oldRequired: boolean | null;
  newRequired: boolean | null;
  version: number;
  createdAt: string;
}

export type TermReviewStatus = "pending" | "adopted" | "ignored";

export interface TermReview {
  id: string;
  termId: string;
  source: string;
  language: string;
  oldTarget: string;
  newTarget: string;
  required: boolean;
  glossaryVersion: number;
  signId: string;
  status: TermReviewStatus;
  createdAt: string;
  decidedAt: string;
}

export interface ProjectGlossary {
  version: number;
  publishedAt: string;
  terms: GlossaryTerm[];
  changes: GlossaryChange[];
}

export interface SignItem {
  id: string;
  code: string;
  sourceText: string;
  targetLanguage: string;
  targetText: string;
  scenario: string;
  regulation: string;
  status: ReviewStatus;
  terms: TermBinding[];
  comments: ReviewComment[];
  versions: VersionSnapshot[];
  emergencyRevision: boolean;
  updatedAt: string;
}

export interface SignProject {
  id: string;
  title: string;
  location: string;
  activeSignId: string;
  signs: SignItem[];
  glossary: ProjectGlossary;
  termReviews: TermReview[];
  updatedAt: string;
}

export interface PersistedProject {
  schema: 2;
  project: SignProject;
}

export interface DiffToken {
  type: "same" | "add" | "remove";
  value: string;
}
