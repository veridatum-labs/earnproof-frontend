# Authenticated session inventory (v1)

This client matches `earnproof-backend/src/auth/auth.controller.ts` and its
session DTOs: GET `/auth/sessions`, POST `/auth/sessions/{sessionId}/revoke`,
POST `/auth/sessions/revoke-all-other`, and POST `/auth/logout`.
The backend currently contains two list handlers: an array with current,
firstSeenAt and lastSeenAt, and an envelope with sessions/total and isCurrent,
createdAt and lastUsedAt. Both are explicitly validated. Contradictory identity
flags, duplicate IDs, invalid timestamps and incomplete envelopes fail closed.
The backend should consolidate these handlers; no cursor endpoint is invented.

The complete authoritative inventory is fetched once per refresh. The UI reveals
ten rows per page from that snapshot, avoiding duplicate/missing rows caused by
re-fetching a changing inventory between page clicks. Focus and explicit refresh
discard the old snapshot. Expired (now >= expiresAt) and revoked sessions do not
appear active. Legacy browser inventories are ignored. Unavailable endpoints,
authorization failures and malformed responses remove stale rows and show an error.

Only allowlisted fields reach the UI. Raw tokens, full user agents, IPs and device
fingerprints are discarded. Coarse known browser/OS labels are normalized; any
arbitrary custom label becomes Unknown device/Unknown browser. Missing historical
timestamps display Unknown, never invented dates. The server, not a client-derived
user/session ID, identifies the current device.

Remote revocation waits for the backend's status:ok and matching revokedSessionId.
This backend rejects current-session remote revocation; that row instead invokes
POST /auth/logout. Only a confirmed logout clears the in-memory token/profile,
broadcasts logout, cancels pending requests, removes application-prefixed local
and session storage (including legacy protected data), awaits CacheStorage cleanup,
and replaces the document to discard React/query/module caches. Cache access may
be disabled by the browser; authenticated requests already use no-store.

Mutations are not automatically retried. Confirmation, pending guards and status/
alert announcements prevent duplicate sends and optimistic claims of success.
Auth changes remount the workspace and abort requests. Other-session revocation
preserves the current session. Risk-history revocation uses the same server client.

Validation commands: scoped Jest/RTL suites; `npm run lint`, `npm test -- --runInBand`,
`npm run build`, `npm run test:contracts`. Fixtures are synthetic.
