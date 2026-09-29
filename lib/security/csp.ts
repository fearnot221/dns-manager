/** Styles retain inline support for existing component styles and theme transitions. */
export function contentSecurityPolicy(nonce:string,development=false) {
  return `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${development ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://authgate.ce.ncu.edu.tw`;
}
