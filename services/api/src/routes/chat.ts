import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { eq, desc, asc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb, conversations as convTable, messages as msgTable } from "@autoresearcher/db";
import { requireOperator } from "../middleware/auth.js";
import { runChatTurn } from "../agents/chat.js";

export const chatRouter = new Hono();

chatRouter.get("/conversations", requireOperator, async (c) => {
  const user = c.var.user;
  const rows = await getDb()
    .select()
    .from(convTable)
    .where(eq(convTable.userId, user.sub))
    .orderBy(desc(convTable.updatedAt))
    .limit(100);
  return c.json({ items: rows });
});

chatRouter.get("/conversations/:id", requireOperator, async (c) => {
  const id = c.req.param("id");
  if (!id) return c.json({ error: "id required" }, 400);
  const user = c.var.user;
  const conv = await getDb().query.conversations.findFirst({ where: eq(convTable.id, id) });
  if (!conv || conv.userId !== user.sub) return c.json({ error: "not found" }, 404);
  const rows = await getDb()
    .select()
    .from(msgTable)
    .where(eq(msgTable.conversationId, id))
    .orderBy(asc(msgTable.createdAt));
  return c.json({ conversation: conv, messages: rows });
});

const NewBody = z.object({ title: z.string().min(1).max(200) });

chatRouter.post("/conversations", requireOperator, zValidator("json", NewBody), async (c) => {
  const user = c.var.user;
  const { title } = c.req.valid("json");
  const id = randomUUID();
  await getDb().insert(convTable).values({ id, userId: user.sub, title });
  return c.json({ id, title });
});

const SendBody = z.object({
  conversationId: z.string().uuid(),
  message: z.string().min(1).max(8000),
});

// Streams SSE events for the chat turn:
//   event: text   data: {"text": "..."}
//   event: tool   data: {"name": "...", "input": ...}
//   event: result data: {"toolUseId": "...", "output": ...}
//   event: done   data: {"inputTokens": ..., "outputTokens": ..., "costCents": "..."}
chatRouter.post("/send", requireOperator, zValidator("json", SendBody), async (c) => {
  const user = c.var.user;
  const { conversationId, message } = c.req.valid("json");
  const db = getDb();
  const conv = await db.query.conversations.findFirst({ where: eq(convTable.id, conversationId) });
  if (!conv || conv.userId !== user.sub) {
    return c.json({ error: "conversation not found" }, 404);
  }

  // Persist the user message first so reload always shows the operator's input,
  // even if the assistant generation fails partway.
  const userMsgId = randomUUID();
  await db.insert(msgTable).values({
    id: userMsgId,
    conversationId,
    role: "user",
    content: message,
  });

  // Load the prior history.
  const prior = await db
    .select({ role: msgTable.role, content: msgTable.content })
    .from(msgTable)
    .where(eq(msgTable.conversationId, conversationId))
    .orderBy(asc(msgTable.createdAt));
  const history = prior
    .filter((p) => p.role === "user" || p.role === "assistant")
    .map((p) => ({ role: p.role as "user" | "assistant", content: p.content }))
    .slice(0, -1); // drop the message we just inserted (we pass it as userMessage)

  return streamSSE(c, async (stream) => {
    let assistantText = "";
    const toolCallsForRecord: Array<{ id: string; name: string; input: Record<string, unknown> }> = [];

    try {
      for await (const step of runChatTurn({ history, userMessage: message })) {
        if (step.kind === "text") {
          assistantText += step.text;
          await stream.writeSSE({ event: "text", data: JSON.stringify({ text: step.text }) });
        } else if (step.kind === "tool_use") {
          toolCallsForRecord.push({ id: step.id, name: step.name, input: step.input });
          await stream.writeSSE({ event: "tool", data: JSON.stringify({ id: step.id, name: step.name, input: step.input }) });
        } else if (step.kind === "tool_result") {
          await stream.writeSSE({ event: "result", data: JSON.stringify({ toolUseId: step.toolUseId, output: step.output }) });
        } else if (step.kind === "done") {
          // Persist the assistant message
          await db.insert(msgTable).values({
            id: randomUUID(),
            conversationId,
            role: "assistant",
            content: assistantText,
            toolCalls: toolCallsForRecord.length > 0 ? toolCallsForRecord : null,
            inputTokens: String(step.inputTokens),
            outputTokens: String(step.outputTokens),
          });
          await stream.writeSSE({
            event: "done",
            data: JSON.stringify({ inputTokens: step.inputTokens, outputTokens: step.outputTokens, costCents: step.costCents }),
          });
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await stream.writeSSE({ event: "error", data: JSON.stringify({ error: msg }) });
    }
  });
});
