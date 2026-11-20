# Product Specification

## Purpose

An international photography submission, acquisition and publishing platform.

Photographers submit photographs they own or are authorized to represent. The company reviews submissions, may acquire individual works or collections, and publishes selected works with appropriate photographer credits.

## Account Roles

Three account roles:
- admin: the only privileged role; assigned through trusted administration, never public registration
- photographer: the default public account role
- agent: a public account role for referral partners

No separate finance, reviewer or moderator roles.

## Photographer Features

- Registration and login
- Photographer profiles
- Recruiter ID validation
- Individual and multiple-photo submissions
- Folder and collection submissions
- Portfolio tracking
- Pending, Processing, Accepted and Rejected statuses
- Published work
- Membership plans and subscriptions
- Acquisition offers and contracts
- USD earnings and transaction history
- Withdrawal requests and status tracking

## Admin Features

- Admin dashboard
- Photographer management
- Submission and collection review
- Rejection reasons and feedback
- Membership configuration
- Acquisition offers and agreements
- Rights management
- Public gallery and featured artists
- Categories and curated collections
- Licensing enquiries
- Earnings ledger
- Audited balance adjustments
- Withdrawal and payout management
- Notifications, reports, settings and audit logs

## Financial Rules

USD is the initial currency.

All monetary values are stored as integer cents.
Example: $125.50 = 12550.

Membership payments and photography acquisition payments must be separate transaction types.

Admin balance adjustments must have two distinct actions:
- Add to balance
- Subtract from balance

Each adjustment must record the amount, reason, admin identity and timestamp.

## Payment Integration

Paystack integration will follow the Northstar Capital architecture pattern:
- Backend payment initialization
- Server-side verification
- Signed and idempotent webhooks
- Membership activation only after verified payment

Photographer payouts remain admin controlled.

Requested withdrawal methods:
- USDT
- Bank transfer
- Cash delivery

Availability and compliance must be validated before launch.

Any processing fee must be disclosed separately, including its purpose, amount, recipient, timing and refund policy. Do not silently deduct it from withdrawal principal.

## Photography Rights

Submission acceptance does not automatically transfer copyright or grant publication permission.

Agreements must define:
- Copyright assignment or licence
- Exclusivity
- Territory
- Duration
- Permitted uses
- Compensation
- Attribution

Record consent and rights clearance before publication.

## Public Website

- Home
- About
- Featured Artists
- Photography Gallery
- Categories
- Membership
- Licensing Enquiries
- Registration
- Login

## Brand

The final company identity is undecided. Any temporary name or visual identity must remain configurable.