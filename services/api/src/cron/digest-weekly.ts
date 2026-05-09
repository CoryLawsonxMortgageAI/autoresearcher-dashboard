// Weekly digest. Top 10 new opportunities + scoring + recommended action +
// one-tap signed-magic-link greenlight buttons. Sent via Resend.
import cron from "node-cron";
import { desc, gte } from "drizzle-orm";
import { getDb, opportunities as oppTable, users as usersTable } from "@autoresearcher/db";
import { eq } from "drizzle-orm";
import { sendDigest } from "../lib/mailer.js";
import { issueMagicLink } from "../lib/auth.js";
import { initSentry, captureException } from "../lib/sentry.js";
import type { OpportunityRow } from "@autoresearcher/db";

const SCHEDULE = process.env.DIGEST_CRON ?? "0 9 * * MON"; // Mon 09:00

export const renderDigest = async (
  opps: OpportunityRow[],
  greenlightLinks: Array<{ id: string; url: string }>,
  rejectLinks: Array<{ id: string; url: string }>
): Promise<{ html: string; text: string; subject: string }> => {
  const subject = `Autoresearcher digest — ${opps.length} new opportunities`;
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${subject}</title></head>
<body style="font-family:'JetBrains Mono','SF Mono',Menlo,monospace;background:#0a0a0a;color:#e8e8e8;padding:24px;">
<h1 style="font-size:18px;margin:0 0 16px 0;color:#fff;">autoresearcher / weekly digest</h1>
<p style="color:#888;font-size:13px;margin:0 0 24px 0;">${opps.length} opportunities passed the score floor this week.</p>
${opps
  .map((o, i) => {
    const gl = greenlightLinks.find((x) => x.id === o.id)?.url ?? "#";
    const rj = rejectLinks.find((x) => x.id === o.id)?.url ?? "#";
    return `<div style="border:1px solid #222;border-radius:6px;padding:16px;margin:0 0 12px 0;">
  <div style="font-size:11px;color:#666;letter-spacing:0.05em;">${String(i + 1).padStart(2, "0")} / ${o.verticalSlug}</div>
  <div style="font-size:16px;color:#fff;margin:4px 0;">${escapeHtml(o.title)}</div>
  <div style="font-size:13px;color:#bbb;margin:8px 0;">${escapeHtml(o.thesis.slice(0, 280))}</div>
  <div style="font-size:12px;color:#888;margin:8px 0;">score <b style="color:#7afac0;">${(o.scoreTotal / 10).toFixed(1)}</b> / 50 · rec <b>${o.recommendedAction}</b></div>
  <a href="${gl}" style="display:inline-block;padding:6px 12px;background:#0d572f;color:#fff;text-decoration:none;border-radius:4px;font-size:12px;margin-right:6px;">greenlight</a>
  <a href="${rj}" style="display:inline-block;padding:6px 12px;background:#2a1212;color:#f88;text-decoration:none;border-radius:4px;font-size:12px;">skip</a>
</div>`;
  })
  .join("\n")}
<p style="color:#555;font-size:11px;margin-top:32px;">links expire in ${Math.round(Number(process.env.MAGIC_LINK_TTL_SECONDS ?? 900) / 60)}m. one-tap auth via signed JWT.</p>
</body></html>`;

  const text = [
    "autoresearcher / weekly digest",
    "",
    ...opps.map((o, i) => {
      const gl = greenlightLinks.find((x) => x.id === o.id)?.url ?? "";
      const rj = rejectLinks.find((x) => x.id === o.id)?.url ?? "";
      return `${String(i + 1).padStart(2, "0")} ${o.verticalSlug} :: ${o.title}
   score ${(o.scoreTotal / 10).toFixed(1)}/50 · rec ${o.recommendedAction}
   ${o.thesis.slice(0, 280)}
   greenlight: ${gl}
   skip: ${rj}`;
    }),
  ].join("\n\n");
  return { html, text, subject };
};

const escapeHtml = (s: string): string =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const buildAndSend = async (dry: boolean): Promise<void> => {
  const db = getDb();
  const since = new Date(Date.now() - 7 * 24 * 3600 * 1000);
  const opps = (await db
    .select()
    .from(oppTable)
    .where(gte(oppTable.createdAt, since))
    .orderBy(desc(oppTable.scoreTotal))
    .limit(10)) as OpportunityRow[];

  const operator = await db.query.users.findFirst({ where: eq(usersTable.isOperator, true) });
  if (!operator) {
    console.warn("[digest] no operator user found; skipping");
    return;
  }

  const gl = await Promise.all(
    opps.map(async (o) => {
      const m = await issueMagicLink({ purpose: "greenlight", subjectId: o.id, userId: operator.id });
      return { id: o.id, url: m.url };
    })
  );
  const rj = await Promise.all(
    opps.map(async (o) => {
      const m = await issueMagicLink({ purpose: "reject", subjectId: o.id, userId: operator.id });
      return { id: o.id, url: m.url };
    })
  );

  const { html, text, subject } = await renderDigest(opps, gl, rj);

  if (dry) {
    console.log(`[digest] DRY RUN — would send to ${operator.email}`);
    console.log("---SUBJECT---", subject);
    console.log("---TEXT---");
    console.log(text);
    return;
  }

  const res = await sendDigest({
    to: operator.email,
    from: process.env.DIGEST_FROM ?? "autoresearcher@autoresearcher.local",
    subject, html, text,
  });
  if (!res.ok) console.error("[digest] send failed:", res.reason);
  else console.log(`[digest] sent ${res.id} to ${operator.email}`);
};

const main = async (): Promise<void> => {
  initSentry();
  const dry = process.argv.includes("--dry");
  if (dry || process.argv.includes("--once")) {
    await buildAndSend(dry);
    return;
  }
  console.log(`[digest-cron] scheduled ${SCHEDULE}`);
  cron.schedule(SCHEDULE, async () => {
    try { await buildAndSend(false); } catch (err) { captureException(err); console.error(err); }
  });
};

main().catch((err) => {
  captureException(err);
  console.error(err);
  process.exit(1);
});
