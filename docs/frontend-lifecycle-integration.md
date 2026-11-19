# Frontend lifecycle integration: #317, #318, #320 and #321

This fifth branch merges exactly the four assigned frontend issue branches for this project. Semantic API-fixture merges retain all session, share-link, trusted-source and wallet-recovery declarations; generated v1 TypeScript was regenerated and checked. Conflicting prerequisite-only edits do not replace the complete authenticated-session implementation from #318. No backend or workflow changes are included.

## Scope and server compatibility

- Sessions consume the existing authenticated inventory/revocation/logout endpoints. Current-session logout cancels pending UI work, removes app-scoped protected caches and storage, broadcasts logout and leaves the protected document. Sensitive token/IP/user-agent fields are not exposed in the inventory.
- Share links use authenticated authoritative lifecycle contracts and one-time token reveal. Backend listing/revocation/access-summary support must match the documented contract; local metadata cannot claim successful revocation or access.
- Trusted sources require tenant/network/version-bound APIs. The current owner-scoped backend CRUD is not a substitute for organization-wide disable/test/history support; missing operations fail closed.
- Wallet recovery binds proofs to a server intent and network and requires authoritative completion/cancellation/recovery state. The legacy initiation/completion signing protocol is not silently reinterpreted as this contract. Local state cannot claim account reassignment.

See the four committed feature guides and fixtures for concrete request/response schemas, cancellation, replay, expiry, authorization, accessibility and compatibility behavior. Tests use synthetic data only. Matching backend support is still a deployment dependency; a frontend-only PR cannot establish deployed end-to-end API availability.

## Combined validation

Node 24 was used. A fresh `npm ci --ignore-scripts` attempt reached its 600-second limit. The existing cache with an identical package-lock.json was then materialized using real local directories/file hardlinks, verifying core package versions against the lock. This removes the old external-junction Turbopack limitation without changing dependency versions. No cache tree is committed.

The focused Jest command covers the assigned session, proof-sharing, trusted-source and wallet-recovery stores/components: **22 suites, 149 tests passed**. Scoped ESLint over the same feature modules passed. Generated API types and the malware scan passed.

| Check | Result |
| --- | --- |
| api-types | Passed |
| malware | Passed |
| focused-tests | Passed |
| focused-lint | Passed |
| lint | Failed: baseline diagnostics recorded below |
| contracts | Failed: baseline diagnostics recorded below |
| typecheck | Failed: baseline diagnostics recorded below |
| build | Failed: baseline diagnostics recorded below |
| full-tests | Incomplete: stopped at time limit |

Full lint reports **75 errors and 172 warnings** in repository-wide legacy files. Global TypeScript reports 271 errors, with none in the primary assigned modules or regenerated v1 types. The legacy payment-account wizard prerequisite file has an existing challenge-type mismatch; its only integration diff is malformed-string/JSX quoting repair, not a change to that challenge flow. The contract-drift check still reports the existing missing ContractUpgradeReview schema in the unrelated contract-upgrades client.

The production build now reaches application compilation and reports the **nine existing missing-module/export errors**, including freighter-utils, use-session-token, organization-context, @hookform/resolvers/zod, date-fns, next-auth/react and ApiNetworkError. This is no longer reported as an external dependency-junction failure.

The full Jest run was bounded at 240 seconds and is **incomplete, not a pass**. It observed 43 failing suite paths; every observed failing path also appears in the prior comparison base's 74 failing suites (287 failed tests, 5454 passed). No new failing suite path was observed before the limit. The only upstream change since that comparison is its maintainer-authored malware-workflow repair, which this branch preserves. This does not prove that every legacy test finishes or passes.

## Commands

The exact invocations/results are recorded in the PR. Core commands are `npm run lint`, `npm run build`, `npm run test:contracts`, `node node_modules/typescript/bin/tsc --noEmit`, `node scripts/generate-api-types/index.js --check`, `node scripts/security/scan-malware.mjs`, the scoped Jest/ESLint invocations, and `npm test -- --runInBand --json --outputFile=<local-report>`.

Security scanning was also run explicitly before the integration merge commits. The existing full-suite commit hook was not rerun without a bound for every intermediate merge; the full combined-tree diagnostic above records its actual incomplete result. No hook, workflow, scanner or test expectation is weakened in the submitted diff. Hosted fork Actions approval and Vercel authorization still require repository/project-owner permissions where applicable.
