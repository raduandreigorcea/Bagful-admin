# Bagful Admin

An internal desktop dashboard over Bagful's lists, catalog and the outside
services it runs on. One reader, one screen size, no public audience.

## What it is for

Answering questions about live data that the app itself cannot answer, because
the app deliberately shows each list only its own rows: how many lists
exist and how active they are, which accounts contribute products and what
people keep typing in because the catalog lacks it, what the shared catalog and
its scrapers hold, whether the three Supabase projects are answering, and what
the audit trail recorded. Sentry, OneSignal, PostHog and Clerk each get a page
that reads that service through the `admin-services` edge function.

It is **mostly a read-only tool**. Every table can be downloaded as CSV (up to
5,000 matching rows; the button says when the file is a slice). What it can
change, it changes through a guarded RPC or an `admin-services` action:

| Write | Where | Reversible | Asks first |
|---|---|---|---|
| Grant and revoke admin access | Access | yes, by the opposite action | yes |
| Delete and restore a list | List detail, Bans | yes, soft delete | yes |
| Ban and unban an account, in the app and in Clerk together | User detail, Bans | yes, by the opposite action | yes |
| Delete an account, and its Clerk user | User detail | **no**, the one hard delete | yes |
| Add, edit and remove a contributed product, one or many | Contributed | no | yes, once per batch |
| Add, edit and remove a catalog product, one or many | Catalog | no, until a scrape recreates it | yes, once per batch |
| Merge two products, or say they differ | Duplicates | yes, Undo on the merge list | no, for that reason |
| Resolve, archive or reopen a Sentry issue or feedback | Sentry | yes, by the opposite action | no, for that reason |
| Sign an account out everywhere, or make an impersonation link | User detail, Clerk | people sign back in; the link is a session you end | yes |
| Send a test push | OneSignal | no, but it reaches one phone | yes |

Everything that cannot be undone asks first. Merging and Sentry statuses do not,
deliberately: working through a few hundred duplicates with a dialog on each makes
the screen useless, and both reverse with one click. A bulk removal is a single
confirmation naming how many go, and it keeps going past a failure and says how
many did not.

Nothing here starts or cancels a scraper run. Scrapers is a read-only view of
runs that GitHub Actions makes.

## What enforces the rules

Not this bundle. Every cross-list read goes through a `security definer`
RPC in Bagful's `008_admin.sql`, and each one calls `admin_guard()` before it
returns a row. The gate in `App.vue` decides what to *render*; the database
decides what to *answer*. An account that is not in `public.admin_users` gets a
sentence here and a `42501` from Postgres either way.

That is why the keys this tool ships are the same publishable keys Bagful's own
client ships, and why there is no service-role key anywhere in it. If a panel
appears to need one, the answer is another RPC over there, not a secret in a
browser.

## Running it

```bash
npm install
cp .env.example .env   # then fill it in
npm run dev            # http://localhost:5174
```

`.env.example` is the reference for configuration and explains each variable and
why it is optional or not. Nothing here repeats it.

```bash
npm run typecheck   # vue-tsc, strict, and it covers test/ too
npm run lint
npm test
npm run build
```

## Where the explanations live

Next to the code. This repository leans on long comments at the point of use
rather than on documents that drift from it, so the reason behind a decision is
in the file that made it:

| Question | File |
|---|---|
| Why a metric can say "unavailable" instead of returning a number | `src/lib/data/types.ts` |
| Why there is no cache, and what Refresh promises | `src/lib/useQuery.ts` |
| Why a stale chunk reloads the page after a deploy | `src/router/index.ts` |
| Why the Contributed page exists, and what the Misses tab is and is not | `src/lib/data/contributed.ts` |
| Why a CSV cell gets an apostrophe, and why an export stops at 5,000 | `src/lib/csv.ts` |
| Why a ticked row is forgotten when the page changes | `src/lib/useRowSelection.ts` |
| Who may call the Sentry, OneSignal, PostHog and Clerk pages, and the secrets they need | `../supabase/functions/admin-services/index.ts` |
| Which Supabase project holds what, and the Clerk instance | `../CLAUDE.md` |
