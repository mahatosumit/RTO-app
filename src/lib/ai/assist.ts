import { fieldsFor } from "@/lib/csv/mapping";
import { NDR_REASONS, type NdrReason } from "@/lib/domain/ndr";
import { getProvider, type AIProvider } from "./provider";

export interface AiLabel {
  provider: string;
  model: string;
}

function extractJson(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

/** Ask the model to map headers the deterministic matcher could not. Output is validated against whitelists. */
export async function aiSuggestMapping(
  headers: string[],
  sampleRows: Record<string, string>[],
  kind: "SHIPMENTS" | "EVENTS",
  current: Record<string, string | null>,
  provider: AIProvider | null = getProvider(),
): Promise<{ mapping: Record<string, string | null>; aiSuggested: string[]; label: AiLabel | null; error?: string }> {
  const fields = fieldsFor(kind);
  const used = new Set(Object.values(current).filter(Boolean) as string[]);
  const unmappedHeaders = headers.filter((h) => !used.has(h));
  const unmappedFields = fields.filter((f) => !current[f.key]);
  if (!provider || unmappedHeaders.length === 0 || unmappedFields.length === 0) return { mapping: current, aiSuggested: [], label: null };
  try {
    const examples = Object.fromEntries(unmappedHeaders.map((h) => [h, sampleRows.slice(0, 3).map((r) => String(r[h] ?? "").slice(0, 40))]));
    const text = await provider.complete({
      json: true,
      system: "You map CSV column headers to a fixed list of canonical fields for shipment analytics. Reply with JSON only: {\"mapping\": {\"<canonical_field>\": \"<header or null>\"}}. Use only the given headers and fields; use null when unsure.",
      user: JSON.stringify({ canonicalFields: unmappedFields.map((f) => ({ key: f.key, label: f.label })), headers: examples }),
    });
    const parsed = extractJson(text) as { mapping?: Record<string, unknown> } | null;
    const out = { ...current };
    const suggested: string[] = [];
    const taken = new Set(used);
    for (const f of unmappedFields) {
      const h = parsed?.mapping?.[f.key];
      if (typeof h === "string" && unmappedHeaders.includes(h) && !taken.has(h)) {
        out[f.key] = h;
        taken.add(h);
        suggested.push(f.key);
      }
    }
    return { mapping: out, aiSuggested: suggested, label: { provider: provider.name, model: provider.model } };
  } catch {
    return { mapping: current, aiSuggested: [], label: null, error: "AI provider unavailable — deterministic mapping shown." };
  }
}

/** Classify unknown NDR free-text into the fixed taxonomy. Results are suggestions for review only. */
export async function aiNormalizeNdrReasons(
  texts: string[],
  provider: AIProvider | null = getProvider(),
): Promise<{ suggestions: Record<string, NdrReason>; label: AiLabel | null; error?: string }> {
  const unique = [...new Set(texts.map((t) => t.trim()).filter(Boolean))].slice(0, 50);
  if (!provider || unique.length === 0) return { suggestions: {}, label: null };
  try {
    const text = await provider.complete({
      json: true,
      system: `Classify delivery-failure remarks into exactly one of: ${NDR_REASONS.join(", ")}. Reply JSON only: {"classes": {"<remark>": "<CODE>"}}.`,
      user: JSON.stringify(unique),
    });
    const parsed = extractJson(text) as { classes?: Record<string, unknown> } | null;
    const suggestions: Record<string, NdrReason> = {};
    for (const t of unique) {
      const c = parsed?.classes?.[t];
      if (typeof c === "string" && (NDR_REASONS as readonly string[]).includes(c)) suggestions[t] = c as NdrReason;
    }
    return { suggestions, label: { provider: provider.name, model: provider.model } };
  } catch {
    return { suggestions: {}, label: null, error: "AI provider unavailable — deterministic classification kept." };
  }
}

/** Natural-language narrative from structured evidence. Never used for metrics. */
export async function aiSummarize(
  evidence: unknown,
  provider: AIProvider | null = getProvider(),
): Promise<{ text: string; label: AiLabel } | null> {
  if (!provider) return null;
  try {
    const text = await provider.complete({
      maxTokens: 350,
      system: "You are an e-commerce logistics analyst. Explain the evidence in 3-5 short sentences for an operations manager. Use correlation language ('associated with', 'investigation candidate'); never claim causation. Use ONLY numbers present in the input; do not invent figures.",
      user: JSON.stringify(evidence).slice(0, 6000),
    });
    return { text: text.trim(), label: { provider: provider.name, model: provider.model } };
  } catch {
    return null;
  }
}
