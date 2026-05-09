import { getDb, blockers as blockersTable } from "@autoresearcher/db";
import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { publishEvent } from "./pusher.js";
import type { BlockerKind } from "@autoresearcher/shared";

export type FileBlockerArgs = {
  kind: BlockerKind;
  phase: string;
  failingCommandOrOutput: string;
  diagnosis: string;
  options: Array<{ rank: 1 | 2 | 3; label: string; description: string }>;
  defaultAfter24h: string;
};

export const fileBlocker = async (args: FileBlockerArgs): Promise<{ id: string; filename: string }> => {
  const id = randomUUID();
  const ts = new Date().toISOString().slice(0, 10);
  const filename = `BLOCKER-${args.phase}-${ts}.md`;
  const body = render(args, filename);

  writeFileSync(filename, body, { flag: "w" });

  const db = getDb();
  await db.insert(blockersTable).values({
    id,
    kind: args.kind,
    phase: args.phase,
    filename,
    failingCommandOrOutput: args.failingCommandOrOutput,
    diagnosis: args.diagnosis,
    options: args.options.map((o) => ({ rank: o.rank, label: o.label, description: o.description })),
    defaultAfter24h: args.defaultAfter24h,
  });

  await publishEvent("blockers", {
    type: "blocker_filed",
    blockerId: id,
    kind: args.kind,
    filename,
    at: new Date().toISOString(),
  });

  return { id, filename };
};

const render = (a: FileBlockerArgs, filename: string): string =>
  `<!-- BLOCKER-OPEN -->
# BLOCKER — ${a.phase} — ${new Date().toISOString().slice(0, 10)}

Kind: \`${a.kind}\`
Filename: \`${filename}\`

## Failing command / output

${fence(a.failingCommandOrOutput)}

## Diagnosis

${a.diagnosis}

## Three ranked options

${a.options.sort((x, y) => x.rank - y.rank).map((o) => `### Option ${o.rank} — ${o.label}\n\n${o.description}`).join("\n\n")}

## Default after 24h

${a.defaultAfter24h}
`;

const fence = (s: string): string => "```\n" + s.trim() + "\n```";
