export class PowerDNSError extends Error {
  constructor(message:string, public readonly status=502, public readonly detail?:string) { super(message); this.name="PowerDNSError"; }
}
