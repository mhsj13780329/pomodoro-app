"use client";

import { useId, useState, type FormEvent } from "react";
import type { WriteResult } from "../store";
import { field, secondaryButton } from "./styles";

type Props = {
  label: string;
  placeholder: string;
  button: string;
  disabled: boolean;
  maxLength: number;
  /** Returns how the write went. The text is kept unless it was added. */
  onAdd: (text: string) => WriteResult;
};

/** A one-line "type a name, press Enter" form, used for tags, subtasks and projects. */
export function InlineAdd({ label, placeholder, button, disabled, maxLength, onAdd }: Props) {
  const id = useId();
  const [text, setText] = useState("");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (disabled || !text.trim()) return;
    if (onAdd(text) === "ok") setText("");
  };

  return (
    <form onSubmit={submit} className="flex gap-2">
      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="text"
        value={text}
        maxLength={maxLength}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(event) => setText(event.target.value)}
        className={field}
      />
      <button type="submit" disabled={disabled} className={secondaryButton}>
        {button}
      </button>
    </form>
  );
}
