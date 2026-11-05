"use client";

import { useId } from "react";
import { useTranslations } from "next-intl";
import type { TagWire } from "@/lib/tasks/contract";
import { field } from "./styles";

type Props = {
  /** "" = every tag, otherwise a tag id. */
  tag: string;
  onChange: (tag: string) => void;
  tags: TagWire[];
};

/** Pro: narrow the list by tag. Projects have their own bar. */
export function TaskFilterBar({ tag, onChange, tags }: Props) {
  const t = useTranslations("tasks");
  const id = useId();
  return (
    <div className="flex items-center gap-2 text-sm text-muted">
      <label htmlFor={id} className="shrink-0">
        {t("filterTag")}
      </label>
      <select
        id={id}
        value={tag}
        onChange={(event) => onChange(event.target.value)}
        className={`${field} max-w-60 text-ink`}
      >
        <option value="">{t("filterAll")}</option>
        {tags.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </div>
  );
}
