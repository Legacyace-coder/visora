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

To preview the built frontend:

    npx serve dist

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
Gallery publication requires an accepted offer with explicit permission; public
visitors can view and download the original. The backend needs the Supabase
secret key to retrieve authorized originals without making the storage bucket
public. Originals cannot be replaced after upload, and storage deletion is
blocked while a photo record exists. Review the agreement terms and test the
migrations in a non-production project before using this workflow.
The workspace migrations add profile settings, scoped agent referral reports,
a read-only administrator account overview and manual partnership review.
Agent reports include referred display names and aggregate submission activity.
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
Withdrawals, fees and account suspension are not yet implemented. Test all
migrations, authentication settings and permissions in staging before deployment.

## Important

This is a separate application from Northstar Capital.

It will have its own Supabase project, database, storage buckets, credentials and Vercel deployments.

All initial financial amounts are USD and stored as integer cents.

Never expose Supabase secret keys or Paystack secret keys in frontend code.
