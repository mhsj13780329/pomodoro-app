// Dev-only helper: give an account Pro (or take it away) while payments do not exist yet.
//
//   npx tsx scripts/grant-pro.ts you@example.com           30 days of Pro
//   npx tsx scripts/grant-pro.ts you@example.com 90        90 days
//   npx tsx scripts/grant-pro.ts you@example.com lifetime  Pro forever
//   npx tsx scripts/grant-pro.ts you@example.com off       back to free
//
// Phase 7 replaces this with real payments. It writes the same two columns
// (User.proUntil and User.proLifetime) that requirePro() reads.
import { config } from "dotenv";
import { Pool } from "pg";

config({ path: ".env.local" });

async function main() {
  // A guard against pointing this at a real database by mistake.
  if (process.env.NODE_ENV === "production") throw new Error("grant-pro is for development only.");
  const [email, what = "30"] = process.argv.slice(2);
  if (!email) throw new Error("Usage: npx tsx scripts/grant-pro.ts <email> [days|lifetime|off]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is missing from .env.local");

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    let until: Date | null = null;
    let lifetime = false;
    if (what === "lifetime") lifetime = true;
    else if (what !== "off") {
      const days = Number(what);
      if (!Number.isFinite(days) || days <= 0) throw new Error(`"${what}" is not a number of days, "lifetime" or "off".`);
      until = new Date(Date.now() + days * 86_400_000);
    }
    // The column has no time zone and Prisma stores UTC in it, so send an explicit UTC instant.
    const result = await pool.query(
      `UPDATE "user" SET "proUntil" = ($2::timestamptz AT TIME ZONE 'UTC'), "proLifetime" = $3 WHERE email = $1`,
      [email, until ? until.toISOString() : null, lifetime],
    );
    if (result.rowCount === 0) throw new Error(`No account with the email ${email}.`);
    console.log(
      lifetime ? `${email}: Pro for life.` : until ? `${email}: Pro until ${until.toISOString()}.` : `${email}: back to free.`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
