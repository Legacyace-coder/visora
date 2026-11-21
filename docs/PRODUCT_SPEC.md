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
- Photographer-visible review feedback is separate from internal reviewer notes.
- Rejections require feedback; accepted and rejected decisions are final.
- Accepted acquisition offers credit the agreed USD amount to the available
  wallet once; a wallet credit is not proof of withdrawal or payout.
- Published work
- Membership plans and subscriptions
- Acquisition offers and contracts
- USD earnings and transaction history
- Withdrawal requests and status tracking

The photographer dashboard displays server-side portfolio and submission totals.
Photographers can select up to 50 photos per portfolio upload. Each image is
uploaded separately (maximum 25 MB), with shared optional metadata; failed
uploads can be retried without repeating confirmed successes. Uploading does
not submit work for review.
Approved partners have a weekly target of 200 approved photos, shown on their
dashboard. Weeks run Monday 00:00 UTC to the next Monday 00:00 UTC. Each photo
counts only in the week of its first accepted submission, and only if that
first approval was at or after partnership approval. Pending and rejected
submissions do not count; counts may exceed the target.
Photographers and agents can update display names, private profile photos and
credentials. Agents can see referred display names and aggregate submission
activity; administrators have platform counts and a read-only account list.
Partnership applications support encrypted card proof and manual review.
Commissions remain separate from the implemented withdrawal and suspension
workflows.

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

The withdrawal policy requires each request to be at
least $15,000; a separately paid 25% fee is rounded to the nearest whole USD.
The 15% withdrawal fee is rounded to the nearest whole USD; the 10% company
charge is the remainder of the rounded total. Neither is a tax.
Non-partners pay for each withdrawal; partners pay again after a rejected,
refunded request, and are exempt after their first successfully paid
withdrawal. A rejected request requires a confirmed refund. Administrators
configure the fee recipient and record separate fee-payment, payout and refund
receipts. Users cannot cancel after paying the fee.

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
Gallery permission is optional in each offer. When granted, visitors can view
and download the original worldwide; copies saved by visitors may remain after
the publication is removed. Permission ends when the agreement expires or the
publication is withdrawn. Have agreement terms reviewed before use.

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
