"use client";

import { useId, useRef, useState } from "react";
import { MessageSquare, RefreshCw, Send } from "lucide-react";
import { useResource } from "@/lib/client/use-resource";
import { apiRequest, jsonRequest } from "@/lib/client/api";
import { ResourceError } from "@/components/ui/resource-error";
import { ActionFeedback, type Feedback } from "@/components/ui/action-feedback";
import { Badge, EmptyState } from "@/components/ui";

type Message = { id: string; subject: string; body: string; reply: string | null; createdAt: string; user: { name: string | null; email: string | null } };

export function ContactWorkbench({ admin }: { admin: boolean }) {
  const { data, loading, error, reload } = useResource<{ messages: Message[] }>("/api/contact");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const sending = useRef(false);
  const helpId = useId();

  async function send(form: HTMLFormElement, id?: string) {
    if (sending.current) return;
    const values = new FormData(form);
    sending.current = true;
    setPending(true);
    setFeedback(null);
    try {
      await apiRequest("/api/contact", jsonRequest(id ? "PATCH" : "POST", id
        ? { id, reply: values.get("reply") }
        : { subject: values.get("subject"), body: values.get("body") }));
      form.reset();
      setFeedback({ kind: "success", message: id ? "回覆已送出。" : "訊息已送出，可在訊息紀錄查看管理員回覆。" });
      await reload();
    } catch (error) {
      setFeedback({ kind: "error", message: error instanceof Error ? error.message : "送出失敗，請稍後再試。" });
    } finally {
      sending.current = false;
      setPending(false);
    }
  }

  return <div className="workflow-page">
    <ActionFeedback feedback={feedback} />
    <div className={admin ? "workflow-page" : "workflow-layout"}>
      {!admin && <section className="card workflow-compose" aria-labelledby="contact-compose-title">
        <header className="workflow-panel-head"><MessageSquare size={22} aria-hidden="true" /><div><h2 id="contact-compose-title">傳送訊息</h2><p>申請疑問或紀錄問題，都可以在這裡聯絡管理員。</p></div></header>
        <form className="form-surface" onSubmit={(event) => { event.preventDefault(); void send(event.currentTarget); }}>
          <fieldset className="form-fields" disabled={pending}>
            <label>主旨<input name="subject" required maxLength={150} placeholder="簡述需要協助的事項" /></label>
            <label>訊息內容<textarea name="body" required maxLength={5000} rows={6} placeholder="提供相關 DNS 名稱與問題說明" aria-describedby={helpId} /></label>
            <p className="field-help" id={helpId}>僅站內通知，不會寄送郵件。請勿提供密碼或 API key。</p>
            <div className="form-actions"><button className="button primary" aria-busy={pending}><Send size={16} aria-hidden="true" />{pending ? "傳送中…" : "傳送訊息"}</button></div>
          </fieldset>
        </form>
      </section>}
      <section className="workflow-history" aria-labelledby="contact-history-title">
        <header className="workflow-list-head"><h2 id="contact-history-title">{admin ? "使用者訊息" : "我的訊息"}</h2><button type="button" className="button" disabled={loading || pending} onClick={() => void reload()}><RefreshCw size={16} aria-hidden="true" />重新整理</button></header>
        {error ? <ResourceError message={error} retry={reload} /> : loading ? <p className="workflow-loading" role="status">載入訊息中…</p> : !data?.messages.length
          ? <div className="card"><EmptyState title="尚無訊息" description={admin ? "收到使用者的問題後，可在這裡回覆。" : "傳送訊息後，對話紀錄與回覆會顯示在這裡。"} /></div>
          : <div className="workflow-list">{data.messages.map((message) => <article className="card message-card" key={message.id}>
            <div className="message-heading"><h3>{message.subject}</h3><Badge tone={message.reply ? "green" : "neutral"}>{message.reply ? "已回覆" : "待回覆"}</Badge></div>
            <p className="workflow-meta"><span>{message.user.name || "使用者"}{admin && message.user.email ? ` · ${message.user.email}` : ""}</span><time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleString("zh-TW")}</time></p>
            <p className="message-body">{message.body}</p>
            {message.reply ? <div className="message-reply"><strong>管理員回覆</strong><p className="message-body">{message.reply}</p></div>
              : admin ? <form className="form-surface message-reply" onSubmit={(event) => { event.preventDefault(); void send(event.currentTarget, message.id); }}>
                <label>回覆<textarea name="reply" required maxLength={5000} rows={3} disabled={pending} /></label>
                <div className="form-actions"><button className="button" disabled={pending}>{pending ? "傳送中…" : "送出回覆"}</button></div>
              </form> : <p className="field-help">管理員回覆後會顯示在此處。</p>}
          </article>)}</div>}
      </section>
    </div>
  </div>;
}
