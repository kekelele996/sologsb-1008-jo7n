import { uid } from "./data";
import type {
  ProjectTerm,
  SignItem,
  SignProject,
  TermAdjustmentRecord,
  TermChangeAction,
  TermReviewItem,
} from "./types";

/** 忽略大小写判断固定译法是否出现在译文中 */
export function renderContains(text: string, value: string) {
  if (!value) return false;
  return text.toLocaleLowerCase().includes(value.toLocaleLowerCase());
}

/** 替换首次出现的旧译法（忽略大小写），保留译文其余排版 */
export function replaceFirstOccurrence(text: string, oldValue: string, newValue: string) {
  if (!oldValue) return text;
  const lower = text.toLocaleLowerCase();
  const needle = oldValue.toLocaleLowerCase();
  const index = lower.indexOf(needle);
  if (index === -1) return text;
  return text.slice(0, index) + newValue + text.slice(index + oldValue.length);
}

const HISTORY_LIMIT = 200;

/** 追加一条术语调整记录（草稿调整 version=0，发布时归并到新版本） */
export function pushTermHistory(
  project: SignProject,
  entry: {
    termId: string;
    source: string;
    language: string;
    action: TermChangeAction;
    oldValue?: string;
    newValue?: string;
    note: string;
    version?: number;
  },
): TermAdjustmentRecord {
  const record: TermAdjustmentRecord = {
    id: uid("gh"),
    createdAt: new Date().toISOString(),
    version: entry.version ?? project.glossary.currentVersion,
    ...entry,
  };
  project.glossary.history.unshift(record);
  project.glossary.history = project.glossary.history.slice(0, HISTORY_LIMIT);
  return record;
}

/** 新增项目术语（草稿，未发布） */
export function addGlossaryTerm(
  project: SignProject,
  input: { source: string; target: string; language: string; required: boolean },
): ProjectTerm | undefined {
  const source = input.source.trim();
  const target = input.target.trim();
  if (!source || !target || !input.language) return undefined;
  const duplicate = project.glossary.terms.some(
    (item) =>
      item.language === input.language &&
      item.source === source &&
      item.target.toLocaleLowerCase() === target.toLocaleLowerCase(),
  );
  if (duplicate) return undefined;
  const now = new Date().toISOString();
  const term: ProjectTerm = {
    id: uid("gterm"),
    source,
    target,
    language: input.language,
    required: input.required,
    createdAt: now,
    updatedAt: now,
  };
  project.glossary.terms.unshift(term);
  project.glossary.dirty = true;
  pushTermHistory(project, {
    termId: term.id,
    source,
    language: input.language,
    action: "create",
    newValue: target,
    note: `新增${input.required ? "必选" : "可选"}术语，固定译法「${target}」（待发布）。`,
    version: 0,
  });
  return term;
}

/** 修改固定译法（未发布时只改草稿；记录保留调整轨迹） */
export function updateGlossaryTarget(project: SignProject, termId: string, next: string) {
  const target = next.trim();
  const item = project.glossary.terms.find((term) => term.id === termId);
  if (!item || !target || target === item.target) return;
  const previous = item.target;
  item.target = target;
  item.updatedAt = new Date().toISOString();
  project.glossary.dirty = true;
  pushTermHistory(project, {
    termId,
    source: item.source,
    language: item.language,
    action: "target",
    oldValue: previous,
    newValue: target,
    note: `固定译法调整：${previous} → ${target}（待发布）。`,
    version: 0,
  });
}

/** 切换必选标记 */
export function updateGlossaryRequired(project: SignProject, termId: string, required: boolean) {
  const item = project.glossary.terms.find((term) => term.id === termId);
  if (!item || item.required === required) return;
  const previous = item.required;
  item.required = required;
  item.updatedAt = new Date().toISOString();
  project.glossary.dirty = true;
  pushTermHistory(project, {
    termId,
    source: item.source,
    language: item.language,
    action: "required",
    oldValue: previous ? "必选" : "可选",
    newValue: required ? "必选" : "可选",
    note: `必选标记调整：${previous ? "必选 → 可选" : "可选 → 必选"}（待发布）。`,
    version: 0,
  });
}

/** 删除术语（仅记录，不再参与发布与校验） */
export function removeGlossaryTerm(project: SignProject, termId: string) {
  const item = project.glossary.terms.find((term) => term.id === termId);
  if (!item) return;
  project.glossary.terms = project.glossary.terms.filter((term) => term.id !== termId);
  project.glossary.dirty = true;
  pushTermHistory(project, {
    termId,
    source: item.source,
    language: item.language,
    action: "delete",
    oldValue: item.target,
    note: `删除术语「${item.source} → ${item.target}」（待发布生效）。`,
    version: 0,
  });
}

/**
 * 发布词库新版本。
 * 固定译法发生变化且命中已确认标识旧译法时，生成/更新待复核条目；
 * 译文不会被自动改动，需审校员逐条采用。
 */
