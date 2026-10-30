import { rememberTestOtp } from "./test-otp";

/**
 * Sends a login code by email.
 * TODO(phase-10): deliver this through a real mail provider.
 * Dev writes the code to the server console. Do not log secrets here.
 */
export async function sendEmailOtp(to: string, code: string): Promise<void> {
  rememberTestOtp(to, code);
  console.info(`[mail] OTP for ${to}: ${code}`);
}
