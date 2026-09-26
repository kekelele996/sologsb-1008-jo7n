import type {
  GlossaryVersion,
  ProjectGlossary,
  ProjectTerm,
  ReviewStatus,
  SignItem,
  SignProject,
  TermAdjustmentRecord,
  TermBinding,
  TermReviewItem,
} from "./types";

export const uid = (prefix: string) =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  draft: "草稿",
  pending: "待确认",
  confirmed: "已确认",
  changes: "需修改",
};

const term = (source: string, target: string, confirmed = false, required = true): TermBinding => ({
  id: uid("term"),
  source,
  target,
  required,
  confirmed,
});

/** 项目词库条目：publishedTarget/publishedRequired 记录最近发布版本的固定译法 */
const glossaryTerm = (
  id: string,
  source: string,
  target: string,
  language: string,
  required = true,
): ProjectTerm => {
  return {
    id,
    source,
    target,
    language,
    required,
    createdAt: "2026-09-15T03:00:00.000Z",
    updatedAt: "2026-09-15T03:00:00.000Z",
    publishedTarget: target,
    publishedRequired: required,
  };
};

const glossaryHistory = (records: Array<Omit<TermAdjustmentRecord, "id" | "createdAt"> & { createdAt?: string }>): TermAdjustmentRecord[] =>
  records.map((record, index) => ({
    id: `gh-rec-${index + 1}`,
    createdAt: record.createdAt ?? "2026-09-15T03:00:00.000Z",
    ...record,
  }));

export const createSeedGlossary = (): { glossary: ProjectGlossary; reviews: TermReviewItem[] } => {
  const terms: ProjectTerm[] = [
    // v2 已发布、将“电梯”改为 lift；已确认标识 EM-02 尚未采用，挂着待复核
    {
      id: "gterm-elevator",
      source: "电梯",
      target: "lift",
      language: "English",
      required: true,
      createdAt: "2026-09-15T03:00:00.000Z",
      updatedAt: "2026-09-20T08:00:00.000Z",
      publishedTarget: "lift",
      publishedRequired: true,
    },
    glossaryTerm("gterm-emergency-exit", "紧急出口", "EMERGENCY EXIT", "English"),
    glossaryTerm("gterm-waiting", "候车区", "Waiting Area", "English"),
    // 尚未发布的草稿调整，发布时仅影响待确认标识，不产生待复核
    {
      id: "gterm-yellow-line",
      source: "黄线",
      target: "yellow safety line",
      language: "English",
      required: true,
      createdAt: "2026-09-15T03:00:00.000Z",
      updatedAt: "2026-09-25T01:30:00.000Z",
      publishedTarget: "yellow line",
      publishedRequired: true,
    },
    glossaryTerm("gterm-drinking", "直饮水", "飲料水", "日本語"),
    {
      id: "gterm-sink",
      source: "水槽",
      target: "排水口",
      language: "日本語",
      required: false,
      createdAt: "2026-09-15T03:00:00.000Z",
      updatedAt: "2026-09-15T03:00:00.000Z",
      publishedTarget: "排水口",
      publishedRequired: false,
    },
    glossaryTerm("gterm-smoking", "禁止吸烟", "INTERDICTION DE FUMER", "Français"),
  ];

  const versions: GlossaryVersion[] = [
    {
      version: 2,
      label: "词库 v2",
      note: "按译写规范将“电梯”统一为英式固定译法 lift。",
      publishedAt: "2026-09-20T08:00:00.000Z",
      termCount: 7,
      requiredCount: 6,
    },
    {
      version: 1,
      label: "词库 v1",
      note: "初版项目术语，按语种录入固定译法与必选标记。",
      publishedAt: "2026-09-15T03:00:00.000Z",
      termCount: 7,
      requiredCount: 6,
    },
  ];

  const history: TermAdjustmentRecord[] = glossaryHistory([
    {
      termId: "gterm-elevator",
      source: "电梯",
      language: "English",
      action: "publish",
      note: "发布词库 v2，收录 7 条术语。",
      version: 2,
      createdAt: "2026-09-20T08:00:00.000Z",
    },
    {
      termId: "gterm-elevator",
      source: "电梯",
      language: "English",
      action: "target",
      oldValue: "elevator",
      newValue: "lift",
      note: "固定译法调整：elevator → lift（随 v2 发布）。",
      version: 2,
      createdAt: "2026-09-20T08:00:00.000Z",
    },
    {
      termId: "gterm-yellow-line",
      source: "黄线",
      language: "English",
      action: "target",
      oldValue: "yellow line",
      newValue: "yellow safety line",
      note: "草稿调整：等待发布词库 v3。",
      version: 0,
      createdAt: "2026-09-25T01:30:00.000Z",
    },
    {
      termId: "gterm-sink",
      source: "水槽",
      language: "日本語",
      action: "create",
      newValue: "排水口",
      note: "新增可选术语（非必选标记）。",
      version: 1,
      createdAt: "2026-09-15T03:00:00.000Z",
    },
    {
      termId: "gterm-elevator",
      source: "电梯",
      language: "English",
      action: "publish",
      note: "发布词库 v1，收录 7 条术语。",
      version: 1,
      createdAt: "2026-09-15T03:00:00.000Z",
    },
  ]);

  const reviews: TermReviewItem[] = [
    {
      id: "review-elevator-exit",
      termId: "gterm-elevator",
      signId: "sign-exit",
      source: "电梯",
      language: "English",
      oldTarget: "elevator",
      newTarget: "lift",
      required: true,
      fromVersion: 2,
      status: "pending",
      createdAt: "2026-09-20T08:00:00.000Z",
    },
  ];

  return {
    glossary: { terms, currentVersion: 2, versions, history, dirty: true },
    reviews,
  };
};

