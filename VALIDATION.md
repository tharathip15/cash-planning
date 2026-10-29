# Validation — reports update

- Next.js production build: passed (16.4.3)
- Report public JavaScript syntax: passed
- Monthly data: 450 rows; all monthly sums reconciled against Excel cached totals
- Customer/credit data: 241 rows; preserved blank credit terms
- Browser static preview: both report pages, company/month filters, search and reset verified
- Selected October/customer totals verified
- XLSX export: selected rows, totals, numeric values, fills and frozen header verified
- Next.js browser interactions not separately retested; the same public report modules were tested in static preview
- Reports are workbook snapshots, independent of cash/AR localStorage

Automatic workbook update: real workbook parsing passed (450 monthly / 241 credit rows); reordered credit headers, missing sheet rejection, uncached formula rejection, snapshot persistence/backup and failed-save protection passed. UI update controls verified. Native browser file chooser end-to-end not exercised. Next.js build passed.

Raw source workflow: builder and mapping verified with fixtures covering cross-company identical codes/bills, signed credit notes, prior-year AR, partial-receipt weighted days, duplicate AR rejection, unmatched receipts, overpayment rejection, blank versus zero credit and BE dates. Existing report import/export regression checks passed. Browser modal and incomplete-input blocking verified. Native chooser upload-to-commit was not fully exercised. Next.js production build passed.

Sales-derived credit update: tested no supplemental master, multi-credit preservation, names/payment terms from sales, separate companies, zero credit and duplicate supplemental rejection. Browser verified supplemental section collapsed and no required standalone master. Next.js build passed. Full browser upload-to-commit not retested.

Linked-system update: single-sheet report preservation, per-source caching, sales-only AR staging, cross-company duplicate protection, skip existing/pending, historical reduction, missing required fields, rollback, after-snapshot receipt adjustment, actual amount selection, uncertainty exclusion, idempotent/capped report reductions passed. Real AR validation and syncAllArPlans exercised: incomplete drafts rejected, repeated sync no duplicate, confirmed partial receipt reduces remaining plan. Browser verified AR entry button, scope selector and modal. End-to-end native file chooser import-to-confirm remains untested. Next.js production build passed; final public JS changes syntax-checked.
