import type { Metadata } from "next";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { BackButton, QueryPath } from "@/components/not-found-client";

export const metadata: Metadata = { title: "找不到頁面" };

const hops = [".", "tw.", "edu.tw.", "ncu.edu.tw."];

export default function NotFound() {
  return <main className="nx-page">
    <div className="nx-grid" aria-hidden="true" />
    <div className="nx-shell">
      <div className="login-brand nx-brand"><Brand /></div>
      <h1 className="nx-code" aria-label="404">
        <span>4</span><span className="nx-zero">0</span><span>4</span>
      </h1>
      <ol className="nx-chain" aria-hidden="true">
        {hops.map((hop, i) => <li key={hop} style={{ "--i": i } as React.CSSProperties}><span className="nx-node" />{hop}</li>)}
        <li className="nx-fail" style={{ "--i": hops.length } as React.CSSProperties}><span className="nx-node" />?</li>
      </ol>
      <div className="nx-terminal" aria-hidden="true">
        <div className="nx-terminal-bar"><i /><i /><i /></div>
        <pre><span className="nx-prompt">$</span> dig <QueryPath />{"\n"}<span className="nx-dim">;; -&gt;&gt;HEADER&lt;&lt;- opcode: QUERY, </span><span className="nx-status">status: NXDOMAIN</span>{"\n"}<span className="nx-dim">;; ANSWER SECTION:</span>{"\n"}<span className="nx-cursor" /></pre>
      </div>
      <p className="nx-title">找不到這個頁面</p>
      <div className="nx-actions">
        <Link className="button primary" href="/">回到首頁</Link>
        <BackButton />
      </div>
    </div>
  </main>;
}
