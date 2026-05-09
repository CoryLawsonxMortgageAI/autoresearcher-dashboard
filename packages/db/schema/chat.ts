import { mysqlTable, varchar, timestamp, text, mysqlEnum, json, index } from "drizzle-orm/mysql-core";

// Operator-facing chat. Each conversation belongs to a user; messages are
// roles ('user' | 'assistant' | 'tool') with optional tool-use metadata.
// We do not persist system prompts (those live in source for prompt-cache
// stability per ADR 0009).

export const conversations = mysqlTable(
  "conversations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow().onUpdateNow(),
  },
  (t) => ({
    userIdx: index("conv_user_idx").on(t.userId),
    updatedIdx: index("conv_updated_idx").on(t.updatedAt),
  })
);
export type ConversationRow = typeof conversations.$inferSelect;
export type ConversationInsert = typeof conversations.$inferInsert;

export const messages = mysqlTable(
  "messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    conversationId: varchar("conversation_id", { length: 36 }).notNull(),
    role: mysqlEnum("role", ["user", "assistant", "tool"]).notNull(),
    content: text("content").notNull(),
    // For role=assistant: structured tool calls the model requested.
    // For role=tool: results returned to the model.
    toolCalls: json("tool_calls").$type<Array<{ id: string; name: string; input: Record<string, unknown> }>>(),
    toolResultFor: varchar("tool_result_for", { length: 80 }), // tool_call_id this is responding to
    inputTokens: varchar("input_tokens", { length: 20 }),
    outputTokens: varchar("output_tokens", { length: 20 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => ({
    convIdx: index("msg_conv_idx").on(t.conversationId),
    createdIdx: index("msg_created_idx").on(t.createdAt),
  })
);
export type MessageRow = typeof messages.$inferSelect;
export type MessageInsert = typeof messages.$inferInsert;
