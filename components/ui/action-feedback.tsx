import { AlertCircle, CheckCircle2 } from "lucide-react";

export type Feedback = { kind: "success" | "error"; message: string } | null;

export function ActionFeedback({ feedback }: { feedback: Feedback }) {
  return <div className="action-feedback">
    <div role="alert">{feedback?.kind === "error" && <p className="form-error"><AlertCircle size={18} aria-hidden="true" /><span>{feedback.message}</span></p>}</div>
    <div role="status">{feedback?.kind === "success" && <p className="form-success"><CheckCircle2 size={18} aria-hidden="true" /><span>{feedback.message}</span></p>}</div>
  </div>;
}
