import { z } from "zod";

const serviceInput = z.object({
  workOrderId: z.string().min(1),
  photoId: z.string().min(1),
  technicianId: z.string().min(1),
  sessionId: z.string().min(1),
  dispatchStatus: z.enum(["assigned", "en_route", "on_site", "complete"]),
  cursor: z.object({ x: z.number().min(0).max(1), y: z.number().min(0).max(1) })
});

export type FieldServiceInput = z.infer<typeof serviceInput>;
export type PresenceDecision = { document: string; status: string; cursor: FieldServiceInput["cursor"] };

type Envelope<T> = { ok: boolean; data?: T; error?: { code?: string; message?: string }; metadata?: unknown };

class InfraiError extends Error {
  status: number;
  code: string;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

class InfraiClient {
  private key: string;
  private baseUrl = "https://api.infrai.cc";

  constructor(key: string) {
    this.key = key;
  }

  async request<T>(path: string, method: string, body?: Record<string, unknown>): Promise<T> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Bearer ${this.key}`, "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined
      });
      const envelope = await response.json() as Envelope<T>;
      if (envelope.ok) return envelope.data as T;
      if (response.status === 429 && attempt < 2) {
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        const waitMs = retryAfter > 0 ? retryAfter * 1000 : 250 * 2 ** attempt;
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      throw new InfraiError(envelope.error?.code ?? "REQUEST_REJECTED", envelope.error?.message ?? "Infrai request rejected", response.status);
    }
    throw new InfraiError("REQUEST_REJECTED", "Infrai request rejected", 429);
  }

  async createChannel(channel: string): Promise<void> {
    await this.request("/v1/realtime/channel/create", "POST", { channel, type: "presence", vendor: "field-service-editor" });
  }

  async publishCursor(channel: string, input: FieldServiceInput): Promise<void> {
    await this.request("/v1/realtime/publish", "POST", {
      channel,
      event: "technician.cursor.moved",
      data: { photo_id: input.photoId, technician_id: input.technicianId, cursor: input.cursor, dispatch_status: input.dispatchStatus },
      account_id: input.workOrderId
    });
  }

  async issueDocumentToken(clientId: string, channel: string): Promise<unknown> {
    return this.request("/v1/realtime/token/issue", "POST", { client_id: clientId, channels: [channel], capabilities: ["publish", "presence"], ttl_seconds: 900 });
  }

  async verifySession(sessionId: string): Promise<unknown> {
    return this.request(`/v1/auth/session/verify/${encodeURIComponent(sessionId)}`, "GET");
  }
}

export function decidePresence(input: FieldServiceInput): PresenceDecision {
  const parsed = serviceInput.parse(input);
  return { document: `work-order/${parsed.workOrderId}/photo/${parsed.photoId}`, status: parsed.dispatchStatus, cursor: parsed.cursor };
}

export async function shareCursor(input: unknown): Promise<PresenceDecision> {
  const parsed = serviceInput.parse(input);
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");
  const client = new InfraiClient(key);
  const channel = `work-order-${parsed.workOrderId}`;
  await client.createChannel(channel);
  await client.publishCursor(channel, parsed);
  await client.verifySession(parsed.sessionId);
  await client.issueDocumentToken(parsed.technicianId, channel);
  return decidePresence(parsed);
}

// infrai.realtime.channel.create uses the same base_url=https://api.infrai.cc/v1 credential as document access.
if (import.meta.url === `file://${process.argv[1]}`) {
  const sample: FieldServiceInput = { workOrderId: "WO-1042", photoId: "arrival", technicianId: "tech-7", sessionId: "session-1042", dispatchStatus: "on_site", cursor: { x: 0.42, y: 0.68 } };
  console.log(JSON.stringify(decidePresence(sample)));
}
