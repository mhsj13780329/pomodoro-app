import { IconLock } from "@/components/icons";
import { Link } from "@/i18n/navigation";

/** The Pro lock from the design spec: a `pro-bg` pill that opens Pricing. The server repeats every check. */
export function ProLock({ label }: { label: string }) {
  return (
    <Link
      href="/pricing"
      className="inline-flex min-h-11 items-center gap-1.5 rounded-pill bg-pro-bg px-3.5 text-[13px] font-semibold text-pro-ink"
    >
      <IconLock className="size-4" />
      <span>{label}</span>
    </Link>
  );
}
