/**
 * Sends a login code by SMS.
 * TODO(phase-10): replace the console logger with Kavenegar or sms.ir.
 * Keep this function as the only call site so the provider can be swapped
 * without touching Better Auth.
 */
export async function sendSms(to: string, code: string): Promise<void> {
  console.info(`[sms] OTP for ${to}: ${code}`);
}