export function publishGlossary(project: SignProject, note: string): number | undefined {
  if (!project.glossary.dirty) return undefined;
  const nextVersion = project.glossary.currentVersion + 1;
  const now = new Date().toISOString();

  const changed = project.glossary.terms.filter(
    (term) =>
      term.publishedTarget === undefined ||
      term.target !== term.publishedTarget ||
      term.publishedRequired === undefined ||
      term.required !== term.publishedRequired,
  );

  const pendingByKey = new Map(
    project.termReviews
      .filter((review) => review.status === "pending")
      .map((review) => [`${review.termId}::${review.signId}`, review]),
  );

  for (const term of changed) {
    const oldTarget = term.publishedTarget;
    const targetChanged = oldTarget !== undefined && term.target !== oldTarget;
    if (targetChanged && oldTarget) {
      const affected: SignItem[] = project.signs.filter(
        (sign) =>
          sign.status === "confirmed" &&
          sign.targetLanguage === term.language &&
          renderContains(sign.targetText, oldTarget),
      );
      for (const sign of affected) {
        const existing = pendingByKey.get(`${term.id}::${sign.id}`);
        if (existing) {
          existing.newTarget = term.target;
          existing.required = term.required;
          existing.fromVersion = nextVersion;
          existing.createdAt = now;
        } else {
          project.termReviews.unshift({
            id: uid("review"),
            termId: term.id,
            signId: sign.id,
            source: term.source,
            language: term.language,
            oldTarget,
            newTarget: term.target,
            required: term.required,
            fromVersion: nextVersion,
            status: "pending",
            createdAt: now,
          });
        }
      }
    }

    // 将草稿期的调整轨迹归入新版本，并补一条发布记录
    for (const record of project.glossary.history) {
      if (record.version === 0 && record.termId === term.id) record.version = nextVersion;
    }
    const actions: string[] = [];
    if (oldTarget === undefined) actions.push(`收录固定译法「${term.target}」`);
    else if (targetChanged) actions.push(`固定译法「${oldTarget} → ${term.target}」`);
    if (term.publishedRequired !== undefined && term.required !== term.publishedRequired) {
      actions.push(term.required ? "改为必选" : "改为可选");
    }
    if (actions.length) {
      pushTermHistory(project, {
        termId: term.id,
        source: term.source,
        language: term.language,
        action: "publish",
        note: `随词库 v${nextVersion} 发布：${actions.join("，")}。`,
        version: nextVersion,
      });
    }

    term.publishedTarget = term.target;
    term.publishedRequired = term.required;
  }

  // 删除术语的草稿记录同样归入新版本
  for (const record of project.glossary.history) {
    if (record.version === 0) record.version = nextVersion;
  }

  project.glossary.currentVersion = nextVersion;
  project.glossary.dirty = false;
  project.glossary.versions.unshift({
    version: nextVersion,
    label: `词库 v${nextVersion}`,
    note: note.trim() || (changed.length ? `发布 ${changed.length} 条术语调整。` : "词库整理发布。"),
    publishedAt: now,
    termCount: project.glossary.terms.length,
    requiredCount: project.glossary.terms.filter((term) => term.required).length,
  });
  project.glossary.versions = project.glossary.versions.slice(0, 20);
  return nextVersion;
}

/** 待复核数量（项目页角标使用） */
export function pendingReviewCount(project: SignProject) {
  return project.termReviews.filter((review) => review.status === "pending").length;
}

export function findSign(project: SignProject, signId: string) {
  return project.signs.find((sign) => sign.id === signId);
}

/**
 * 审校员逐条采用新译法：
 * 替换旧译法 → 同步标识术语绑定 → 回到待确认 → 生成版本快照。
 */
export function adoptTermReview(project: SignProject, reviewId: string): TermReviewItem | undefined {
  const review = project.termReviews.find((item) => item.id === reviewId);
  if (!review || review.status !== "pending") return undefined;
  const sign = findSign(project, review.signId);
  if (!sign) return undefined;

  const replaced = replaceFirstOccurrence(sign.targetText, review.oldTarget, review.newTarget);

  // 采用前先保存旧译文快照，便于在“版本比较”里回看
  sign.versions.unshift({
    id: uid("version"),
    label: `词库 v${review.fromVersion} 采用前`,
    createdAt: new Date().toISOString(),
    sourceText: sign.sourceText,
    targetText: sign.targetText,
    status: sign.status,
    terms: structuredClone(sign.terms),
  });
  sign.versions = sign.versions.slice(0, 12);

  if (replaced !== sign.targetText) sign.targetText = replaced;

  // 同步该标识已绑定的同名术语；未绑定则按词库补一条
  const bound = sign.terms.find(
    (term) =>
      term.source === review.source &&
      term.target.toLocaleLowerCase() === review.oldTarget.toLocaleLowerCase(),
  );
  if (bound) {
    bound.target = review.newTarget;
    bound.required = review.required;
  } else {
    sign.terms.push({
      id: uid("term"),
      source: review.source,
      target: review.newTarget,
      required: review.required,
      confirmed: false,
    });
  }

  sign.status = "pending";
  sign.emergencyRevision = false;
  sign.updatedAt = new Date().toISOString();

  review.status = "adopted";
  review.resolvedAt = new Date().toISOString();
  review.resolutionNote = "已采用词库新译法，标识回到待确认并生成版本快照。";
  return review;
}

/** 暂不采用：保留旧译法，关闭该条待复核 */
export function dismissTermReview(project: SignProject, reviewId: string, note = "") {
  const review = project.termReviews.find((item) => item.id === reviewId);
  if (!review || review.status !== "pending") return;
  review.status = "dismissed";
  review.resolvedAt = new Date().toISOString();
  review.resolutionNote = note.trim() || "审校员保留旧译法，暂不采用。";
}

/** 标识当前挂起的待复核条目（标识清单/详情上的提示使用） */
export function pendingReviewsForSign(project: SignProject, signId: string) {
  return project.termReviews.filter(
    (review) => review.signId === signId && review.status === "pending",
  );
}
