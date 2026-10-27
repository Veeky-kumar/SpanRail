import { randomUUID } from "node:crypto";

export type ObservationLevel = "DEBUG" | "DEFAULT" | "WARNING" | "ERROR";

interface IngestEventEnvelope {
  id: string;
  timestamp: string;
  type:
    | "trace-create"
    | "span-create"
    | "span-update"
    | "generation-create"
    | "generation-update"
    | "event-create"
    | "score-create";
  body: Record<string, unknown>;
}

export interface SpanrailOptions {
  publicKey: string;
  secretKey: string;
  baseUrl?: string;
  /** Flush automatically once this many events are queued. Default 20. */
  flushAt?: number;
  /** Flush automatically after this many ms since the oldest queued event. Default 2000. */
  flushIntervalMs?: number;
}

export class Spanrail {
  private queue: IngestEventEnvelope[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly opts: Required<SpanrailOptions>;

  constructor(opts: SpanrailOptions) {
    this.opts = {
      baseUrl: "http://localhost:3000",
      flushAt: 20,
      flushIntervalMs: 2000,
      ...opts,
    };
  }

  private authHeader(): string {
    return "Basic " + Buffer.from(`${this.opts.publicKey}:${this.opts.secretKey}`).toString("base64");
  }

  /** Fetches a prompt version by explicit version or label (defaults to "production"). */
  async getPrompt(
    name: string,
    opts: { version?: number; label?: string } = {},
  ): Promise<{ id: string; name: string; version: number; type: "TEXT" | "CHAT"; prompt: unknown; labels: string[]; isActive: boolean }> {
    const query = new URLSearchParams();
    if (opts.version !== undefined) query.set("version", String(opts.version));
    if (opts.label) query.set("label", opts.label);

    const res = await fetch(`${this.opts.baseUrl}/api/public/prompts/${encodeURIComponent(name)}?${query}`, {
      headers: { authorization: this.authHeader() },
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Spanrail getPrompt failed: ${res.status} ${text}`);
    }
    return res.json();
  }

  trace(params: {
    name?: string;
    userId?: string;
    sessionId?: string;
    tags?: string[];
    input?: unknown;
    metadata?: Record<string, unknown>;
  } = {}): Trace {
    // The trace IS its root observation (id === traceId) — there is no separate
    // "trace" row. Children nest under this id via parentObservationId. See
    // ARCHITECTURE.md "Core model: derived trace, not stored trace".
    const id = randomUUID();
    this.enqueue({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "trace-create",
      body: { id, traceId: id, parentObservationId: null, startTime: new Date().toISOString(), ...params },
    });
    return new Trace(this, id);
  }

  /** @internal */
  enqueue(event: IngestEventEnvelope) {
    this.queue.push(event);
    if (this.queue.length >= this.opts.flushAt) {
      void this.flush();
    } else if (!this.flushTimer) {
      this.flushTimer = setTimeout(() => void this.flush(), this.opts.flushIntervalMs);
    }
  }

  async flush(): Promise<void> {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];

    const res = await fetch(`${this.opts.baseUrl}/api/public/ingestion`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: this.authHeader(),
      },
      body: JSON.stringify({ batch }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Spanrail ingestion failed: ${res.status} ${text}`);
    }
  }

  async shutdown(): Promise<void> {
    await this.flush();
  }
}

export class Trace {
  constructor(
    private readonly client: Spanrail,
    public readonly id: string,
  ) {}

  span(params: { name?: string; input?: unknown; metadata?: Record<string, unknown> } = {}): Span {
    const id = randomUUID();
    this.client.enqueue({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "span-create",
      body: { id, traceId: this.id, parentObservationId: this.id, startTime: new Date().toISOString(), ...params },
    });
    return new Span(this.client, this.id, id);
  }

  generation(params: {
    name?: string;
    model?: string;
    modelParameters?: Record<string, unknown>;
    input?: unknown;
    metadata?: Record<string, unknown>;
    promptName?: string;
    promptVersion?: number;
  } = {}): Generation {
    const id = randomUUID();
    this.client.enqueue({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "generation-create",
      body: { id, traceId: this.id, parentObservationId: this.id, startTime: new Date().toISOString(), ...params },
    });
    return new Generation(this.client, this.id, id);
  }

  event(params: { name?: string; input?: unknown; level?: ObservationLevel; metadata?: Record<string, unknown> } = {}): void {
    this.client.enqueue({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "event-create",
      body: { id: randomUUID(), traceId: this.id, parentObservationId: this.id, startTime: new Date().toISOString(), ...params },
    });
  }

  score(params: { name: string; value?: number; stringValue?: string; comment?: string }): void {
    this.client.enqueue({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "score-create",
      body: { id: randomUUID(), traceId: this.id, ...params },
    });
  }
}

class ObservationHandle {
  constructor(
    protected readonly client: Spanrail,
    protected readonly traceId: string,
    public readonly id: string,
  ) {}

  span(params: { name?: string; input?: unknown; metadata?: Record<string, unknown> } = {}): Span {
    const id = randomUUID();
    this.client.enqueue({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "span-create",
      body: { id, traceId: this.traceId, parentObservationId: this.id, startTime: new Date().toISOString(), ...params },
    });
    return new Span(this.client, this.traceId, id);
  }

  generation(params: {
    name?: string;
    model?: string;
    modelParameters?: Record<string, unknown>;
    input?: unknown;
    metadata?: Record<string, unknown>;
    promptName?: string;
    promptVersion?: number;
  } = {}): Generation {
    const id = randomUUID();
    this.client.enqueue({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "generation-create",
      body: { id, traceId: this.traceId, parentObservationId: this.id, startTime: new Date().toISOString(), ...params },
    });
    return new Generation(this.client, this.traceId, id);
  }
}

export class Span extends ObservationHandle {
  end(params: { output?: unknown; level?: ObservationLevel; statusMessage?: string; metadata?: Record<string, unknown> } = {}) {
    this.client.enqueue({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "span-update",
      body: { id: this.id, traceId: this.traceId, endTime: new Date().toISOString(), ...params },
    });
  }
}

export class Generation extends ObservationHandle {
  end(params: {
    output?: unknown;
    usageDetails?: Record<string, number>;
    costDetails?: Record<string, number>;
    level?: ObservationLevel;
    statusMessage?: string;
    metadata?: Record<string, unknown>;
  } = {}) {
    this.client.enqueue({
      id: randomUUID(),
      timestamp: new Date().toISOString(),
      type: "generation-update",
      body: { id: this.id, traceId: this.traceId, endTime: new Date().toISOString(), ...params },
    });
  }
}
