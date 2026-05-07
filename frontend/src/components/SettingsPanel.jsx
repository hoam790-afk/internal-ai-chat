import { Save, ShieldCheck, X } from "lucide-react";
import ModelSelector from "./ModelSelector.jsx";

export default function SettingsPanel({
  open,
  onClose,
  models,
  settings,
  onChange,
  onSave,
  saving
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-red-950/35 backdrop-blur-sm">
      <section className="h-full w-full max-w-[520px] overflow-y-auto bg-white shadow-2xl">
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div>
            <h2 className="text-lg font-bold text-slate-950">Settings</h2>
            <p className="text-xs text-slate-500">OpenRouter and default assistant behavior</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md hover:bg-slate-100"
            title="Close settings"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-6 p-5">
          <div className="rounded-md border border-slate-200 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-900">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              OpenRouter API key
            </div>
            <p className="text-sm text-slate-600">
              {settings.apiKeyConfigured
                ? `Đã cấu hình (${settings.apiKeyPreview}). Key đầy đủ không bao giờ hiển thị ở frontend.`
                : "Chưa cấu hình OPENROUTER_API_KEY trong backend .env."}
            </p>
          </div>

          <ModelSelector
            models={models}
            value={settings.defaultModel || ""}
            onChange={(value) => onChange({ ...settings, defaultModel: value })}
          />

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">System Instruction mặc định</span>
            <textarea
              value={settings.defaultSystemInstruction || ""}
              onChange={(event) => onChange({ ...settings, defaultSystemInstruction: event.target.value })}
              rows={8}
              className="w-full resize-y rounded-md border border-slate-300 px-3 py-3 text-sm outline-none focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
            />
          </label>

          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Temperature: {settings.temperature}</span>
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={settings.temperature ?? 0.2}
              onChange={(event) => onChange({ ...settings, temperature: Number(event.target.value) })}
              className="w-full accent-red-700"
            />
          </label>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="brand-bg brand-hover inline-flex h-11 w-full items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Save className="h-5 w-5" />
            {saving ? "Saving..." : "Save settings"}
          </button>
        </div>
      </section>
    </div>
  );
}
