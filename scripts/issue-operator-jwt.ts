// Issue a short-lived operator JWT for the chat UI.
// Usage:
//   pnpm tsx scripts/issue-operator-jwt.ts [user_id] [ttl_seconds]
import { SignJWT } from "jose";

const main = async (): Promise<void> => {
  const userId = process.argv[2] ?? process.env.OPERATOR_USER_ID ?? "operator-self";
  const ttl = Number(process.argv[3] ?? 3600);
  const key = process.env.JWT_SIGNING_KEY;
  if (!key || key.length < 32) {
    console.error("JWT_SIGNING_KEY must be set and >= 32 chars");
    process.exit(2);
  }
  const jwt = await new SignJWT({ email: process.env.OPERATOR_EMAIL ?? "", isOperator: true })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .setIssuer("autoresearcher")
    .setAudience("operator")
    .sign(new TextEncoder().encode(key));
  process.stdout.write(jwt + "\n");
};

main().catch((err) => { console.error(err); process.exit(1); });
