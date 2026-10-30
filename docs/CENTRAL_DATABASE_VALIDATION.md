# Central database validation — 30 October 2026

Base application: Git commit `221a905`. This document records pre-release database
and application checks. The user subsequently approved the Git/Production rollout
and selected the already authenticated GitHub account `tharathip15` for this upload.
Detailed deployment/service receipts are retained in the private operator directory.

## Migration evidence

Created only the `pfig_cash` schema (9 tables), its NOLOGIN owner and the isolated
`pfig_cash_app` runtime. Imported from the Git workspace snapshot:

| Data | Rows |
| --- | ---: |
| Companies | 3 |
| Customers | 501 |
| Sales source lines | 5,956 |
| AR source bills | 1,404 |
| Receipt source lines | 5,865 |
| Cash records | 94 |

Companies: โปรเฟส, Novat, TNP. All original source fields are retained in JSONB.
SQL sales and AR sums reconcile with the original report checks to within one satang.
The runtime has no SELECT/INSERT/UPDATE/DELETE grants on any existing public,
pfig_core or pfig_hr table. No existing HR/MEMO tables were targeted by the migration.

## Checks completed

- `npm test` with the private runtime-file setting: **100 passed**, zero skipped.
- The PostgreSQL integration test uses a temporary database and removes its test
  roles/database afterward. It checks migration, isolated permissions, successful
  cash writes, idempotent retries, simultaneous revisions and a failed insert after
  projection deletion; that failure rolls back every read model and the workspace.
- Browser: 6 additional checks passed for preserved localStorage, durable offline
  pending changes, retry, lost-response idempotency, conflict blocking and recovery
  after reload. Mocked writes were confined to an isolated browser context.
- Real local browser boot read central data and persisted its normal source-AR
  edit normalization (revision 2). Source counts and cash record counts are unchanged.
- Next.js Production build passed with the new dynamic API route.
- Local Next.js health endpoint returned 200; direct backend access without the
  service secret returned 401. Secrets and browser artifacts are ignored by Git.

## Backup evidence

Before migration, an encrypted central backup was restored and all 72 existing
tables and runtime grants verified. Its SHA-256 is
`ad2368b68b2415c15f749837db51b9bf09a46c1506a0d44bf85d53c23216296e`.

After migration/browser validation, a separate Cash schema backup was encrypted,
read/decrypted back and restored into a temporary database. Every table fingerprint
matched; runtime read/write permissions and denied audit deletion were verified.
All 9 Cash tables are covered. SHA-256:
`e1a3ca8a3d1c2164803ed04f3b7b879269a2f4796ebd90c4ff6157b5f78462a3`.

Encrypted dumps, key material, role credentials and detailed manifests are in the
ACL-restricted operator directory outside Git. The source database was not a restore
target. Cash backup scheduling and off-machine recovery copies remain operational
rollout work; the separate Cash backup command is currently operator-run.

## Deliberate scope

User login/per-user permissions are deferred at the user's request. The backend
service secret is not end-user authentication. Browser-local edits from before this
migration are preserved/exportable and are not silently merged over the central DB.
The approved rollout uses an immutable local backend release supervised by a hidden
Windows logon task, a dedicated HTTPS tunnel and private runtime discovery. Endpoint
changes update configuration without creating an unattended source deployment.
