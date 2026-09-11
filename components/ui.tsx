import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";

export function Badge({children,tone="neutral"}:{children:React.ReactNode;tone?:"neutral"|"green"|"orange"|"blue"|"red"}){return <span className={`badge badge-${tone}`}>{children}</span>}
export function PageHeader({eyebrow,title,description,actions}:{eyebrow?:string;title:string;description?:string;actions?:React.ReactNode}){return <div className="page-head"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p className="description">{description}</p>}</div>{actions&&<div className="page-actions">{actions}</div>}</div>}
export function EmptyState({title,description,action}:{title:string;description:string;action?:React.ReactNode}){return <div className="empty"><div className="empty-icon"><AlertCircle size={20}/></div><h3>{title}</h3><p>{description}</p>{action}</div>}
export function LoadingRows({columns=6}:{columns?:number}){return <>{[0,1,2,3].map((r)=><tr key={r}>{Array.from({length:columns},(_,c)=><td key={c}><div className="skeleton" style={{width:`${55+(c%3)*15}%`}}/></td>)}</tr>)}</>}
export function SubmitButton({pending,label}:{pending:boolean;label:string}){return <button className="button primary" disabled={pending} aria-busy={pending}>{pending&&<Loader2 size={15} className="spin"/>}{pending ? "處理中…" : label}</button>}
export function Status({online=true,label}:{online?:boolean;label:string}){return <span className="status">{online?<CheckCircle2 size={14} className="success"/>:<AlertCircle size={14} className="danger"/>}{label}</span>}
