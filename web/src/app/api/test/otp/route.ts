import { readTestOtp, testOtpEnabled } from "@/lib/test-otp";

// Playwright reads the login code here. Without E2E_OTP=1 (dev and production)
// this route does not exist as far as a caller can tell.
export async function GET(request: Request) {
  if (!testOtpEnabled()) return new Response(null, { status: 404 });
  const email = new URL(request.url).searchParams.get("email");
  if (!email) return Response.json({ error: "invalid" }, { status: 400 });
  const code = readTestOtp(email);
  if (!code) return new Response(null, { status: 404 });
  return Response.json({ code });
}