export const createSeedProject = (): SignProject => {
  const { glossary, reviews } = createSeedGlossary();
  const signs: SignItem[] = [
    {
      id: "sign-platform",
      code: "TR-01",
      sourceText: "候车区。请在黄线内排队，照看好随身物品。",
      targetLanguage: "English",
      targetText: "Waiting Area\nPlease queue behind the yellow line and keep your belongings with you.",
      scenario: "轨道交通站台",
      regulation: "GB/T 10001.1-2023 公共信息图形符号",
      status: "pending",
      terms: [term("候车区", "Waiting Area"), term("黄线", "yellow line")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      updatedAt: "2026-09-21T09:20:00.000Z",
    },
    {
      id: "sign-exit",
      code: "EM-02",
      sourceText: "紧急出口。发生紧急情况时，请按指示方向迅速撤离，不要乘坐电梯。",
      targetLanguage: "English",
      targetText: "EMERGENCY EXIT\nIn an emergency, leave quickly in the direction shown. Do not use the elevator.",
      scenario: "商场疏散通道",
      regulation: "GB 13495.1-2015 消防安全标志",
      status: "confirmed",
      terms: [term("紧急出口", "EMERGENCY EXIT", true), term("电梯", "elevator", true)],
      comments: [],
      versions: [],
      emergencyRevision: false,
      updatedAt: "2026-09-18T06:10:00.000Z",
    },
    {
      id: "sign-water",
      code: "SV-03",
      sourceText: "直饮水。请勿将茶叶、果皮等杂物丢入水槽。",
      targetLanguage: "日本語",
      targetText: "飲料水\n茶殻や果物の皮などを流さないでください。",
      scenario: "公园服务亭",
      regulation: "城市公共设施双语标识译写规范",
      status: "changes",
      terms: [term("直饮水", "飲料水"), term("水槽", "排水口")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      updatedAt: "2026-09-23T02:40:00.000Z",
    },
    {
      id: "sign-smoking",
      code: "PR-07",
      sourceText: "禁止吸烟。包括电子烟。",
      targetLanguage: "Français",
      targetText: "INTERDICTION DE FUMER\nCigarettes électroniques incluses.",
      scenario: "医院入口",
      regulation: "公共场所卫生管理条例实施细则",
      status: "draft",
      terms: [term("禁止吸烟", "INTERDICTION DE FUMER"), term("电子烟", "Cigarettes électroniques")],
      comments: [],
      versions: [],
      emergencyRevision: false,
      updatedAt: "2026-09-24T04:15:00.000Z",
    },
  ];

  return {
    id: "public-sign-review-1008",
    title: "城市公共标识多语言校对",
    location: "滨海交通枢纽一期",
    activeSignId: signs[0].id,
    signs,
    glossary,
    termReviews: reviews,
    updatedAt: new Date().toISOString(),
  };
};
