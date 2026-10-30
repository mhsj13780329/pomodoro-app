"use client";

import { emailOTPClient, inferAdditionalFields, phoneNumberClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    inferAdditionalFields({
      user: {
        locale: { type: "string", required: true },
        timezone: { type: "string", required: true },
      },
    }),
    phoneNumberClient(),
    emailOTPClient(),
  ],
});
