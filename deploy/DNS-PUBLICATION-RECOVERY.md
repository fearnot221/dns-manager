# Interrupted DNS review recovery

Before an approval writes to PowerDNS, it commits a `DnsRequestPublication` intent
on a separate DB connection. The before/after RRset snapshots and reviewer are
durable even if the response, metadata, audit or mail transaction fails.
`completedAt` commits together with the approved request and metadata.

An incomplete intent blocks rejection, user-removal cancellation and bulk account
reset. Retry approval to reconcile: an exact after snapshot completes local state
without another DNS write; an exact before snapshot may retry the intended write
after checking current applicant privileges. A different server or conflicting
RRset stops with 409 and preserves the intent. Reconciliation of an already
applied write is permitted after applicant membership/active status changes,
because it records the previously authorized result without publishing new DNS.
Reviewing administrators must still have current active administrator privileges.

For conflicts, do not mark the request rejected, clear the intent, or replay an
old RRset blindly. An operator should compare the journal, current RRset,
PowerDNS logs and any later changes, then choose a controlled repair with explicit
authorization for the affected DNS/metadata. A timeout is not proof of no change;
even a current before snapshot does not establish that an upstream operation is
no longer in flight. If the server is unavailable, preserve the pending request.

Pending pre-upgrade unit requests have no journal. Rejection additionally checks
live state and stops when DNS already matches the requested result.

Direct administrator edits and zone deletion persist a separate
`DNS_PUBLICATION_STARTED` audit event before contacting PowerDNS. It contains the
connection scope, actor, target, full before snapshot and intended after snapshot;
it never contains the deletion password. The successful domain event commits in
the same transaction as assignment retirement. Match both events by `requestId`.

If an intent has no successful domain event, treat the result as unknown even if
the API returned an error. Compare its before/after snapshots with live PowerDNS
and server logs. With explicit authorization for that target, an operator can
reconcile assignment retirement and record the confirmed result, or perform a
controlled DNS repair. Do not blindly retry a deletion or clear its evidence.
These intents are recovery evidence, not successful DNS history events.

The application zone lock serializes this application's writes; administrators changing PowerDNS outside the application must coordinate.
