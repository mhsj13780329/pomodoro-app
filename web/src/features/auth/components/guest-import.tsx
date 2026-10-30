"use client";

import { useEffect } from "react";
import { importGuestData } from "@/features/auth/import-guest";
import { authClient } from "@/lib/auth-client";

/** Retries the one-time upload after login, including when the first try failed. */
export function GuestImport() {
  const { data } = authClient.useSession();
  const userId = data?.user.id;

  useEffect(() => {
    if (!userId) return;
    void importGuestData(userId);
  }, [userId]);

  return null;
}
