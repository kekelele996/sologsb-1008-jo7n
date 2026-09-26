import { $, component$, useSignal, useVisibleTask$, type QRL } from "@builder.io/qwik";
import { type DocumentHead } from "@builder.io/qwik-city";
import { createSeedProject, STATUS_LABELS, uid } from "../data";
import {
  GLOSSARY_ACTION_LABELS,
  LANGUAGES,
  addGlossaryTerm,
  adoptTermReview,
  buildGlossaryFromSigns,
  countPendingReviews,
  deleteGlossaryTerm,
  glossaryTermFor,
  ignoreTermReview,
  matchSegments,
  reopenTermReview,
  setGlossaryTermRequired,
  unboundGlossarySuggestions,
  updateGlossaryTermTarget,
} from "../glossary";
import type { GlossaryTerm, ReviewStatus, SignItem, SignProject, TermReview } from "../types";
import { analyzeSign, cloneTerms, diffText } from "../utils";

const STORAGE_KEY = "sologsb-1008-project-v1";
const WIDTHS = [320, 480, 720, 960] as const;

export const head: DocumentHead = {
  title: "公共标识多语言校对台",
  meta: [
    { name: "description", content: "公共标识译文、术语、版本和版面风险校对工作台" },
  ],
};

function statusClass(status: ReviewStatus) {
  if (status === "confirmed") return "badge-success";
  if (status === "changes") return "badge-error";
  if (status === "pending") return "badge-warning";
  return "badge-neutral";
}

