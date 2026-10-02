/** Internal identities for contact data; never an SSO subject or login email. */
export function isDataAccount(email: string) { return /^contact-[0-9a-f-]+@accounts\.invalid$/i.test(email); }
