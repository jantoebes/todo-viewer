"use client";

import { useState } from "react";
import {
  Combobox,
  ComboboxInput,
  ComboboxOptions,
  ComboboxOption,
} from "@headlessui/react";

interface ChipsMultiSelectProps {
  options: string[];
  value: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
}

export function ChipsMultiSelect({ options, value, onChange, placeholder }: ChipsMultiSelectProps) {
  const [query, setQuery] = useState("");

  const filtered =
    query === ""
      ? options
      : options.filter((o) => o.toLowerCase().includes(query.toLowerCase()));

  function handleChange(next: string[]) {
    onChange(next);
    setQuery("");
  }

  return (
    <div className="chips-select">
      {value.length > 0 && (
        <div className="chips-select-chips">
          {value.map((v) => (
            <span key={v} className="chip">
              {v}
              <button
                type="button"
                aria-label={`${v} verwijderen`}
                onClick={() => onChange(value.filter((x) => x !== v))}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <Combobox multiple value={value} onChange={handleChange}>
        <ComboboxInput
          className="chips-select-input"
          placeholder={placeholder ?? "filter..."}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <ComboboxOptions anchor="bottom start" className="chips-select-options">
          {filtered.length === 0 && (
            <div className="chips-select-empty">geen opties</div>
          )}
          {filtered.map((opt) => (
            <ComboboxOption key={opt} value={opt} className="chips-select-option">
              {({ selected }) => (
                <>
                  {selected ? "✓ " : "  "}
                  {opt}
                </>
              )}
            </ComboboxOption>
          ))}
        </ComboboxOptions>
      </Combobox>
    </div>
  );
}
