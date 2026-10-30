import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { emailOTP } from "better-auth/plugins/email-otp";
import { phoneNumber } from "better-auth/plugins/phone-number";
import { env } from "./env";
import { sendEmailOtp } from "./mail";
import { OtpRateLimitError, assertOtpSendAllowed } from "./otp-rate-limit";
import { normalizeIranMobile, syntheticPhoneEmail } from "./phone";
import { prisma } from "./prisma";
import { sendSms } from "./sms";

const OTP_SECONDS = 120;

function clientIp(request: Request | undefined): string {
  if (!request) return "unknown";
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  return request.headers.get("x-real-ip") ?? "local";
}

function limitError(error: OtpRateLimitError): APIError {
  if (error.code === "OTP_COOLDOWN") {
    return new APIError("TOO_MANY_REQUESTS", {
      code: "OTP_COOLDOWN",
      message: "Wait before requesting another code",
    });
  }
  return new APIError("TOO_MANY_REQUESTS", {
    code: "OTP_RATE_LIMITED",
    message: "Too many codes requested",
  });
}

export const auth = betterAuth({
  appName: "Pomodoro",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  // httpOnly is Better Auth's default. secure follows production.
  // sameSite=lax is set here so a login cookie is not sent on cross-site POSTs.
  advanced: {
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  },
  user: {
    additionalFields: {
      locale: {
        type: "string",
        required: true,
        defaultValue: "fa",
      },
      timezone: {
        type: "string",
        required: true,
        defaultValue: "Asia/Tehran",
      },
      // Server-owned. Phase 7 writes these after a payment. Clients cannot set them.
      proUntil: {
        type: "date",
        required: false,
        input: false,
      },
      proLifetime: {
        type: "boolean",
        required: false,
        defaultValue: false,
        input: false,
      },
    },
  },
  plugins: [
    phoneNumber({
      otpLength: 6,
      expiresIn: OTP_SECONDS,
      allowedAttempts: 3,
      phoneNumberValidator: (phone) => /^\+989\d{9}$/.test(phone),
      async sendOTP({ phoneNumber: to, code }) {
        // Fire-and-forget: awaiting an SMS provider would let an attacker time the request.
        void sendSms(to, code);
      },
      signUpOnVerification: {
        // Better Auth requires an email. Phone-only accounts get a fake one
        // that cannot receive mail. The UI never shows this address.
        getTempEmail: (phone) => syntheticPhoneEmail(phone),
        getTempName: (phone) => phone,
      },
    }),
    emailOTP({
      otpLength: 6,
      expiresIn: OTP_SECONDS,
      allowedAttempts: 3,
      async sendVerificationOTP({ email, otp, type }) {
        if (type !== "sign-in") return;
        void sendEmailOtp(email, otp);
      },
    }),
  ],
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      const body = ctx.body as { phoneNumber?: unknown; email?: unknown } | undefined;
      const ip = clientIp(ctx.request);

      if (ctx.path === "/phone-number/send-otp") {
        if (typeof body?.phoneNumber !== "string") {
          throw new APIError("BAD_REQUEST", {
            code: "INVALID_PHONE_NUMBER",
            message: "Invalid phone number",
          });
        }
        const parsed = normalizeIranMobile(body.phoneNumber);
        if (!parsed.ok) {
          throw new APIError("BAD_REQUEST", {
            code: "INVALID_PHONE_NUMBER",
            message: "Invalid phone number",
          });
        }
        body.phoneNumber = parsed.e164;
        try {
          await assertOtpSendAllowed({ kind: "phone", identifier: parsed.e164, ip });
        } catch (error) {
          if (error instanceof OtpRateLimitError) throw limitError(error);
          throw error;
        }
        return;
      }

      if (ctx.path === "/email-otp/send-verification-otp") {
        if (typeof body?.email !== "string") return;
        const email = body.email.trim().toLowerCase();
        body.email = email;
        try {
          await assertOtpSendAllowed({ kind: "email", identifier: email, ip });
        } catch (error) {
          if (error instanceof OtpRateLimitError) throw limitError(error);
          throw error;
        }
      }
    }),
  },
});
