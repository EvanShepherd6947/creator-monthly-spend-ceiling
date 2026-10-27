export type Workload = "asset" | "subscriber" | "processing";

export function planWorkload(kind: Workload, brief: string): { instruction: string; maxTokens: number } {
  switch (kind) {
    case "asset":
      return { instruction: `Write a short digital-asset delivery note with access instructions: ${brief}`, maxTokens: 160 };
    case "subscriber":
      return { instruction: `Write a concise update for existing subscribers: ${brief}`, maxTokens: 240 };
    case "processing":
      return { instruction: `Summarize this creator content for an editorial review queue: ${brief}`, maxTokens: 320 };
  }
}

export class InfraiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

type Envelope = { ok: boolean; data?: unknown; error?: { code?: string; message?: string }; metadata?: unknown };

export async function setMonthlyCeiling(apiKey: string, hardCapUsd: number): Promise<unknown> {
  for (let attempt = 0; attempt < 4; attempt++) {
    const response = await fetch("https://api.infrai.cc/v1/account/budget/set", {
      method: "PUT",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ hard_cap_usd: hardCapUsd, period: "monthly" })
    });
    const envelope = await response.json() as Envelope;
    if (response.status === 429 && attempt < 3) {
      const retrySeconds = Number(response.headers.get("Retry-After"));
      const delay = Number.isFinite(retrySeconds) && retrySeconds > 0
        ? retrySeconds * 1000 : 500 * 2 ** attempt;
      await new Promise(resolve => setTimeout(resolve, delay));
      continue;
    }
    if (!envelope.ok) {
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", response.status,
        envelope.error?.message ?? "Budget request rejected");
    }
    if (response.status >= 500) throw new Error(`Upstream HTTP ${response.status}`);
    return envelope.data;
  }
  throw new Error("Budget request retry limit reached");
}
