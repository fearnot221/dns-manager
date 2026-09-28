"use client";
import { useCallback } from "react";

export type FormDrafts = Map<string, Record<string, string>>;

/** Drafts live in the containing page, never shared across pages or login sessions. */
export function captureFormDraft(form: HTMLFormElement) {
  return Object.fromEntries([...new FormData(form)].filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}
export function restoreFormDraft(form: HTMLFormElement, draft: Record<string, string>) {
  for (const [name, value] of Object.entries(draft)) {
    const field = form.elements.namedItem(name);
    if (field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement) field.value = value;
  }
}
export function useFormDraft(drafts?: FormDrafts, key?: string) {
  const attachForm = useCallback((form: HTMLFormElement | null) => {
    if (form && drafts && key) {
      const draft = drafts.get(key);
      if (draft) restoreFormDraft(form, draft);
    }
  }, [drafts, key]);
  return {
    attachForm,
    onChange: (event: React.FormEvent<HTMLFormElement>) => { if (drafts && key) drafts.set(key, captureFormDraft(event.currentTarget)); },
    clear: () => { if (drafts && key) drafts.delete(key); },
  };
}
