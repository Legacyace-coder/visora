# Photography Publishing Platform

## Technology Stack

- Vanilla HTML
- CSS
- JavaScript
- TypeScript
- Tailwind CSS
- Python
- FastAPI
- Supabase PostgreSQL, Auth and Storage
- Vercel
- Paystack (payment integration phase)

No React.

## Project Structure

- frontend: Public website and photographer interface
- backend: FastAPI application
- supabase: Database and security documentation
- docs: Product specification and development plan

## Frontend Setup

    cd frontend
    npm install
    npm run build

To preview the built frontend locally, use the same hostname and port as the
backend's default CORS configuration:

    cd frontend
    py -m http.server 5500 --bind 127.0.0.1 --directory dist

Open <http://127.0.0.1:5500>. Sign-in and registration also require the
backend to be running in a separate terminal, with the Supabase settings in
`backend/.env` configured. If using a different preview origin, add its exact
URL to `FRONTEND_ORIGINS` in `backend/.env` and restart the backend. Use the
same hostname for the preview and API so session cookies work.

The appearance toggle follows the device theme until a visitor chooses light or
dark mode. Their choice is saved in browser storage across Visora pages.

## Backend Setup

    cd backend
    py -3 -m venv .venv
    .\.venv\Scripts\Activate.ps1
    pip install -r requirements-dev.txt
    Copy-Item .env.example .env
    uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

API health check:
<http://127.0.0.1:8000/health>

API documentation:
<http://127.0.0.1:8000/docs>

For deployments, set `APP_ENV=production` and configure the Supabase URL,
publishable key, and secret key in the backend environment. The secret key is
used only for server-side referral-code verification and must never be exposed
to the frontend.

Apply the SQL migrations in `supabase/migrations` to the Supabase project
before deploying. They add referral relationships, an authenticated
transactional submission RPC, and photograph metadata fields.
The photograph deletion migration also queues storage cleanup for retry.
Photographs referenced by submissions cannot be deleted.
The submission review migration separates photographer feedback from private
reviewer notes and enforces final decisions and rejection feedback. It removes
direct authenticated reads of `submissions.reviewer_notes`; clients must select
permitted columns explicitly rather than using `select *` on submissions.
The acquisition migration requires the existing `wallet_accounts` table. Offer
acceptance records one acquisition credit and adds it to the available wallet
balance in the same transaction. This is not a full ledger or proof of payout.
New offers use fixed rates of $120 per photograph first approved after
partnership approval (including at the same time) and $100 otherwise. Existing
offers keep their agreed amounts. Apply the fixed-rate migration together with
the updated backend and frontend.
Gallery publication requires an accepted offer with explicit permission; public
visitors can view and download the original. The backend needs the Supabase
secret key to retrieve authorized originals without making the storage bucket
public. Originals cannot be replaced after upload, and storage deletion is
blocked while a photo record exists. Review the agreement terms and test the
migrations in a non-production project before using this workflow.
The workspace migrations add profile settings, scoped agent referral reports,
a read-only administrator account overview and manual partnership review.
Agent reports include referred display names and aggregate submission activity.
Apply the weekly-target migration to enable partner progress on photographer
dashboards. The target is 200 unique first-time approved photos per UTC week
after partnership approval; submission approval counts every included photo.
The non-partner acquisition-limit migration caps non-partners at 160 acquired
photos and checks both submissions and offer acceptance. Apply it alongside the
updated backend and frontend. Pending work does not reserve allowance.
Profile photos are private, stored in the database, and limited to 2 MB. Email
and password changes require the current password; configure and verify the
Supabase email-confirmation settings before deployment.

Partnership card codes and images are encrypted before storage with a separate
`PARTNERSHIP_PROOF_ENCRYPTION_KEY`. Generate it with
`python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"`
and store it in the deployment secret manager, not in source control. Back it
up securely: loss or replacement without re-encryption makes existing proofs
unreadable. Administrators can view proofs, and access and decisions are
recorded. Proofs are retained until an administrator deletes them with a
reason after review; the application and audit record remain, and backups may
retain encrypted copies. Approval issues an ID but does not verify payment
automatically.
Withdrawals, separately paid withdrawal fees and audited account suspension are
implemented through the latest migration. The minimum withdrawal is $15,000;
the 25% advance fee is split into a 15% withdrawal fee and 10% company charge,
with the total rounded to the nearest whole dollar, the 15% portion rounded
separately, and the 10% portion set to the remainder. Partner exemption/return
rules are enforced by SQL. The fee is quoted before submission and checked
again when the request is created. Apply the withdrawal-fee quote migration
alongside the updated backend and frontend; existing requests keep their
original fees. Administrators must configure a fee recipient and manually
verify fee, payout and refund receipts. Suspended accounts retain read-only
access and cannot submit mutations. Apply and test the migration and all
authentication, permission and concurrent-withdrawal scenarios in staging before
deployment.

## Important

This is a separate application from Northstar Capital.

It will have its own Supabase project, database, storage buckets, credentials and Vercel deployments.

All initial financial amounts are USD and stored as integer cents.

Never expose Supabase secret keys or Paystack secret keys in frontend code.
