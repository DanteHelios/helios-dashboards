"use client";

import { useActionState } from "react";
import Link from "next/link";
import { createProject, type ActionState } from "@/app/admin/projects/actions";
import ClientCombobox from "@/components/admin/ClientCombobox";
import { formatDate } from "@/lib/utils";

type Client = { id: string; name: string };

const inputCls = (err?: string) =>
  "w-full rounded-lg border px-3 py-2 text-sm text-fg-1 outline-none focus:ring-2 focus:ring-[#FF5E1A]/30 transition " +
  (err ? "border-red-400 bg-red-50" : "border-border bg-white");

export default function NewProjectForm({ clients }: { clients: Client[] }) {
  const [state, action, isPending] = useActionState<ActionState, FormData>(
    createProject,
    {}
  );

  const fe = state?.fieldErrors ?? {};
  const today = formatDate(new Date());

  return (
    <form action={action} className="space-y-5 rounded-xl border border-border bg-white p-6">
      {state?.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {/* Project name */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg-1">
          Project name <span className="text-red-400">*</span>
        </label>
        <input
          name="name"
          type="text"
          required
          placeholder="Q3 Content Engine"
          className={inputCls(fe.name)}
        />
        {fe.name && <p className="mt-1 text-xs text-red-500">{fe.name}</p>}
      </div>

      {/* Client */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg-1">
          Client <span className="text-red-400">*</span>
        </label>
        <ClientCombobox clients={clients} error={fe.clientId} />
      </div>

      {/* GitHub repo */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg-1">
          GitHub repo <span className="text-red-400">*</span>
        </label>
        <input
          name="githubRepo"
          type="text"
          required
          placeholder="owner/repo or https://github.com/owner/repo"
          className={inputCls(fe.githubRepo)}
        />
        {fe.githubRepo ? (
          <p className="mt-1 text-xs text-red-500">{fe.githubRepo}</p>
        ) : (
          <p className="mt-1 text-xs text-fg-muted">
            Invite @helios-dashboards-bot as a Read collaborator before saving.
          </p>
        )}
      </div>

      {/* GitHub branch */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg-1">
          Default branch
        </label>
        <input
          name="githubBranch"
          type="text"
          defaultValue="main"
          placeholder="main"
          className={inputCls(fe.githubBranch)}
        />
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg-1">
            Start date <span className="text-red-400">*</span>
          </label>
          <input
            name="startDate"
            type="date"
            required
            defaultValue={today}
            className={inputCls(fe.startDate)}
          />
          {fe.startDate && <p className="mt-1 text-xs text-red-500">{fe.startDate}</p>}
        </div>
        <div>
          <label className="mb-1.5 block text-sm font-medium text-fg-1">
            Target end date <span className="text-red-400">*</span>
          </label>
          <input
            name="targetEndDate"
            type="date"
            required
            className={inputCls(fe.targetEndDate)}
          />
          {fe.targetEndDate && (
            <p className="mt-1 text-xs text-red-500">{fe.targetEndDate}</p>
          )}
        </div>
      </div>

      {/* Status */}
      <div>
        <label className="mb-1.5 block text-sm font-medium text-fg-1">Status</label>
        <select name="status" defaultValue="ACTIVE" className={inputCls()}>
          <option value="ACTIVE">Active</option>
          <option value="PAUSED">Paused</option>
          <option value="COMPLETE">Complete</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 border-t border-border-soft pt-4">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-pill bg-[#FF5E1A] px-5 py-2.5 text-sm font-semibold text-white shadow-cta-glow hover:bg-[#E54E0F] disabled:opacity-60 transition-colors"
        >
          {isPending ? "Creating…" : "Create project"}
        </button>
        <Link href="/admin" className="text-sm font-medium text-fg-3 hover:text-fg-1 transition-colors">
          Cancel
        </Link>
      </div>
    </form>
  );
}
