"use client";

import { useRef } from "react";
import { toAsciiDigits } from "@/lib/phone";

const LENGTH = 6;

type Props = {
  value: string;
  onChange: (next: string) => void;
  label: string;
  digitLabel: (index: number) => string;
};

export function OtpInput({ value, onChange, label, digitLabel }: Props) {
  const refs = useRef<Array<HTMLInputElement | null>>([]);
  const chars = Array.from({ length: LENGTH }, (_, index) => value[index] ?? "");

  function commit(next: string[]) {
    onChange(next.join("").replace(/\D/g, "").slice(0, LENGTH));
  }

  function fillFrom(index: number, raw: string) {
    const digits = toAsciiDigits(raw).replace(/\D/g, "");
    if (!digits) {
      const next = chars.slice();
      next[index] = "";
      commit(next);
      return;
    }
    const next = chars.slice();
    for (let offset = 0; offset < digits.length && index + offset < LENGTH; offset += 1) {
      next[index + offset] = digits[offset] ?? "";
    }
    commit(next);
    const focusAt = Math.min(index + digits.length, LENGTH - 1);
    refs.current[focusAt]?.focus();
  }

  return (
    <div role="group" aria-label={label} dir="ltr" className="flex justify-center gap-2">
      {chars.map((char, index) => (
        <input
          key={index}
          ref={(node) => {
            refs.current[index] = node;
          }}
          value={char}
          inputMode="numeric"
          autoComplete={index === 0 ? "one-time-code" : "off"}
          aria-label={digitLabel(index + 1)}
          className="size-11 rounded-control border border-line-strong bg-surface text-center text-lg text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          onChange={(event) => fillFrom(index, event.target.value)}
          onPaste={(event) => {
            event.preventDefault();
            fillFrom(index, event.clipboardData.getData("text"));
          }}
          onKeyDown={(event) => {
            if (event.key !== "Backspace" || chars[index] || index === 0) return;
            event.preventDefault();
            const next = chars.slice();
            next[index - 1] = "";
            commit(next);
            refs.current[index - 1]?.focus();
          }}
        />
      ))}
    </div>
  );
}
