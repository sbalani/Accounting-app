# Revolut first-import option (destination review required)

This is a new **opt-in** import path for a Revolut `Current` bank-account CSV
with `Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance`.
It does not run automatically when a file is uploaded. The old generic CSV
path ignores fee-only rows, so it is blocked for this recognized statement
format rather than silently producing the wrong account balance.

The preview parses the private uploaded file again on the server. It requires
every row to be completed, ordered by completion timestamp, in one currency
matching both the account and workspace; every running balance must equal the
prior balance plus `Amount - Fee` to the cent. The opening balance is the first
row's post-movement Balance minus its net movement. The preview reports only
the proposed opening, net movements, closing, date and row/fee counts, then
requires explicit confirmation. Any excluded/edited/paired rows would invalidate
the running-balance proof, so the option imports the **whole verified statement**
with no row alterations. In the supplied local file, the parser reconciled 45
completed movements including two fee rows, with zero opening and closing;
no financial rows or personal details were saved to the repo or logs.

The server re-downloads and revalidates the file and its SHA256 digest at
confirmation. The approved **destination-only** migration
`supabase/migrations/20261115000000_revolut_initial_statement_import.sql`
creates an authenticated, RLS-respecting function that locks the selected
zero-balance bank account, requires zero transaction history and no previous
statement date, verifies currency/date/decimal sum, and in **one PostgreSQL
transaction** sets the opening balance, inserts all net movements, updates the
statement-through date and verifies the resulting balance equals the statement
closing balance. Any error rolls the whole operation back. It makes no calls
to paid AI APIs and does not reset or modify other accounts.

This code and migration have not been applied to any database or deployed.
Before rollout, review and back up only the new-host destination schema, apply
only this additive function (not historical migrations/seeds), refresh the
PostgREST schema cache if required, then test preview/import with **disposable
bank statements and accounts** under real Auth/RLS. Verify account empty/zero
eligibility, fee-only rows, rejection of altered/incomplete/mixed-currency
statements, duplicate attempts and atomic rollback on mismatched closing
balances. No private statement file or credentials belong in git.
