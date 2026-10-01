/**
 * AI provider abstraction. AI is OPTIONAL: every caller must have a deterministic fallback.
 * Providers: OpenAI-compatible (also local Ollama/vLLM via AI_BASE_URL), Anthropic, mock.
 */
export interface AIRequest {
  system: string;
  user: string;
  maxTokens?: number;
  json?: boolean;
}

export interface AIProvider {
  name: string;
  model: string;
  complete(req: AIRequest): Promise<string>;
}

const TIMEOUT_MS = 15000;

export class OpenAICompatibleProvider implements AIProvider {
  name = "openai-compatible";
  constructor(
    private baseUrl: string,
    private apiKey: string | undefined,
    public model: string,
  ) {}
  async complete(req: AIRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", ...(this.apiKey ? { authorization: `Bearer ${this.apiKey}` } : {}) },
      body: JSON.stringify({
        model: this.model,
        temperature: 0.1,
        max_tokens: req.maxTokens ?? 600,
        messages: [{ role: "system", content: req.system }, { role: "user", content: req.user }],
        ...(req.json ? { response_format: { type: "json_object" } } : {}),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (!text) throw new Error("AI provider returned no content");
    return text;
  }
}

export class AnthropicProvider implements AIProvider {
  name = "anthropic";
  constructor(
    private apiKey: string,
    public model: string,
    private baseUrl = "https://api.anthropic.com",
  ) {}
  async complete(req: AIRequest): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-api-key": this.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({ model: this.model, max_tokens: req.maxTokens ?? 600, system: req.system, messages: [{ role: "user", content: req.user }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`AI provider responded ${res.status}`);
    const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
    const text = data.content?.find((c) => c.type === "text")?.text;
    if (!text) throw new Error("AI provider returned no content");
    return text;
  }
}

/** Deterministic provider for tests and offline demos. Clearly labelled MOCK. */
export class MockProvider implements AIProvider {
  name = "mock";
  model = "mock-1";
  constructor(private script?: (req: AIRequest) => string) {}
  async complete(req: AIRequest): Promise<string> {
    if (this.script) return this.script(req);
    if (req.json) return "{}";
    return `[MOCK PROVIDER — no real model was called] ${req.user.slice(0, 240)}`;
  }
}

export function getProvider(env: NodeJS.ProcessEnv = process.env): AIProvider | null {
  const explicit = (env.AI_PROVIDER ?? "").toLowerCase();
  if (explicit === "none") return null;
  if (explicit === "mock") return new MockProvider();
  const key = env.AI_API_KEY;
  if (explicit === "anthropic" || (!explicit && env.ANTHROPIC_API_KEY)) {
    const k = key ?? env.ANTHROPIC_API_KEY;
    return k ? new AnthropicProvider(k, env.AI_MODEL ?? "claude-3-5-haiku-latest", env.AI_BASE_URL) : null;
  }
  if (explicit === "openai" || explicit === "local" || explicit === "openai-compatible" || (!explicit && env.OPENAI_API_KEY)) {
    const k = key ?? env.OPENAI_API_KEY;
    const base = env.AI_BASE_URL ?? "https://api.openai.com/v1";
    if (!k && !env.AI_BASE_URL) return null;
    return new OpenAICompatibleProvider(base, k, env.AI_MODEL ?? "gpt-4o-mini");
  }
  return null;
}

/** Safe-to-expose status (never includes keys). */
export function aiStatus(env: NodeJS.ProcessEnv = process.env): { configured: boolean; provider: string | null; model: string | null } {
  const p = getProvider(env);
  return { configured: !!p, provider: p?.name ?? null, model: p?.model ?? null };
}
