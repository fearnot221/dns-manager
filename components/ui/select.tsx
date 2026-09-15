"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";

export type SelectOption = { value: string; label: string; disabled?: boolean };
type Props = {
  name?: string;
  value?: string | number;
  defaultValue?: string | number;
  options: SelectOption[];
  onChange?: (value: string) => void;
  disabled?: boolean;
  required?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
};

export function Select({ name, value, defaultValue, options, onChange, disabled, required, className = "", ...aria }: Props) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const controlled = value !== undefined;
  const [selected, setSelected] = useState(String(value ?? defaultValue ?? options.find((option) => !option.disabled)?.value ?? ""));
  const [open, setOpen] = useState(false);
  const current = controlled ? String(value) : selected;
  const currentOption = options.find((option) => option.value === current) ?? options[0];
  const [activeIndex, setActiveIndex] = useState(Math.max(0, options.findIndex((option) => option.value === current)));

  useEffect(() => {
    const close = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);

  function choose(option: SelectOption) {
    if (option.disabled) return;
    if (!controlled) setSelected(option.value);
    setOpen(false);
    onChange?.(option.value);
  }
  function move(step: number) {
    let next = activeIndex;
    for (let count = 0; count < options.length; count += 1) {
      next = (next + step + options.length) % options.length;
      if (!options[next]?.disabled) { setActiveIndex(next); return; }
    }
  }
  function keyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (!open && ["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) { event.preventDefault(); setActiveIndex(Math.max(0, options.findIndex((option) => option.value === current))); setOpen(true); return; }
    if (!open) return;
    if (event.key === "ArrowDown") { event.preventDefault(); move(1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); }
    else if (event.key === "Home") { event.preventDefault(); setActiveIndex(options.findIndex((option) => !option.disabled)); }
    else if (event.key === "End") { event.preventDefault(); setActiveIndex([...options].reverse().findIndex((option) => !option.disabled) < 0 ? activeIndex : options.length - 1); }
    else if (event.key === "Enter" || event.key === " ") { event.preventDefault(); if (options[activeIndex]) choose(options[activeIndex]); }
    else if (event.key === "Escape" || event.key === "Tab") setOpen(false);
  }

  return <div ref={root} className={`custom-select ${open ? "is-open" : ""} ${className}`}>
    {name && <input type="hidden" name={name} value={current} required={required} disabled={disabled} />}
    <button ref={trigger} type="button" className="custom-select-trigger" aria-haspopup="listbox" aria-expanded={open} aria-controls={id} disabled={disabled} onClick={() => { setOpen((isOpen) => !isOpen); setActiveIndex(Math.max(0, options.findIndex((option) => option.value === current))); }} onKeyDown={keyDown} {...aria}>
      <span>{currentOption?.label ?? "請選擇"}</span><ChevronDown size={16} aria-hidden="true" />
    </button>
    {open && <div id={id} className="custom-select-menu" role="listbox" aria-label={aria["aria-label"] ?? "選項"}>{options.map((option, index) => <button type="button" role="option" aria-selected={option.value === current} aria-disabled={option.disabled || undefined} disabled={option.disabled} className={index === activeIndex ? "is-active" : ""} key={option.value} onMouseEnter={() => setActiveIndex(index)} onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); move(1); } else if (event.key === "ArrowUp") { event.preventDefault(); move(-1); } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); } }} onClick={() => choose(option)}><span>{option.label}</span>{option.value === current && <Check size={16} aria-hidden="true" />}</button>)}</div>}
  </div>;
}
