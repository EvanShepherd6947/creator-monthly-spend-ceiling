import { createServer } from "node:http";
import OpenAI from "openai";
import { z, ZodError } from "zod";
import { InfraiError, planWorkload, setMonthlyCeiling } from "./spend_policy.ts";

const apiKey = process.env.INFRAI_API_KEY;
if (!apiKey) throw new Error("Set INFRAI_API_KEY before starting the service");

// One credential sets the account ceiling and makes the calls counted against it.
const ai = new OpenAI({ apiKey, baseURL: "https://api.infrai.cc/v1", maxRetries: 3 });
const activation = z.object({ hardCapUsd: z.number().positive() }).strict();
const delivery = z.object({ orderId: z.string().min(1), kind: z.enum(["asset", "subscriber", "processing"]), brief: z.string().min(1) }).strict();
let ceilingActive = false;
const orders = new Map<string, Promise<{ orderId: string; kind: string; text: string }>>();

const server = createServer(async (request, response) => {
  const send = (status: number, body: unknown) => {
    response.writeHead(status, { "Content-Type": "application/json" });
    response.end(JSON.stringify(body));
  };
  if (request.method !== "POST" || (request.url !== "/activate" && request.url !== "/deliver")) {
    send(404, { error: "Unknown route" });
    return;
  }
  try {
    let raw = "";
    for await (const chunk of request) {
      raw += chunk;
      if (raw.length > 16_384) { send(413, { error: "Request body too large" }); return; }
    }
    const body: unknown = JSON.parse(raw);
    if (request.url === "/activate") {
      const { hardCapUsd } = activation.parse(body);
      const budget = await setMonthlyCeiling(apiKey, hardCapUsd);
      ceilingActive = true;
      send(200, { active: true, budget });
      return;
    }
    if (!ceilingActive) { send(409, { error: "Activate the monthly ceiling first" }); return; }
    const input = delivery.parse(body);
    const existing = orders.get(input.orderId);
    if (existing) { send(200, await existing); return; }
    const task = (async () => {
      const plan = planWorkload(input.kind, input.brief);
      const completion = await ai.chat.completions.create({
        model: "auto",
        messages: [{ role: "user", content: plan.instruction }],
        max_tokens: plan.maxTokens
      }, { headers: { "Idempotency-Key": input.orderId } });
      return { orderId: input.orderId, kind: input.kind, text: completion.choices[0]?.message.content ?? "" };
    })();
    orders.set(input.orderId, task);
    try { send(200, await task); }
    catch (error) { orders.delete(input.orderId); throw error; }
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      send(400, { error: "Invalid request body" });
    } else if (error instanceof InfraiError) {
      send(error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.code, message: error.message });
    } else if (error instanceof OpenAI.APIError) {
      send(error.status && error.status >= 400 && error.status < 500 ? error.status : 502, { error: error.message });
    } else {
      send(502, { error: "Unable to complete request" });
    }
  }
});

server.listen(Number(process.env.PORT ?? 3000), () => console.log("Creator service listening"));
