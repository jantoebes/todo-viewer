"use client";

import { useEffect, useState } from "react";

interface EditableTextProps {
  value: string;
  onCommit: (value: string) => void;
  className?: string;
  list?: string;
}

export function EditableText({ value, onCommit, className, list }: EditableTextProps) {
  const [draft, setDraft] = useState(value);

  useEffect(() => setDraft(value), [value]);

  return (
    <input
      className={className}
      list={list}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => (draft !== value ? onCommit(draft) : undefined)}
      onKeyDown={(e) => (e.key === "Enter" ? e.currentTarget.blur() : undefined)}
    />
  );
}