export default component$(() => {
  const project = useSignal<SignProject>(createSeedProject());
  const past = useSignal<SignProject[]>([]);
  const future = useSignal<SignProject[]>([]);
  const hydrated = useSignal(false);
  const online = useSignal(true);
  const previewWidth = useSignal(480);
  const previewFont = useSignal(42);
  const selectedVersionId = useSignal("");
  const termSource = useSignal("");
  const termTarget = useSignal("");
  const commentDraft = useSignal("");
  const replyDraft = useSignal("");
  const replyingTo = useSignal("");
  const toast = useSignal("");
  const previewId = useSignal("");
  const readOnly = useSignal(false);
  const glossaryOpen = useSignal(false);
  const reviewOpen = useSignal(false);
  const reviewFilter = useSignal<"all" | "pending" | "adopted" | "ignored">("pending");
  const glossaryLang = useSignal<string>(LANGUAGES[0]);
  const gSource = useSignal("");
  const gTarget = useSignal("");
  const gRequired = useSignal(true);
  const editingTermId = useSignal("");
  const editingTarget = useSignal("");
  const active = () => project.value.signs.find((sign) => sign.id === (previewId.value || project.value.activeSignId)) ?? project.value.signs[0];

  const commit = $((label: string, update: (draft: SignProject) => void) => {
    past.value = [...past.value.slice(-49), structuredClone(project.value)];
    future.value = [];
    const draft = structuredClone(project.value);
    update(draft);
    draft.updatedAt = new Date().toISOString();
    project.value = draft;
  });

  const updateActive = $((label: string, update: (sign: SignItem, draft: SignProject) => void) => {
    commit(label, (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (sign) update(sign, draft);
    });
  });

  const undo = $(() => {
    if (!past.value.length) return;
    const previous = past.value.at(-1)!;
    future.value = [structuredClone(project.value), ...future.value].slice(0, 50);
    past.value = past.value.slice(0, -1);
    project.value = previous;
    toast.value = "已撤销";
  });

  const redo = $(() => {
    if (!future.value.length) return;
    const next = future.value[0];
    past.value = [...past.value.slice(-49), structuredClone(project.value)];
    future.value = future.value.slice(1);
    project.value = next;
    toast.value = "已重做";
  });

  const navigateSign = $((direction: 1 | -1) => {
    if (readOnly.value) return;
    const signs = project.value.signs;
    const index = Math.max(0, signs.findIndex((sign) => sign.id === project.value.activeSignId));
    const next = signs[(index + direction + signs.length) % signs.length];
    commit("切换标识", (draft) => { draft.activeSignId = next.id; });
    selectedVersionId.value = "";
  });

  const setStatus = $((status: ReviewStatus) => {
    commit("更新审校状态", (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!sign) return;
      if (sign.emergencyRevision && status === "confirmed") {
        sign.status = "pending";
      } else {
        sign.status = status;
      }
    });
  });

  const toggleEmergency = $(() => {
    commit("切换紧急修订", (draft) => {
      const sign = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!sign) return;
      sign.emergencyRevision = !sign.emergencyRevision;
      if (sign.emergencyRevision) sign.status = "changes";
    });
  });

  const saveVersion = $(() => {
    const sign = project.value.signs.find((item) => item.id === project.value.activeSignId);
    if (!sign) return;
    const versionId = uid("version");
    commit("保存版本快照", (draft) => {
      const current = draft.signs.find((item) => item.id === draft.activeSignId);
      if (!current) return;
      current.versions.unshift({
        id: versionId,
        label: `版本 ${current.versions.length + 1}`,
        createdAt: new Date().toISOString(),
        sourceText: current.sourceText,
        targetText: current.targetText,
        status: current.status,
        terms: cloneTerms(current.terms),
      });
      current.versions = current.versions.slice(0, 12);
    });
    selectedVersionId.value = versionId;
    toast.value = "版本快照已保存";
  });

  const addTerm = $(() => {
    const source = termSource.value.trim();
    const target = termTarget.value.trim();
    if (!source || !target) return;
    updateActive("绑定术语", (sign) => {
      sign.terms.push({ id: uid("term"), source, target, required: true, confirmed: false });
      sign.status = "pending";
    });
    termSource.value = "";
    termTarget.value = "";
  });

  const addComment = $(() => {
    const body = commentDraft.value.trim();
    if (!body) return;
    updateActive("添加审校意见", (sign) => {
      sign.comments.unshift({
        id: uid("comment"),
        author: "当前审校员",
        body,
        createdAt: new Date().toISOString(),
        resolved: false,
        replies: [],
      });
      sign.status = sign.status === "confirmed" ? "changes" : sign.status;
    });
    commentDraft.value = "";
  });

  const addReply = $((commentId: string) => {
    const body = replyDraft.value.trim();
    if (!body) return;
    updateActive("回复审校意见", (sign) => {
      const comment = sign.comments.find((item) => item.id === commentId);
      comment?.replies.push({ id: uid("reply"), author: "当前审校员", body, createdAt: new Date().toISOString() });
    });
    replyDraft.value = "";
    replyingTo.value = "";
  });

  const sharePreview: QRL<() => void> = $(() => {
    const current = project.value.signs.find((item) => item.id === project.value.activeSignId);
    if (!current) return;
    const url = `${window.location.origin}${window.location.pathname}?preview=${encodeURIComponent(current.id)}`;
    void navigator.clipboard?.writeText(url).catch(() => undefined);
    toast.value = "只读预览链接已复制";
  });

  const addGlossary = $(() => {
    const source = gSource.value.trim();
    const target = gTarget.value.trim();
    if (!source || !target) {
      toast.value = "请填写中文术语和固定译法";
      return;
    }
    const language = glossaryLang.value;
    const duplicate = project.value.glossary.terms.some(
      (item) => item.language === language && item.source.trim() === source,
    );
    if (duplicate) {
      toast.value = "该语言下已存在同名术语，请直接编辑原条目";
      return;
    }
    commit("新增项目术语", (draft) => {
      addGlossaryTerm(draft, { source, target, language, required: gRequired.value });
    });
    gSource.value = "";
    gTarget.value = "";
    gRequired.value = true;
    toast.value = `术语库已发布 v${project.value.glossary.version}`;
  });

  const startEditTerm = $((term: GlossaryTerm) => {
    editingTermId.value = term.id;
    editingTarget.value = term.target;
  });

  const saveTermTarget = $((termId: string) => {
    const target = editingTarget.value.trim();
    const current = project.value.glossary.terms.find((item) => item.id === termId);
    if (!current || !target) return;
    if (target.toLocaleLowerCase() === current.target.toLocaleLowerCase()) {
      editingTermId.value = "";
      return;
    }
    let queued = 0;
    commit("调整术语固定译法", (draft) => {
      queued = updateGlossaryTermTarget(draft, termId, target);
    });
    editingTermId.value = "";
    editingTarget.value = "";
    toast.value = queued
      ? `已发布新版本，${queued} 处已确认标识列入待复核`
      : `术语库已发布 v${project.value.glossary.version}`;
  });

  const toggleTermRequired = $((termId: string) => {
    const current = project.value.glossary.terms.find((item) => item.id === termId);
    if (!current) return;
    commit("调整术语必选标记", (draft) => {
      setGlossaryTermRequired(draft, termId, !current.required);
    });
    toast.value = `术语库已发布 v${project.value.glossary.version}`;
  });

  const removeTerm = $((termId: string) => {
    const current = project.value.glossary.terms.find((item) => item.id === termId);
    if (!current) return;
    if (!window.confirm(`删除项目术语「${current.source}」？各标识已有的术语绑定不受影响。`)) return;
    commit("删除项目术语", (draft) => {
      deleteGlossaryTerm(draft, termId);
    });
    if (editingTermId.value === termId) editingTermId.value = "";
    toast.value = `术语库已发布 v${project.value.glossary.version}`;
  });

  const adoptReview = $((reviewId: string) => {
    commit("采用新译法", (draft) => {
      adoptTermReview(draft, reviewId);
    });
    toast.value = "已采用新译法，标识回到待确认并保存了快照";
  });

  const skipReview = $((reviewId: string) => {
    commit("暂不采用", (draft) => {
      ignoreTermReview(draft, reviewId);
    });
    toast.value = "该条已标记为暂不采用，可在复核列表重新打开";
  });

  const reopenReview = $((reviewId: string) => {
    commit("重新打开复核", (draft) => {
      reopenTermReview(draft, reviewId);
    });
  });

  const goSign = $((signId: string) => {
    commit("切换标识", (draft) => { draft.activeSignId = signId; });
    selectedVersionId.value = "";
    reviewOpen.value = false;
    glossaryOpen.value = false;
  });

  const bindSuggestion = $((termId: string) => {
    const suggestion = project.value.glossary.terms.find((item) => item.id === termId);
    const signId = project.value.activeSignId;
    if (!suggestion) return;
    commit("绑定项目术语", (draft) => {
      const target = draft.signs.find((sign) => sign.id === signId);
      if (!target || target.terms.some((binding) => binding.source === suggestion.source)) return;
      target.terms.push({ id: uid("term"), source: suggestion.source, target: suggestion.target, required: suggestion.required, confirmed: false });
    });
    toast.value = `已绑定项目术语：${suggestion.source}`;
  });

  const preview = () => analyzeSign(active(), previewWidth.value, previewFont.value);
  const selectedVersion = () => active().versions.find((version) => version.id === selectedVersionId.value) ?? active().versions[0];
  const comparison = () => {
    const version = selectedVersion();
    return version ? diffText(version.targetText, active().targetText) : [];
  };

  useVisibleTask$(({ track }) => {
    track(() => hydrated.value);
    if (!hydrated.value) {
      try {
        const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "") as { schema: number; project: SignProject };
        if (stored.schema === 2 && stored.project?.signs?.length && stored.project.glossary) {
          project.value = stored.project;
        } else if (stored.schema === 1 && stored.project?.signs?.length) {
          const migrated = stored.project;
          migrated.glossary = buildGlossaryFromSigns(migrated.signs, new Date().toISOString());
          migrated.termReviews = [];
          project.value = migrated;
          localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 2, project: migrated }));
        }
        const requestedPreview = new URLSearchParams(window.location.search).get("preview") ?? "";
        previewId.value = requestedPreview;
        readOnly.value = Boolean(requestedPreview);
      } catch {
        // Keep bundled sample data when storage is unavailable or malformed.
      }
      hydrated.value = true;
    }
  });

  useVisibleTask$(({ track, cleanup }) => {
    track(() => hydrated.value);
    if (!hydrated.value) return;
    track(() => project.value);
    const timer = window.setTimeout(() => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schema: 2, project: project.value }));
    }, 450);
    cleanup(() => window.clearTimeout(timer));
  });

  useVisibleTask$(({ cleanup }) => {
    const updateOnline = () => { online.value = navigator.onLine; };
    updateOnline();
    const keydown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      const command = event.metaKey || event.ctrlKey;
      if (command && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? undo() : undo();
      } else if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        navigateSign(1);
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        navigateSign(-1);
      } else if (event.key === "[") {
        const index = WIDTHS.indexOf(previewWidth.value as (typeof WIDTHS)[number]);
        previewWidth.value = WIDTHS[Math.max(0, index - 1)];
      } else if (event.key === "]") {
        const index = WIDTHS.indexOf(previewWidth.value as (typeof WIDTHS)[number]);
        previewWidth.value = WIDTHS[Math.min(WIDTHS.length - 1, index + 1)];
      } else if (event.key === "-") {
        previewFont.value = Math.max(28, previewFont.value - 4);
      } else if (event.key === "=") {
        previewFont.value = Math.min(88, previewFont.value + 4);
      }
    };
    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    window.addEventListener("keydown", keydown);
    cleanup(() => {
      window.removeEventListener("online", updateOnline);
      window.removeEventListener("offline", updateOnline);
      window.removeEventListener("keydown", keydown);
    });
  });

  const pendingCount = countPendingReviews(project.value);
  const activePendingReviews = project.value.termReviews.filter(
    (review) => review.status === "pending" && review.signId === active().id,
  );
  const signSuggestions = unboundGlossarySuggestions(project.value, active());
  const filteredReviews = project.value.termReviews
    .filter((review) => reviewFilter.value === "all" || review.status === reviewFilter.value)
    .sort((a, b) => {
      if ((a.status === "pending") !== (b.status === "pending")) return a.status === "pending" ? -1 : 1;
      return b.createdAt.localeCompare(a.createdAt);
    });
  const glossaryTermsByLang = project.value.glossary.terms
    .filter((term) => term.language === glossaryLang.value)
    .sort((a, b) => a.source.localeCompare(b.source, "zh"));

  const reviewSign = (review: TermReview) => project.value.signs.find((sign) => sign.id === review.signId);

  if (readOnly.value) {
    const sign = active();
    const analysis = analyzeSign(sign, previewWidth.value, previewFont.value);
    return (
      <main data-theme="corporate" class="min-h-screen bg-slate-100 p-6">
        <div class="mx-auto max-w-5xl">
          <div class="mb-4 flex items-center justify-between">
            <div>
              <div class="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">Read-only preview</div>
              <h1 class="text-2xl font-bold text-slate-800">{sign.code} · {sign.scenario}</h1>
            </div>
            <span class={`badge ${statusClass(sign.status)}`}>{STATUS_LABELS[sign.status]}</span>
          </div>
          <section class="rounded-3xl bg-white p-14 shadow-xl">
            <div class="mb-3 text-center text-xs text-slate-400">中文原文</div>
            <p class="mx-auto mb-10 max-w-2xl text-center text-lg text-slate-600">{sign.sourceText}</p>
            <div class="mx-auto border-y-4 border-slate-800 py-10 text-center">
              <p class="whitespace-pre-line font-black leading-tight tracking-wide text-slate-900" style={{ fontSize: `${previewFont.value}px` }}>{analysis.visible.join("\n")}</p>
            </div>
            <div class="mt-5 text-center text-sm text-slate-500">{sign.targetLanguage} · {sign.regulation}</div>
          </section>
          <p class="mt-4 text-center text-xs text-slate-400">此链接读取当前浏览器中的本地版本，仅用于演示只读预览。</p>
        </div>
      </main>
    );
  }

  return (
    <div data-theme="corporate" class="min-h-screen bg-slate-100 pb-9 text-slate-800">
      <header class="navbar sticky top-0 z-40 min-h-16 border-b border-slate-700 bg-[#17324d] px-5 text-white shadow-lg">
        <div class="navbar-start gap-3">
          <div class="grid h-10 w-10 place-items-center rounded-xl border border-white/20 bg-white/10 font-black">译</div>
          <div>
            <div class="text-xs uppercase tracking-[0.2em] text-sky-200">Public Sign Review</div>
            <div class="font-bold">公共标识多语言校对台</div>
          </div>
        </div>
        <div class="navbar-center hidden xl:flex">
          <input
            class="input input-sm w-80 border-white/15 bg-white/10 text-white placeholder:text-slate-300"
            value={project.value.title}
            onInput$={(_, element) => commit("修改项目名称", (draft) => { draft.title = element.value; })}
            aria-label="项目名称"
          />
        </div>
        <div class="navbar-end gap-2">
          <span class={`badge ${online.value ? "badge-success" : "badge-warning"} badge-outline`}>{online.value ? "在线" : "离线草稿"}</span>
          <button class="btn btn-sm border-white/20 bg-white/10 text-white hover:bg-white/20" onClick$={() => { glossaryOpen.value = true; }}>
            项目词库
            <span class="badge badge-sm badge-ghost">v{project.value.glossary.version}</span>
          </button>
          <button
            class={`btn btn-sm ${pendingCount ? "btn-warning" : "border-white/20 bg-white/10 text-white hover:bg-white/20"}`}
            onClick$={() => { reviewFilter.value = "pending"; reviewOpen.value = true; }}
          >
            待复核{pendingCount ? <span class="badge badge-sm badge-error">{pendingCount}</span> : null}
          </button>
          <button class="btn btn-ghost btn-sm" disabled={!past.value.length} onClick$={undo}>撤销</button>
          <button class="btn btn-ghost btn-sm" disabled={!future.value.length} onClick$={redo}>重做</button>
          <button class="btn btn-sm border-white/20 bg-white/10 text-white hover:bg-white/20" onClick$={sharePreview}>复制只读链接</button>
          <button class={`btn btn-sm ${active().emergencyRevision ? "btn-error" : "btn-warning"}`} onClick$={toggleEmergency}>
            {active().emergencyRevision ? "退出紧急修订" : "紧急修订"}
          </button>
        </div>
      </header>

      {active().emergencyRevision && (
        <div class="alert alert-error sticky top-16 z-30 rounded-none border-x-0 py-2 text-white">
          <span class="text-lg">!</span>
          <span><strong>紧急修订模式</strong>：确认操作已锁定，修改后必须重新审校并保存版本。</span>
        </div>
      )}

      <div class="grid min-h-[calc(100vh-64px)] grid-cols-[270px_minmax(560px,1fr)_430px] gap-px bg-slate-300">
        <aside class="overflow-y-auto bg-slate-50 p-3">
          <div class="mb-3 rounded-xl bg-white p-4 shadow-sm">
            <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">标识清单</div>
            <div class="mt-1 text-lg font-bold text-slate-800">{project.value.signs.length} 处标识</div>
            <p class="mt-1 text-xs leading-5 text-slate-500">{project.value.location}</p>
            <button
              class="mt-3 flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-left text-xs hover:border-amber-400 hover:bg-amber-50"
              onClick$={() => { reviewFilter.value = "pending"; reviewOpen.value = true; }}
            >
              <span class="font-semibold text-slate-600">词库新译法待复核</span>
              <span class={`badge badge-sm ${pendingCount ? "badge-warning" : "badge-ghost"}`}>{pendingCount}</span>
            </button>
          </div>
          <div class="space-y-2">
            {project.value.signs.map((sign, index) => {
              const risk = analyzeSign(sign, previewWidth.value, previewFont.value);
              return (
                <button
                  key={sign.id}
                  class={`w-full rounded-xl border p-3 text-left transition ${sign.id === project.value.activeSignId ? "border-blue-400 bg-blue-50 shadow-sm" : "border-slate-200 bg-white hover:border-slate-300"}`}
                  onClick$={() => {
                    commit("切换标识", (draft) => { draft.activeSignId = sign.id; });
                    selectedVersionId.value = "";
                  }}
                >
                  <div class="flex items-center justify-between">
                    <span class="font-mono text-xs font-bold text-slate-500">{sign.code}</span>
                    <span class={`badge badge-sm ${statusClass(sign.status)}`}>{STATUS_LABELS[sign.status]}</span>
                  </div>
                  <div class="mt-2 line-clamp-2 text-sm font-semibold text-slate-700">{sign.sourceText}</div>
                  <div class="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{sign.targetLanguage}</span>
                    <span class={risk.risk === "high" ? "font-bold text-error" : risk.risk === "medium" ? "font-bold text-warning" : "text-success"}>
                      {risk.risk === "high" ? "高风险" : risk.risk === "medium" ? "需留意" : "版面正常"}
                    </span>
                  </div>
                  <span class="sr-only">第 {index + 1} 条</span>
                </button>
              );
            })}
          </div>
        </aside>

        <main class="min-w-0 bg-white">
          {activePendingReviews.length > 0 && (
            <div class="flex items-center justify-between gap-3 border-b border-amber-300 bg-amber-50 px-6 py-2.5">
              <div class="text-xs leading-5 text-amber-900">
                <strong>{activePendingReviews.length} 条项目词库新译法</strong> 与该已确认标识的旧译法不一致，审校员逐条采用后才会改译文。
              </div>
              <button class="btn btn-xs btn-warning" onClick$={() => { reviewFilter.value = "pending"; reviewOpen.value = true; }}>去复核</button>
            </div>
          )}
          <div class="border-b border-slate-200 bg-slate-50 px-6 py-4">
            <div class="flex items-start justify-between gap-5">
              <div>
                <div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-600">{active().code} · {active().scenario}</div>
                <h1 class="mt-1 text-xl font-bold">中文原文与译文校对</h1>
              </div>
              <div class="join">
                {(["draft", "pending", "changes", "confirmed"] as ReviewStatus[]).map((status) => (
                  <button key={status} class={`btn join-item btn-sm ${active().status === status ? "btn-primary" : "btn-outline"}`} onClick$={() => setStatus(status)}>{STATUS_LABELS[status]}</button>
                ))}
              </div>
            </div>
          </div>

          <div class="space-y-5 p-6">
            <section class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body gap-4 p-5">
                <div class="flex items-center justify-between">
                  <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Source</div><h2 class="font-bold">中文原文</h2></div>
                  <span class="badge badge-ghost">简体中文</span>
                </div>
                <textarea
                  class="textarea textarea-bordered min-h-24 w-full text-base leading-7"
                  value={active().sourceText}
                  onInput$={(_, element) => updateActive("修改中文原文", (sign) => { sign.sourceText = element.value; sign.status = "draft"; })}
                />
              </div>
            </section>

            <section class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body gap-4 p-5">
                <div class="grid grid-cols-2 gap-4">
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">目标语言</span>
                    <select class="select select-bordered" value={active().targetLanguage} onChange$={(_, element) => updateActive("修改目标语言", (sign) => { sign.targetLanguage = element.value; sign.status = "pending"; })}>
                      {["English", "日本語", "Français", "Deutsch", "한국어", "Español"].map((language) => <option key={language}>{language}</option>)}
                    </select>
                  </label>
                  <label class="form-control">
                    <span class="label-text mb-1 text-xs font-bold text-slate-500">适用场景</span>
                    <input class="input input-bordered" value={active().scenario} onInput$={(_, element) => updateActive("修改适用场景", (sign) => { sign.scenario = element.value; })} />
                  </label>
                </div>
                <label class="form-control">
                  <span class="label-text mb-1 text-xs font-bold text-slate-500">法规或规范提示</span>
                  <input class="input input-bordered" value={active().regulation} onInput$={(_, element) => updateActive("修改法规提示", (sign) => { sign.regulation = element.value; })} />
                </label>
                <div class="divider my-0"></div>
                <div class="flex items-center justify-between">
                  <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-blue-500">Target</div><h2 class="font-bold">目标语言译文</h2></div>
                  <button class="btn btn-sm btn-outline" onClick$={saveVersion}>保存版本快照</button>
                </div>
                <textarea
                  class="textarea textarea-bordered min-h-36 w-full text-lg leading-8"
                  value={active().targetText}
                  onInput$={(_, element) => updateActive("修改译文", (sign) => { sign.targetText = element.value; sign.status = sign.emergencyRevision ? "changes" : "pending"; })}
                />
                <div class="flex flex-wrap gap-2">
                  {active().terms.map((term) => {
                    const matched = active().targetText.toLocaleLowerCase().includes(term.target.toLocaleLowerCase());
                    const glossary = glossaryTermFor(project.value, active().targetLanguage, term.source);
                    const drift = glossary && glossary.target.toLocaleLowerCase() !== term.target.toLocaleLowerCase();
                    return (
                      <button
                        key={term.id}
                        title={drift ? `项目词库 v${project.value.glossary.version} 固定译法：${glossary!.target}（点击切换确认状态）` : "点击切换术语确认状态"}
                        class={`badge badge-lg gap-1 ${matched && term.confirmed ? "badge-success" : matched ? "badge-warning" : "badge-error"} ${drift ? "ring-2 ring-amber-500 ring-offset-1" : ""}`}
                        onClick$={() => updateActive("确认术语", (sign) => {
                          const current = sign.terms.find((item) => item.id === term.id);
                          if (current) current.confirmed = !current.confirmed;
                        })}
                      >
                        {term.source} → {term.target} {drift ? "词" : matched ? (term.confirmed ? "✓" : "!") : "×"}
                      </button>
                    );
                  })}
                </div>
              </div>
            </section>

            <section class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body p-5">
                <div class="flex items-center justify-between">
                  <div><h2 class="font-bold">术语绑定</h2><p class="text-xs text-slate-500">必选术语未出现在译文中时会实时告警；项目词库固定译法以“词”标提示。</p></div>
                  <div class="flex items-center gap-2">
                    <span class="badge badge-outline">{active().terms.length} 条</span>
                    <button class="btn btn-xs btn-ghost" onClick$={() => glossaryOpen.value = true}>打开项目词库</button>
                  </div>
                </div>
                <div class="mt-4 grid grid-cols-[1fr_1fr_auto] gap-2">
                  <input class="input input-sm input-bordered" placeholder="中文术语" value={termSource.value} onInput$={(_, element) => termSource.value = element.value} />
                  <input class="input input-sm input-bordered" placeholder="目标语言固定译法" value={termTarget.value} onInput$={(_, element) => termTarget.value = element.value} />
                  <button class="btn btn-sm btn-primary" onClick$={addTerm}>绑定</button>
                </div>
                {signSuggestions.length > 0 && (
                  <div class="mt-2 rounded-lg bg-sky-50 p-2">
                    <div class="px-1 pb-1 text-[11px] font-bold text-sky-700">项目词库建议（{active().targetLanguage}）</div>
                    <div class="flex flex-wrap gap-1.5">
                      {signSuggestions.map((suggestion) => (
                        <button
                          key={suggestion.id}
                          class="badge badge-outline badge-sm gap-1 border-sky-400 text-sky-800 hover:badge-primary"
                          title={`词库 v${project.value.glossary.version}${suggestion.required ? " · 必选" : ""}`}
                          onClick$={() => bindSuggestion(suggestion.id)}
                        >
                          ＋ {suggestion.source} → {suggestion.target}{suggestion.required ? " *必选" : ""}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div class="mt-3 grid gap-2 md:grid-cols-2">
                  {active().terms.map((term) => {
                    const glossary = glossaryTermFor(project.value, active().targetLanguage, term.source);
                    const drift = glossary && glossary.target.toLocaleLowerCase() !== term.target.toLocaleLowerCase();
                    return (
                      <div key={term.id} class="rounded-lg border border-slate-200 px-3 py-2">
                        <div class="flex items-center justify-between">
                          <div class="min-w-0">
                            <div class="truncate text-xs font-bold">{term.source}{term.required ? <span class="ml-1 text-error" title="必选">*</span> : null}</div>
                            <div class="truncate text-xs text-slate-500">{term.target}</div>
                          </div>
                          <div class="flex gap-1">
                            <button class={`btn btn-xs ${term.confirmed ? "btn-success" : "btn-ghost"}`} onClick$={() => updateActive("确认术语", (sign) => { const target = sign.terms.find((item) => item.id === term.id); if (target) target.confirmed = !target.confirmed; })}>确认</button>
                            <button class="btn btn-xs btn-ghost text-error" onClick$={() => updateActive("删除术语", (sign) => { sign.terms = sign.terms.filter((item) => item.id !== term.id); })}>删除</button>
                          </div>
                        </div>
                        {drift && (
                          <button
                            class="mt-1.5 block w-full rounded bg-amber-100 px-2 py-1 text-left text-[11px] leading-4 text-amber-900 hover:bg-amber-200"
                            onClick$={() => { reviewFilter.value = "pending"; reviewOpen.value = true; }}
                          >
                            词库 v{project.value.glossary.version} 固定译法为「{glossary!.target}」，已确认标识需经待复核采用。
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            <section class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body p-5">
                <h2 class="font-bold">审校意见与回复</h2>
                <div class="mt-3 flex gap-2">
                  <textarea class="textarea textarea-bordered min-h-20 flex-1" placeholder="记录措辞、文化适配或法规依据…" value={commentDraft.value} onInput$={(_, element) => commentDraft.value = element.value} />
                  <button class="btn btn-primary self-end" onClick$={addComment}>添加意见</button>
                </div>
                <div class="mt-4 space-y-3">
                  {active().comments.length === 0 && <div class="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">还没有审校意见。</div>}
                  {active().comments.map((comment) => (
                    <article key={comment.id} class={`rounded-xl border-l-4 bg-slate-50 p-3 ${comment.resolved ? "border-success opacity-60" : "border-warning"}`}>
                      <div class="flex items-center justify-between text-xs"><strong>{comment.author}</strong><span class="text-slate-400">{new Date(comment.createdAt).toLocaleString()}</span></div>
                      <p class="my-2 text-sm">{comment.body}</p>
                      {comment.replies.map((reply) => (
                        <div key={reply.id} class="ml-4 my-1 border-l-2 border-slate-200 pl-3 text-xs"><strong>{reply.author}</strong>：{reply.body}</div>
                      ))}
                      {replyingTo.value === comment.id ? (
                        <div class="mt-2 flex gap-2">
                          <input class="input input-xs input-bordered flex-1" value={replyDraft.value} onInput$={(_, element) => replyDraft.value = element.value} />
                          <button class="btn btn-xs btn-primary" onClick$={() => addReply(comment.id)}>发送</button>
                        </div>
                      ) : (
                        <div class="mt-2 flex gap-2">
                          <button class="btn btn-xs btn-ghost" onClick$={() => { replyingTo.value = comment.id; }}>回复</button>
                          <button class="btn btn-xs btn-ghost" onClick$={() => updateActive("更新意见状态", (sign) => { const item = sign.comments.find((entry) => entry.id === comment.id); if (item) item.resolved = !item.resolved; })}>{comment.resolved ? "重新打开" : "标记已解决"}</button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </div>
            </section>
          </div>
        </main>

        <aside class="overflow-y-auto bg-slate-50 p-4">
          <section class="sticky top-4 space-y-4">
            <div class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <div><div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Live Preview</div><h2 class="font-bold">版面实时预览</h2></div>
                  <span class={`badge ${preview().risk === "high" ? "badge-error" : preview().risk === "medium" ? "badge-warning" : "badge-success"}`}>
                    {preview().risk === "high" ? "溢出风险" : preview().risk === "medium" ? "接近边界" : "版面安全"}
                  </span>
                </div>
                <div class="mt-3 flex gap-1">
                  {WIDTHS.map((width) => <button key={width} class={`btn btn-xs flex-1 ${previewWidth.value === width ? "btn-primary" : "btn-outline"}`} onClick$={() => previewWidth.value = width}>{width}px</button>)}
                </div>
                <div class="mt-2 flex items-center gap-3 text-xs">
                  <span class="w-20">字号 {previewFont.value}px</span>
                  <input type="range" min="28" max="88" step="2" class="range range-primary range-xs flex-1" value={previewFont.value} onInput$={(_, element) => previewFont.value = Number(element.value)} />
                </div>
                <div class="mt-4 overflow-hidden rounded-xl bg-slate-800 p-3">
                  <div class="mx-auto grid min-h-48 place-items-center overflow-hidden border-4 border-white bg-[#174f3d] p-3 text-center text-white" style={{ width: `${previewWidth.value}px`, maxWidth: "100%" }}>
                    <div>
                      <div style={{ fontSize: `${previewFont.value}px` }} class="font-black leading-[1.18] tracking-wide">{preview().visible.map((line, index) => <div key={index}>{line || "\u00a0"}</div>)}</div>
                    </div>
                  </div>
                </div>
                <div class="mt-3 grid grid-cols-3 gap-2 text-center text-xs">
                  <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{preview().lines.length}</strong><span>预计行数</span></div>
                  <div class="rounded-lg bg-slate-100 p-2"><strong class="block text-lg">{active().targetText.length}</strong><span>字符数</span></div>
                  <div class="rounded-lg bg-slate-100 p-2"><strong class={`block text-lg ${preview().missingTerms.length ? "text-error" : "text-success"}`}>{preview().missingTerms.length}</strong><span>缺失术语</span></div>
                </div>
                {(preview().overflow || preview().tooLong) && <div class="alert alert-error mt-3 py-2 text-xs">{preview().overflow ? "当前字号下内容超过三行，可能截断。" : "译文接近标识建议字符上限。"}</div>}
              </div>
            </div>

            <div class="card border border-slate-200 bg-white shadow-sm">
              <div class="card-body p-4">
                <div class="flex items-center justify-between">
                  <div><h2 class="font-bold">版本比较</h2><p class="text-xs text-slate-500">旧版快照与当前译文逐词对比。</p></div>
                  <span class="badge badge-outline">{active().versions.length} 版</span>
                </div>
                {active().versions.length ? (
                  <>
                    <select class="select select-sm select-bordered mt-3 w-full" value={selectedVersionId.value || active().versions[0].id} onChange$={(_, element) => selectedVersionId.value = element.value}>
                      {active().versions.map((version) => <option key={version.id} value={version.id}>{`${version.label} · ${new Date(version.createdAt).toLocaleTimeString()}`}</option>)}
                    </select>
                    <div class="mt-3 rounded-lg bg-slate-900 p-3 text-sm leading-7 text-slate-100">
                      {comparison().map((token, index) => (
                        <span key={index} class={token.type === "add" ? "rounded bg-green-400/25 text-green-200" : token.type === "remove" ? "bg-red-400/25 text-red-200 line-through" : ""}>{token.value}</span>
                      ))}
                    </div>
                    <div class="mt-2 flex gap-3 text-[11px]"><span class="text-green-700">绿：新增</span><span class="text-red-700">红：删除</span></div>
                  </>
                ) : (
                  <div class="mt-3 rounded-xl border border-dashed p-5 text-center text-xs text-slate-400">保存当前译文后会在这里生成可比较版本。</div>
                )}
              </div>
            </div>

            <div class="rounded-xl bg-[#17324d] p-4 text-xs text-slate-200">
              <div class="mb-2 font-bold text-white">键盘操作</div>
              <div class="grid grid-cols-2 gap-y-1"><span><kbd class="kbd kbd-xs">J/K</kbd> 切换标识</span><span><kbd class="kbd kbd-xs">[ ]</kbd> 预览宽度</span><span><kbd class="kbd kbd-xs">- =</kbd> 字号</span><span><kbd class="kbd kbd-xs">Ctrl/⌘ Z</kbd> 撤销</span></div>
            </div>
          </section>
        </aside>
      </div>

      {glossaryOpen.value && (
        <div class="modal modal-open z-50" onClick$={() => { glossaryOpen.value = false; editingTermId.value = ""; }}>
          <div class="modal-box max-w-5xl p-0" onClick$={(event) => event.stopPropagation()}>
            <div class="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 class="text-lg font-bold">项目术语库</h3>
                <p class="mt-0.5 text-xs text-slate-500">按目标语言保存固定译法和必选标记；每次调整都发布新版本并记录。新译法只让已确认标识进入待复核，采用后才改译文。</p>
              </div>
              <div class="flex items-center gap-2">
                <span class="badge badge-primary badge-lg">v{project.value.glossary.version}</span>
                <span class="text-xs text-slate-400">最近发布 {new Date(project.value.glossary.publishedAt).toLocaleString()}</span>
                <button class="btn btn-sm btn-circle btn-ghost" onClick$={() => { glossaryOpen.value = false; editingTermId.value = ""; }}>✕</button>
              </div>
            </div>
            <div class="grid max-h-[72vh] grid-cols-[1fr_320px] gap-px overflow-hidden bg-slate-200">
              <div class="overflow-y-auto bg-white p-5">
                <div class="mb-3 flex flex-wrap items-center gap-1">
                  {LANGUAGES.map((language) => (
                    <button
                      key={language}
                      class={`btn btn-xs ${glossaryLang.value === language ? "btn-primary" : "btn-outline"}`}
                      onClick$={() => { glossaryLang.value = language; editingTermId.value = ""; }}
                    >
                      {language}
                      <span class="badge badge-xs badge-ghost ml-0.5">{project.value.glossary.terms.filter((item) => item.language === language).length}</span>
                    </button>
                  ))}
                </div>

                <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div class="mb-2 text-xs font-bold text-slate-500">新增固定译法（保存即发布新版本）</div>
                  <div class="grid grid-cols-[1fr_1fr_auto] gap-2">
                    <input class="input input-sm input-bordered" placeholder="中文术语" value={gSource.value} onInput$={(_, element) => gSource.value = element.value} />
                    <input class="input input-sm input-bordered" placeholder={`${glossaryLang.value} 固定译法`} value={gTarget.value} onInput$={(_, element) => gTarget.value = element.value} />
                    <button class="btn btn-sm btn-primary" onClick$={addGlossary}>发布</button>
                  </div>
                  <label class="mt-2 flex cursor-pointer items-center gap-2 text-xs text-slate-600">
                    <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked={gRequired.value} onChange$={() => gRequired.value = !gRequired.value} />
                    必选标记：该译法未出现在标识译文中时，作为缺失术语告警
                  </label>
                </div>

                <div class="mt-4 space-y-2">
                  {glossaryTermsByLang.length === 0 && (
                    <div class="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">该语言还没有项目术语。</div>
                  )}
                  {glossaryTermsByLang.map((gterm) => (
                    <div key={gterm.id} class="rounded-xl border border-slate-200 px-4 py-2.5">
                      {editingTermId.value === gterm.id ? (
                        <div class="flex items-center gap-2">
                          <span class="w-28 truncate text-sm font-bold">{gterm.source}</span>
                          <input
                            class="input input-sm input-bordered flex-1"
                            value={editingTarget.value}
                            onInput$={(_, element) => editingTarget.value = element.value}
                            onKeyDown$={(event) => { if (event.key === "Enter") saveTermTarget(gterm.id); }}
                          />
                          <button class="btn btn-xs btn-primary" onClick$={() => saveTermTarget(gterm.id)}>发布新译法</button>
                          <button class="btn btn-xs btn-ghost" onClick$={() => { editingTermId.value = ""; editingTarget.value = ""; }}>取消</button>
                        </div>
                      ) : (
                        <div class="flex items-center justify-between gap-3">
                          <div class="min-w-0">
                            <div class="truncate text-sm font-bold">
                              {gterm.source}
                              {gterm.required
                                ? <span class="ml-1 text-error" title="必选术语">*必选</span>
                                : <span class="ml-1 text-slate-400">非必选</span>}
                            </div>
                            <div class="truncate text-sm text-slate-600">{gterm.target}</div>
                          </div>
                          <div class="flex shrink-0 gap-1">
                            <button class="btn btn-xs btn-ghost" onClick$={() => toggleTermRequired(gterm.id)}>{gterm.required ? "取消必选" : "设为必选"}</button>
                            <button class="btn btn-xs btn-ghost" onClick$={() => startEditTerm(gterm)}>改译法</button>
                            <button class="btn btn-xs btn-ghost text-error" onClick$={() => removeTerm(gterm.id)}>删除</button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div class="overflow-y-auto bg-slate-50 p-4">
                <div class="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">调整记录</div>
                <div class="space-y-2">
                  {project.value.glossary.changes.map((change) => (
                    <div key={change.id} class={`rounded-lg border-l-4 bg-white p-2.5 text-xs leading-5 ${change.action === "update" ? "border-amber-500" : change.action === "delete" ? "border-red-400" : change.action === "create" ? "border-green-500" : "border-slate-300"}`}>
                      <div class="flex items-center justify-between">
                        <span class={`badge badge-sm ${change.action === "update" ? "badge-warning" : change.action === "delete" ? "badge-error" : change.action === "create" ? "badge-success" : "badge-ghost"}`}>
                          {GLOSSARY_ACTION_LABELS[change.action]}
                        </span>
                        <span class="font-mono text-[10px] text-slate-400">v{change.version}</span>
                      </div>
                      <div class="mt-1 font-bold text-slate-700">{change.source} · {change.language}</div>
                      {change.action === "update" ? (
                        <div class="text-slate-600">
                          <span class="text-red-600 line-through">{change.oldTarget}</span>
                          {" → "}
                          <span class="text-green-700">{change.newTarget}</span>
                        </div>
                      ) : change.action === "required" ? (
                        <div class="text-slate-600">必选：{change.oldRequired ? "是" : "否"} → {change.newRequired ? "是" : "否"}</div>
                      ) : (
                        <div class="truncate text-slate-600">{change.newTarget || change.oldTarget}</div>
                      )}
                      <div class="mt-0.5 text-[10px] text-slate-400">{new Date(change.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div class="flex items-center justify-between border-t border-slate-200 px-6 py-3">
              <button class="btn btn-sm btn-warning btn-outline" onClick$={() => { glossaryOpen.value = false; reviewFilter.value = "pending"; reviewOpen.value = true; }}>
                查看待复核{pendingCount ? <span class="badge badge-sm badge-error">{pendingCount}</span> : null}
              </button>
              <button class="btn btn-sm" onClick$={() => { glossaryOpen.value = false; editingTermId.value = ""; }}>完成</button>
            </div>
          </div>
        </div>
      )}

      {reviewOpen.value && (
        <div class="modal modal-open z-50" onClick$={() => reviewOpen.value = false}>
          <div class="modal-box max-w-3xl p-0" onClick$={(event) => event.stopPropagation()}>
            <div class="flex items-start justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h3 class="text-lg font-bold">项目词库新译法复核</h3>
                <p class="mt-0.5 text-xs text-slate-500">
                  已确认标识遇上词库新译法时先列入待复核；逐个采用后才替换译文，标识回到待确认并生成版本快照。
                </p>
              </div>
              <button class="btn btn-sm btn-circle btn-ghost" onClick$={() => reviewOpen.value = false}>✕</button>
            </div>
            <div class="flex items-center gap-2 border-b border-slate-100 px-6 py-3 text-xs">
              {([
                ["pending", `待复核 ${countPendingReviews(project.value)}`],
                ["adopted", "已采用"],
                ["ignored", "暂不采用"],
                ["all", "全部"],
              ] as const).map(([key, label]) => (
                <button
                  key={key}
                  class={`btn btn-xs ${reviewFilter.value === key ? "btn-primary" : "btn-outline"}`}
                  onClick$={() => reviewFilter.value = key}
                >
                  {label}
                </button>
              ))}
              <span class="ml-auto text-slate-400">共 {filteredReviews.length} 条</span>
            </div>
            <div class="max-h-[64vh] space-y-3 overflow-y-auto p-5">
              {filteredReviews.length === 0 && (
                <div class="rounded-xl border border-dashed p-8 text-center text-sm text-slate-400">
                  {reviewFilter.value === "pending" ? "没有待复核条目，已确认标识与项目词库一致。" : "没有符合条件的复核记录。"}
                </div>
              )}
              {filteredReviews.map((review) => {
                const sign = reviewSign(review);
                if (!sign) return null;
                return (
                  <article key={review.id} class={`rounded-xl border p-4 ${review.status === "pending" ? "border-amber-300 bg-amber-50/60" : "border-slate-200 bg-white opacity-80"}`}>
                    <div class="flex items-center justify-between gap-3">
                      <div class="flex items-center gap-2 text-xs">
                        <span class="font-mono font-bold text-slate-600">{sign.code}</span>
                        <span class="text-slate-500">{sign.scenario}</span>
                        <span class="badge badge-xs badge-ghost">{review.language}</span>
                        <span class="badge badge-xs badge-ghost">词库 v{review.glossaryVersion}</span>
                      </div>
                      <span class={`badge badge-sm ${review.status === "pending" ? "badge-warning" : review.status === "adopted" ? "badge-success" : "badge-neutral"}`}>
                        {review.status === "pending" ? "待复核" : review.status === "adopted" ? "已采用" : "暂不采用"}
                      </span>
                    </div>
                    <div class="mt-2 text-sm font-bold text-slate-700">{review.source}</div>
                    <div class="mt-1 grid gap-2 md:grid-cols-2">
                      <div class="rounded-lg border border-red-200 bg-red-50 p-2.5">
                        <div class="mb-1 text-[11px] font-bold uppercase tracking-wide text-red-500">标识旧译法（采用前）</div>
                        <div class="text-sm leading-6 text-red-900">
                          {matchSegments(sign.targetText, review.oldTarget).map((segment, index) => (
                            <span key={index} class={segment.matched ? "rounded bg-red-200 font-bold" : ""}>{segment.value}</span>
                          ))}
                        </div>
                      </div>
                      <div class="rounded-lg border border-green-200 bg-green-50 p-2.5">
                        <div class="mb-1 text-[11px] font-bold uppercase tracking-wide text-green-600">词库新译法（采用后）</div>
                        <div class="text-sm leading-6 text-green-900">
                          {review.status === "adopted"
                            ? matchSegments(sign.targetText, review.newTarget).map((segment, index) => (
                              <span key={index} class={segment.matched ? "rounded bg-green-200 font-bold" : ""}>{segment.value}</span>
                            ))
                            : review.newTarget}
                        </div>
                      </div>
                    </div>
                    <div class="mt-3 flex items-center justify-between">
                      <button class="btn btn-xs btn-ghost" onClick$={() => goSign(review.signId)}>打开标识</button>
                      {review.status === "pending" ? (
                        <div class="flex gap-2">
                          <button class="btn btn-xs btn-outline" onClick$={() => skipReview(review.id)}>暂不采用</button>
                          <button class="btn btn-xs btn-success" onClick$={() => adoptReview(review.id)}>采用并改译文</button>
                        </div>
                      ) : (
                        <button class="btn btn-xs btn-ghost" onClick$={() => reopenReview(review.id)}>重新列入待复核</button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {toast.value && <div class="toast toast-end z-[60]"><div class="alert alert-success"><span>{toast.value}</span></div></div>}
    </div>
  );
});
