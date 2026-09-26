import { component$, useSignal, type PropFunction, type Signal } from "@builder.io/qwik";
import type { SignProject } from "../types";
import { findSign } from "../glossary";

interface ReviewsPanelProps {
  open: Signal<boolean>;
  project: Signal<SignProject>;
  onAdopt$: PropFunction<(reviewId: string) => void>;
  onDismiss$: PropFunction<(reviewId: string) => void>;
  onSelectSign$: PropFunction<(signId: string) => void>;
}

export const ReviewsPanel = component$((props: ReviewsPanelProps) => {
  const { open, project } = props;
  const tab = useSignal<"pending" | "resolved">("pending");

  if (!open.value) return null;

  const pending = project.value.termReviews.filter((review) => review.status === "pending");
  const resolved = project.value.termReviews.filter((review) => review.status !== "pending");
  const list = tab.value === "pending" ? pending : resolved;

  return (
    <div class="modal modal-open z-50">
      <div class="modal-box max-w-3xl p-0">
        <div class="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <div class="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Term Review Queue</div>
            <h2 class="text-lg font-bold text-slate-800">
              术语待复核
              <span class={`badge badge-sm ml-2 ${pending.length ? "badge-error" : "badge-success"}`}>{pending.length} 条待处理</span>
            </h2>
          </div>
          <button class="btn btn-sm btn-ghost" onClick$={() => (open.value = false)}>关闭 ✕</button>
        </div>

        <div class="flex gap-1 border-b border-slate-200 px-6 pt-3">
          <button class={`btn btn-sm rounded-b-none ${tab.value === "pending" ? "btn-primary" : "btn-ghost"}`} onClick$={() => (tab.value = "pending")}>
            待复核（{pending.length}）
          </button>
          <button class={`btn btn-sm rounded-b-none ${tab.value === "resolved" ? "btn-primary" : "btn-ghost"}`} onClick$={() => (tab.value = "resolved")}>
            已处理（{resolved.length}）
          </button>
        </div>

        <div class="max-h-[70vh] space-y-3 overflow-y-auto p-6">
          {list.length === 0 && (
            <div class="rounded-xl border border-dashed p-8 text-center text-sm text-slate-400">
              {tab.value === "pending" ? "词库新译法与已确认标识之间没有待复核项。" : "还没有处理过的复核记录。"}
            </div>
          )}
          {list.map((review) => {
            const sign = findSign(project.value, review.signId);
            return (
              <article key={review.id} class="rounded-xl border border-slate-200 p-4">
                <div class="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    class="badge badge-outline font-mono hover:badge-primary"
                    onClick$={() => {
                      open.value = false;
                      props.onSelectSign$(review.signId);
                    }}
                  >
                    {sign?.code ?? "标识已删除"}
                  </button>
                  <span class="text-slate-500">{sign?.scenario ?? "—"}</span>
                  <span class="text-slate-400">·</span>
                  <span class="text-slate-500">{review.language}</span>
                  <span class={`badge badge-sm ${review.required ? "badge-error" : "badge-ghost"}`}>{review.required ? "必选" : "可选"}</span>
                  <span class="ml-auto text-slate-400">词库 v{review.fromVersion} · {new Date(review.createdAt).toLocaleDateString()}</span>
                </div>

                <div class="mt-3 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                  <div class="rounded-lg border border-red-200 bg-red-50 p-3">
                    <div class="text-[11px] font-bold uppercase tracking-wide text-red-500">标识当前旧译法</div>
                    <div class="mt-1 break-words text-sm font-bold text-red-700 line-through decoration-2">{review.oldTarget}</div>
                    <div class="mt-1 text-[11px] text-slate-500">术语：{review.source}</div>
                  </div>
                  <div class="text-2xl text-slate-400">→</div>
                  <div class="rounded-lg border border-green-200 bg-green-50 p-3">
                    <div class="text-[11px] font-bold uppercase tracking-wide text-green-600">词库新译法</div>
                    <div class="mt-1 break-words text-sm font-bold text-green-800">{review.newTarget}</div>
                    <div class="mt-1 text-[11px] text-slate-500">
                      当前标识状态：
                      <span class="font-bold">{sign?.status === "confirmed" ? "已确认" : sign?.status === "pending" ? "待确认" : sign?.status === "changes" ? "需修改" : "草稿"}</span>
                    </div>
                  </div>
                </div>

                {sign && (
                  <div class="mt-3 rounded-lg bg-slate-900 p-3 text-xs leading-6 text-slate-100">
                    <div class="mb-1 text-[10px] uppercase tracking-wide text-slate-400">当前译文（采用后仅替换旧译法首次出现处）</div>
                    <p class="whitespace-pre-line">{sign.targetText}</p>
                  </div>
                )}

                {review.status === "pending" ? (
                  <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                    <p class="text-xs text-slate-500">采用后译文自动改词并回到<strong class="text-warning">待确认</strong>，同时生成采用前版本快照。</p>
                    <div class="flex gap-2">
                      <button class="btn btn-sm btn-outline" onClick$={() => props.onDismiss$(review.id)}>保留旧译法</button>
                      <button class="btn btn-sm btn-success" disabled={!sign} onClick$={() => props.onAdopt$(review.id)}>逐条采用</button>
                    </div>
                  </div>
                ) : (
                  <div class="mt-3 flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs">
                    <span class={`badge badge-sm ${review.status === "adopted" ? "badge-success" : "badge-ghost"}`}>
                      {review.status === "adopted" ? "已采用" : "已保留旧译法"}
                    </span>
                    <span class="text-slate-500">{review.resolutionNote}</span>
                    <span class="text-slate-400">{review.resolvedAt ? new Date(review.resolvedAt).toLocaleString() : ""}</span>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
});
