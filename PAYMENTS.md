# Live Payments

Online checkout uses Razorpay Checkout. The backend creates each gateway order from current MongoDB prices, verifies the returned signature and payment amount, captures authorized payments, and reconciles `payment.captured` webhooks.

## Required setup

1. Create and verify a Razorpay merchant account. Complete the requested business KYC and link the bank account where settlements should arrive. Razorpay settles funds to that bank account, not directly to a mobile number.
2. Add the live `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` to `Backend/.env`. Never put the secret or webhook secret in the website `.env`, source code, or browser.
3. In the Razorpay dashboard, configure the webhook URL as `https://YOUR_PUBLIC_API_DOMAIN/api/order/payment/webhook` and subscribe to `payment.captured`. Use the same webhook secret in `Backend/.env`.
4. Set `CORS_ORIGINS` in `Backend/.env` to the exact HTTPS storefront and admin origins. Configure `Mongo_URI` to a persistent production MongoDB database; a local `localhost` URI will point at the cloud server after deployment, not this computer.
5. Deploy the API and both frontends over HTTPS. Complete Razorpay's website checks for contact details, delivery, cancellation/refund, privacy, and terms pages before requesting live activation.

Until live keys and the public HTTPS API/webhook are configured, online payment returns a setup message; Cash on Delivery remains available. Test the flow with Razorpay test keys before switching to live keys.