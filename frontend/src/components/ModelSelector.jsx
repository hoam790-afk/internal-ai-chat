import { ChevronDown } from "lucide-react";

function formatPrice(value) {
  if (value === null || value === undefined || value === "") return "n/a";
  const number = Number(value);
  if (Number.isNaN(number)) return String(value);
  return `$${number.toFixed(6)}`;
}

export default function ModelSelector({ models, value, onChange, compact = false }) {
  const selected = models.find((model) => model.id === value);

  return (
    <label className="block">
      {!compact && <span className="mb-2 block text-xs font-semibold uppercase tracking-wide text-slate-500">Model</span>}
      <div className="relative">
        <select
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          className="h-11 w-full appearance-none rounded-md border border-slate-300 bg-white px-3 pr-9 text-sm font-medium text-slate-800 outline-none transition focus:border-slate-700 focus:ring-2 focus:ring-slate-200"
        >
          {!value && <option value="">Chọn model</option>}
          {models.map((model) => (
            <option key={model.id} value={model.id}>
              {model.name} - {model.id}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-3 h-5 w-5 text-slate-500" />
      </div>
      {!compact && selected && (
        <div className="mt-2 grid gap-1 rounded-md bg-slate-100 p-3 text-xs text-slate-600">
          <span>Provider: {selected.provider || "n/a"}</span>
          <span>Context: {selected.contextLength ? selected.contextLength.toLocaleString() : "n/a"}</span>
          <span>Input: {formatPrice(selected.pricing?.prompt)} / Output: {formatPrice(selected.pricing?.completion)}</span>
        </div>
      )}
    </label>
  );
}
