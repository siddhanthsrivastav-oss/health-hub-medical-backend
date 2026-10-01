# Phone OTP Login

Customer login and signup use a 10-digit Indian mobile number and MSG91 OTP. Existing customer accounts with a unique mobile number on an order are linked to that number after OTP verification. If the number belongs to multiple old accounts, contact support to resolve the accounts before login.

## Setup

1. Configure `MSG91_AUTH_KEY` and `MSG91_TEMPLATE_ID` in `Backend/.env`. The approved MSG91 OTP template must support a six-digit OTP and satisfy local DLT requirements.
2. Back up the MongoDB database before changing indexes.
3. Run `npm run migrate-phone-index` from `Backend` before deploying the phone-only signup flow. This replaces the old non-sparse unique email index so multiple customers without email addresses can register. Existing email values remain unique.
4. Restart the backend and website after setting the environment variables.

Production OTP requests are sent and verified by MSG91. Customer email/password login has been removed from the public API; the separate legacy password-reset endpoints remain available for old email-based accounts.

For local testing without sending SMS or adding environment settings, requests over `localhost` or `127.0.0.1` outside production generate a random six-digit OTP. It is held in process memory for five minutes and returned for the local website's five-second toast. This preview code is not returned for non-local requests or when `NODE_ENV=production`; those requests use MSG91.