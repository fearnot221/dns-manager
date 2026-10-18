import type { CSSProperties } from "react";
import { QueryPath } from "@/components/not-found-client";

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Resolver chain lights up hop by hop and ends in NXDOMAIN. */
function Resolver() {
  const hops = [".", "tw.", "edu.tw.", "ncu.edu.tw."];
  return <>
    <div className="nx-grid" aria-hidden="true" />
    <p className="nx-code" aria-hidden="true"><span>4</span><span className="nx-zero">0</span><span>4</span></p>
    <ol className="nx-chain" aria-hidden="true">
      {hops.map((hop, n) => <li key={hop} style={i(n)}><span className="nx-node" />{hop}</li>)}
      <li className="nx-fail" style={i(hops.length)}><span className="nx-node" />?</li>
    </ol>
    <div className="nx-terminal" aria-hidden="true">
      <div className="nx-terminal-bar"><i /><i /><i /></div>
      <pre><span className="nx-prompt">$</span> dig <QueryPath />{"\n"}<span className="nx-dim">;; -&gt;&gt;HEADER&lt;&lt;- opcode: QUERY, </span><span className="nx-status">status: NXDOMAIN</span>{"\n"}<span className="nx-dim">;; ANSWER SECTION:</span>{"\n"}<span className="nx-cursor" /></pre>
    </div>
  </>;
}

/** A TTL ring drains to zero, then the cached answer expires into 404. */
function Ttl() {
  return <>
    <div className="ttl-dial" aria-hidden="true">
      <svg viewBox="0 0 120 120"><circle className="ttl-track" cx="60" cy="60" r="52" /><circle className="ttl-ring" cx="60" cy="60" r="52" pathLength="100" /></svg>
      <span className="ttl-count" />
      <span className="ttl-code">404</span>
      <small>TTL</small>
    </div>
    <code className="ttl-record" aria-hidden="true"><QueryPath /> <span>0 IN A</span> <s>expired</s></code>
  </>;
}

/** A query packet crosses the wire and falls through a missing link. */
function Packet() {
  return <>
    <p className="pk-code" aria-hidden="true">{["4", "0", "4"].map((d, n) => <span key={n} style={i(n)}>{d}</span>)}</p>
    <div className="pk-wire" aria-hidden="true">
      <span className="pk-host">you</span>
      <span className="pk-line"><span className="pk-gap" /><span className="pk-packet" /></span>
      <span className="pk-host pk-host-missing">?</span>
    </div>
  </>;
}

/** A zone file types itself out; the requested name is struck from the record set. */
function ZoneFile() {
  const rows = [["@", "SOA", "ns1.ncu.edu.tw."], ["@", "NS", "ns1.ncu.edu.tw."], ["www", "A", "140.115.0.1"], ["mail", "MX", "10 mx.ncu.edu.tw."]];
  return <div className="zf" aria-hidden="true">
    <p className="zf-code">404</p>
    <pre className="zf-file">
      <span className="zf-row zf-comment" style={i(0)}>$ORIGIN ncu.edu.tw.</span>
      {rows.map(([name, type, value], n) => <span className="zf-row" key={name + type} style={i(n + 1)}><b>{name}</b><em>{type}</em>{value}</span>)}
      <span className="zf-row zf-missing" style={i(rows.length + 1)}><b><QueryPath /></b><em>?</em>; no such record</span>
    </pre>
  </div>;
}

/** A radar sweep finds every host except the one requested. */
function Radar() {
  const blips: [number, number][] = [[22, 30], [70, 24], [78, 66], [30, 74], [56, 46]];
  return <>
    <div className="rd-scope" aria-hidden="true">
      <span className="rd-sweep" />
      {blips.map(([x, y], n) => <span className="rd-blip" key={n} style={{ left: `${x}%`, top: `${y}%`, ...i(n) }} />)}
      <span className="rd-code">404</span>
    </div>
    <p className="rd-readout" aria-hidden="true"><QueryPath /> · 0 answers</p>
  </>;
}

export const notFoundVariants = { resolver: Resolver, ttl: Ttl, packet: Packet, zone: ZoneFile, radar: Radar };
