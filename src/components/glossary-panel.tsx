import { component$, useSignal, type PropFunction, type Signal } from "@builder.io/qwik";
import type { ProjectTerm, SignProject } from "../types";

export const LANGUAGES = ["English", "日本語", "Français", "Deutsch", "한국어", "Español"] as const;

interface GlossaryPanelProps {
  open: Signal<boolean>;
  project: Signal<SignProject>;
  onAdd$: PropFunction<(source: string, target: string, language: string, required: boolean) => void>;
  onSaveEdit$: PropFunction<(termId: string, target: string, required: boolean) => void>;
  onDelete$: PropFunction<(termId: string) => void>;
  onPublish$: PropFunction<(note: string) => void>;
}

const ACTION_LABELS: Record<string, string> = {
  create: "新增",
  target: "译法调整",
  required: "必选标记",
  delete: "删除",
  publish: "发布",
};

export const GlossaryPanel = component$((props: GlossaryPanelProps) => {
  const { open, project } = props;
  const tab = useSignal<"terms" | "history">("terms");
  const languageFilter = useSignal<string>("全部");
  const newSource = useSignal("");
  const newTarget = useSignal("");
  const newLanguage = useSignal<string>("English");
  const newRequired = useSignal(true);
  const publishNote = useSignal("");
  const editingId = useSignal("");
  const editTarget = useSignal("");
  const editRequired = useSignal(true);

  const glossary = () => project.value.glossary;
  const filteredTerms = () => {
    const terms = glossary().terms;
    return languageFilter.value === "全部" ? terms : terms.filter((term) => term.language === languageFilter.value);
  };
  const changedCount = () =>
    glossary().terms.filter(
      (term) =>
        term.publishedTarget === undefined ||
        term.target !== term.publishedTarget ||
        term.publishedRequired === undefined ||
        term.required !== term.publishedRequired,
    ).length;

  const startEdit = (term: ProjectTerm) => {
    editingId.value = term.id;
    editTarget.value = term.target;
    editRequired.value = term.required;
  };

  if (!open.value) return null;

  return (
    <div class="modal modal-open z-50">
      <div class="modal-box max-w-4xl p-0">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Project Glossary</div>
            <h2 class="text-lg font-bold text-slate-800">
              项目级术语库
              <span class="badge badge-outline ml-2">当前 {glossary().currentVersion === 0 ? "未发布" : `v${glossary().currentVersion}`}</span>
              {glossary().dirty && <span class="badge badge-warning badge-sm ml-2">有未发布调整</span>}
            </h2>
          </div>
          <button class="btn btn-sm btn-ghost" onClick$={() => (open.value = false)}>关闭 ✕</button>
        </div>

        <div class="flex gap-1 border-b border-slate-200 px-6 pt-3">
          <button class={`btn btn-sm rounded-b-none ${tab.value === "terms" ? "btn-primary" : "btn-ghost"}`} onClick$={() => (tab.value = "terms")}>
            术语（{glossary().terms.length}）
          </button>
          <button class={`btn btn-sm rounded-b-none ${tab.value === "history" ? "btn-primary" : "btn-ghost"}`} onClick$={() => (tab.value = "history")}>
            调整记录（{glossary().history.length}）
          </button>
        </div>

        <div class="max-h-[70vh] overflow-y-auto p-6">
          {tab.value === "terms" ? (
            <>
              <div class="rounded-xl border border-blue-200 bg-blue-50 p-4">
                <div class="flex items-center justify-between">
                  <div class="text-sm font-bold text-blue-900">发布词库新版本</div>
                  <span class="text-xs text-blue-700">{changedCount()} 条术语相对已发布版本有变化</span>
                </div>
                <p class="mt-1 text-xs leading-5 text-blue-800">
                  发布后，新固定译法若撞上已确认标识中的旧译法，只会生成待复核，审校员逐条采用后才改译文。
                </p>
                <div class="mt-3 flex gap-2">
                  <input
                    class="input input-sm input-bordered flex-1"
                    placeholder="版本说明，如：按 2026 译写规范统一交通类术语"
                    value={publishNote.value}
                    onInput$={(_, el) => (publishNote.value = el.value)}
                  />
                  <button
                    class="btn btn-sm btn-primary"
                    disabled={!glossary().dirty}
                    onClick$={async () => {
                      await props.onPublish$(publishNote.value);
                      publishNote.value = "";
                    }}
                  >
                    发布 v{glossary().currentVersion + 1}
                  </button>
                </div>
              </div>

              <div class="mt-4 grid grid-cols-[1fr_1fr_150px_auto_auto] gap-2 rounded-xl bg-slate-100 p-3 text-xs font-bold text-slate-500">
                <span>中文术语</span>
                <span>固定译法</span>
                <span>目标语言</span>
                <span>必选</span>
                <span class="w-16" />
              </div>
              <div class="mt-2 grid grid-cols-[1fr_1fr_150px_auto_auto] items-center gap-2 rounded-xl border border-slate-200 p-3">
                <input class="input input-sm input-bordered" placeholder="如：电梯" value={newSource.value} onInput$={(_, el) => (newSource.value = el.value)} />
                <input class="input input-sm input-bordered" placeholder="如：lift" value={newTarget.value} onInput$={(_, el) => (newTarget.value = el.value)} />
                <select class="select select-sm select-bordered" value={newLanguage.value} onChange$={(_, el) => (newLanguage.value = el.value)}>
                  {LANGUAGES.map((language) => <option key={language}>{language}</option>)}
                </select>
                <label class="label cursor-pointer justify-center py-0">
                  <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked={newRequired.value} onChange$={(_, el) => (newRequired.value = el.checked)} />
                </label>
                <button
                  class="btn btn-sm btn-primary"
                  onClick$={async () => {
                    await props.onAdd$(newSource.value, newTarget.value, newLanguage.value, newRequired.value);
                    newSource.value = "";
                    newTarget.value = "";
                  }}
                >
                  新增
                </button>
              </div>

              <div class="mt-4 flex items-center gap-2">
                <span class="text-xs font-bold text-slate-500">按语言筛选</span>
                <select class="select select-xs select-bordered" value={languageFilter.value} onChange$={(_, el) => (languageFilter.value = el.value)}>
                  <option>全部</option>
                  {LANGUAGES.map((language) => <option key={language}>{language}</option>)}
                </select>
              </div>

              <div class="mt-3 space-y-2">
                {filteredTerms().length === 0 && (
                  <div class="rounded-xl border border-dashed p-6 text-center text-sm text-slate-400">该语言下还没有项目术语。</div>
                )}
                {filteredTerms().map((term) => {
                  const isDirty =
                    term.publishedTarget === undefined ||
                    term.target !== term.publishedTarget ||
                    term.publishedRequired === undefined ||
                    term.required !== term.publishedRequired;
                  if (editingId.value === term.id) {
                    return (
                      <div key={term.id} class="grid grid-cols-[1fr_1fr_150px_auto_auto] items-center gap-2 rounded-xl border border-blue-300 bg-blue-50 p-3">
                        <span class="truncate text-sm font-bold">{term.source}</span>
                        <input class="input input-sm input-bordered" value={editTarget.value} onInput$={(_, el) => (editTarget.value = el.value)} />
                        <span class="text-xs text-slate-500">{term.language}</span>
                        <label class="label cursor-pointer justify-center py-0">
                          <input type="checkbox" class="checkbox checkbox-sm checkbox-primary" checked={editRequired.value} onChange$={(_, el) => (editRequired.value = el.checked)} />
                        </label>
                        <div class="flex gap-1">
                          <button class="btn btn-xs btn-success" onClick$={async () => { await props.onSaveEdit$(term.id, editTarget.value, editRequired.value); editingId.value = ""; }}>保存</button>
                          <button class="btn btn-xs btn-ghost" onClick$={() => (editingId.value = "")}>取消</button>
                        </div>
                      </div>
                    );
                  }
                  return (
                    <div key={term.id} class="grid grid-cols-[1fr_1fr_150px_auto_auto] items-center gap-2 rounded-xl border border-slate-200 px-3 py-2">
                      <div class="min-w-0">
                        <div class="truncate text-sm font-bold text-slate-800">{term.source}</div>
                        {isDirty && <div class="text-[11px] text-amber-600">待发布（已发布：{term.publishedTarget ?? "—"}）</div>}
                      </div>
                      <div class="truncate text-sm" title={term.target}>{term.target}</div>
                      <span class="text-xs text-slate-500">{term.language}</span>
                      <span class={`badge badge-sm ${term.required ? "badge-error" : "badge-ghost"}`}>{term.required ? "必选" : "可选"}</span>
                      <div class="flex gap-1">
                        <button class="btn btn-xs btn-ghost" onClick$={() => startEdit(term)}>编辑</button>
                        <button class="btn btn-xs btn-ghost text-error" onClick$={() => props.onDelete$(term.id)}>删除</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : (
            <div class="space-y-5">
              <section>
                <h3 class="mb-2 text-sm font-bold text-slate-700">词库发布版本</h3>
                {glossary().versions.length === 0 && <div class="rounded-xl border border-dashed p-5 text-center text-xs text-slate-400">尚未发布过词库版本。</div>}
                <div class="space-y-2">
                  {glossary().versions.map((version) => (
                    <div key={version.version} class="rounded-xl border border-slate-200 p-3">
                      <div class="flex items-center justify-between text-xs">
                        <span class="font-bold text-slate-700">v{version.version} · {version.label}</span>
                        <span class="text-slate-400">{new Date(version.publishedAt).toLocaleString()}</span>
                      </div>
                      <p class="mt-1 text-xs leading-5 text-slate-600">{version.note}</p>
                      <div class="mt-1 text-[11px] text-slate-400">收录 {version.termCount} 条，其中必选 {version.requiredCount} 条</div>
                    </div>
                  ))}
                </div>
              </section>
              <section>
                <h3 class="mb-2 text-sm font-bold text-slate-700">术语调整记录</h3>
                <div class="space-y-2">
                  {glossary().history.map((record) => (
                    <div key={record.id} class="flex items-start gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                      <span class={`badge badge-sm ${record.action === "delete" ? "badge-error" : record.action === "publish" ? "badge-info" : "badge-ghost"}`}>
                        {ACTION_LABELS[record.action] ?? record.action}
                      </span>
                      <div class="min-w-0 flex-1">
                        <div class="font-bold text-slate-700">
                          {record.source}
                          <span class="ml-1 font-normal text-slate-400">（{record.language}）</span>
                          {record.oldValue !== undefined && <span class="ml-1 text-red-600 line-through">{record.oldValue}</span>}
                          {record.oldValue !== undefined && record.newValue !== undefined && <span class="mx-1">→</span>}
                          {record.newValue !== undefined && <span class="text-green-700">{record.newValue}</span>}
                        </div>
                        <div class="mt-0.5 leading-5 text-slate-500">{record.note}</div>
                      </div>
                      <div class="shrink-0 text-right text-[11px] text-slate-400">
                        <div>{record.version === 0 ? "草稿" : `v${record.version}`}</div>
                        <div>{new Date(record.createdAt).toLocaleString()}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
    </div>
  );
});
