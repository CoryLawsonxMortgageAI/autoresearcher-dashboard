import { Resend } from "resend";

let _resend: Resend | null = null;

const getResend = (): Resend | null => {
  if (_resend) return _resend;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  _resend = new Resend(key);
  return _resend;
};

export type SendResult = { ok: true; id: string } | { ok: false; reason: string };

export const sendDigest = async (args: {
  to: string;
  from: string;
  subject: string;
  html: string;
  text: string;
}): Promise<SendResult> => {
  const r = getResend();
  if (!r) return { ok: false, reason: "RESEND_API_KEY not set" };
  try {
    const res = await r.emails.send({
      from: args.from,
      to: args.to,
      subject: args.subject,
      html: args.html,
      text: args.text,
    });
    if (res.error) return { ok: false, reason: res.error.message };
    return { ok: true, id: res.data?.id ?? "unknown" };
  } catch (err) {
    return { ok: false, reason: err instanceof Error ? err.message : String(err) };
  }
};
