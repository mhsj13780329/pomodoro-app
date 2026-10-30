import { testOtpEnabled } from "@/lib/test-otp";
import { fakePayKnown } from "@/lib/payments/fake-gateway";

// Playwright's pay button. Without E2E_OTP=1 (dev and production) this route
// does not exist as far as a caller can tell.
export async function GET(request: Request) {
  if (!testOtpEnabled()) return new Response(null, { status: 404 });
  const authority = new URL(request.url).searchParams.get("authority") ?? "";
  if (!fakePayKnown(authority)) return new Response(null, { status: 404 });
  const callback = `/api/payments/callback?Authority=${authority}&Status=OK`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Test pay</title></head><body><a href="${callback}">Pay</a></body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}
