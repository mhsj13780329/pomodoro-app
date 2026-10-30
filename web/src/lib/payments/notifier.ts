// Phase 10 swaps this for a real SMS provider and a real mailer.
// Until then the script only writes the message to the log.

export interface Notifier {
  sendSms(to: string, body: string): Promise<void>;
  sendEmail(to: string, body: string): Promise<void>;
}

export function logNotifier(): Notifier {
  return {
    async sendSms(to, body) {
      console.log(`sms ${to}: ${body}`);
    },
    async sendEmail(to, body) {
      console.log(`email ${to}: ${body}`);
    },
  };
}
