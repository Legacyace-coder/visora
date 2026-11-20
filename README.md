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
http://127.0.0.1:8000/health

API documentation:
http://127.0.0.1:8000/docs

For deployments, set `APP_ENV=production` and configure the Supabase URL,
publishable key, and secret key in the backend environment. The secret key is
used only for server-side referral-code verification and must never be exposed
to the frontend.

Apply the SQL migration in `supabase/migrations` to the Supabase project before
deploying referral registration or submission creation. It adds referral
relationship columns and an authenticated, transactional RPC for creating
submissions and their items together.

## Important

This is a separate application from Northstar Capital.

It will have its own Supabase project, database, storage buckets, credentials and Vercel deployments.

All initial financial amounts are USD and stored as integer cents.

Never expose Supabase secret keys or Paystack secret keys in frontend code.