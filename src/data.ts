import type {
  GlossaryChange,
  GlossaryTerm,
  ProjectGlossary,
  ReviewStatus,
  SignItem,
  SignProject,
  TermBinding,
  TermReview,
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

const GLOSSARY_BASELINE_AT = "2026-09-10T03:00:00.000Z";
const GLOSSARY_V2_AT = "2026-09-25T08:00:00.000Z";

function gterm(
  id: string,
  source: string,
  target: string,
  language: string,
  required = true,
): GlossaryTerm {
  return { id, source, target, language, required, createdAt: GLOSSARY_BASELINE_AT, updatedAt: GLOSSARY_BASELINE_AT };
}

const seedGlossary = (): ProjectGlossary => {
  const terms: GlossaryTerm[] = [
    gterm("gterm-waiting", "候车区", "Waiting Area", "English"),
    gterm("gterm-yellow", "黄线", "yellow line", "English"),
    gterm("gterm-exit", "紧急出口", "Fire Exit", "English"),
    gterm("gterm-elevator", "电梯", "elevator", "English"),
    gterm("gterm-water", "直饮水", "飲料水", "日本語"),
    gterm("gterm-sink", "水槽", "排水口", "日本語", false),
    gterm("gterm-smoking", "禁止吸烟", "INTERDICTION DE FUMER", "Français"),
    gterm("gterm-ecig", "电子烟", "Cigarettes électroniques", "Français", false),
  ];

  const baseline = (termId: string, source: string, language: string, target: string, required: boolean): GlossaryChange => ({
    id: `gchg-base-${termId}`,
    termId,
    source,
    language,
    action: "baseline",
    oldTarget: "",
    newTarget: target,
    oldRequired: null,
    newRequired: required,
    version: 1,
    createdAt: GLOSSARY_BASELINE_AT,
  });

  const changes: GlossaryChange[] = [
    {
      id: "gchg-exit-v2",
      termId: "gterm-exit",
      source: "紧急出口",
      language: "English",
      action: "update",
      oldTarget: "EMERGENCY EXIT",
      newTarget: "Fire Exit",
      oldRequired: null,
      newRequired: null,
      version: 2,
      createdAt: GLOSSARY_V2_AT,
    },
    baseline("gterm-waiting", "候车区", "English", "Waiting Area", true),
    baseline("gterm-yellow", "黄线", "English", "yellow line", true),
    baseline("gterm-exit", "紧急出口", "English", "Fire Exit", true),
    baseline("gterm-elevator", "电梯", "English", "elevator", true),
    baseline("gterm-water", "直饮水", "日本語", "飲料水", true),
    baseline("gterm-sink", "水槽", "日本語", "排水口", false),
    baseline("gterm-smoking", "禁止吸烟", "Français", "INTERDICTION DE FUMER", true),
    baseline("gterm-ecig", "电子烟", "Français", "Cigarettes électroniques", false),
  ];

  return { version: 2, publishedAt: GLOSSARY_V2_AT, terms, changes };
};

const seedReviews = (): TermReview[] => [
  {
    id: "rev-exit-fire",
    termId: "gterm-exit",
    source: "紧急出口",
    language: "English",
    oldTarget: "EMERGENCY EXIT",
    newTarget: "Fire Exit",
    required: true,
    glossaryVersion: 2,
    signId: "sign-exit",
    status: "pending",
    createdAt: GLOSSARY_V2_AT,
    decidedAt: "",
  },
];

export const createSeedProject = (): SignProject => {
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
      terms: [term("直饮水", "飲料水"), term("水槽", "排水口", false, false)],
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
      terms: [term("禁止吸烟", "INTERDICTION DE FUMER"), term("电子烟", "Cigarettes électroniques", false, false)],
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
    glossary: seedGlossary(),
    termReviews: seedReviews(),
    updatedAt: new Date().toISOString(),
  };
};
