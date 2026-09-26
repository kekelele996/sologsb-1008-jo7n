export type ReviewStatus = "draft" | "pending" | "confirmed" | "changes";

// 项目级词库
export type TermChangeAction =
  | "create"
  | "target"
  | "required"
  | "delete"
  | "publish";

export interface ProjectTerm {
  id: string;
  source: string;
  target: string;
  language: string;
  required: boolean;
  createdAt: string;
  updatedAt: string;
  /** 最近一次随词库版本发布的固定译法，未发布过为空 */
  publishedTarget?: string;
  publishedRequired?: boolean;
}

export interface TermAdjustmentRecord {
  id: string;
  termId: string;
  source: string;
  language: string;
  action: TermChangeAction;
  oldValue?: string;
  newValue?: string;
  note: string;
  createdAt: string;
  /** 写入该记录时所在的词库版本（草稿编辑为 0） */
  version: number;
}

export interface GlossaryVersion {
  version: number;
  label: string;
  note: string;
  publishedAt: string;
  termCount: number;
  requiredCount: number;
}

export interface ProjectGlossary {
  terms: ProjectTerm[];
  /** 最新发布版本号，从 1 开始 */
  currentVersion: number;
  versions: GlossaryVersion[];
  history: TermAdjustmentRecord[];
  /** 存在尚未发布的调整 */
  dirty: boolean;
}

// 词库新译法与已确认标识旧译法的待复核
export type TermReviewStatus = "pending" | "adopted" | "dismissed";

export interface TermReviewItem {
  id: string;
  termId: string;
  signId: string;
  source: string;
  language: string;
  oldTarget: string;
  newTarget: string;
  required: boolean;
  /** 触发待复核的词库版本 */
  fromVersion: number;
  status: TermReviewStatus;
  createdAt: string;
  resolvedAt?: string;
  resolutionNote?: string;
}

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
  termReviews: TermReviewItem[];
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
