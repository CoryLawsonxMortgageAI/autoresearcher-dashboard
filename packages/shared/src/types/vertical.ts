import { z } from "zod";

export const VerticalSchema = z.object({
  slug: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string().min(3),
  description: z.string().min(10),
  queries: z.array(z.string()).min(1),
  exclusions: z.array(z.string()).optional(),
});

export const VerticalsFileSchema = z.object({
  $schema: z.string().optional(),
  version: z.string(),
  updated: z.string(),
  verticals: z.array(VerticalSchema).min(1),
  policies: z.object({
    rejectIfOutsideAllowlist: z.boolean(),
    addProcedure: z.string(),
  }),
});

export type Vertical = z.infer<typeof VerticalSchema>;
export type VerticalsFile = z.infer<typeof VerticalsFileSchema>;
