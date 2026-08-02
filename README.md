# payway-ts — ABA PayWay TypeScript SDK

> Type-safe TypeScript SDK for ABA PayWay (ABA Bank Cambodia) payment integration — supports ABA PAY, KHQR, card payments, pre-authorization, and payout, from Node.js, Next.js, NestJS, and any modern TypeScript backend.

[![npm version of the payway-ts ABA PayWay SDK](https://img.shields.io/npm/v/payway-ts.svg)](https://www.npmjs.com/package/payway-ts)
[![payway-ts monthly npm downloads](https://img.shields.io/npm/dm/payway-ts.svg)](https://www.npmjs.com/package/payway-ts)
[![payway-ts is released under the MIT License](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/tykealy/payway-ts/blob/master/LICENSE)
[![Requires Node.js 18 or higher](https://img.shields.io/badge/node-%3E%3D18-brightgreen.svg)](https://nodejs.org/)

**payway-ts** is an unofficial, fully typed TypeScript SDK for [ABA PayWay](https://www.payway.com.kh/developers/), the online payment gateway from ABA Bank in Cambodia. It handles HMAC-SHA512 request signing, RSA encryption, and the ABA PayWay API surface, so you can accept payments in USD or KHR without writing signature code by hand.

The SDK provides two integration patterns:

1. **Payload Builder** — build signed payloads on your server for client-side form submission (required for the `abapay` payment option)
2. **Server-to-Server** — execute ABA PayWay API calls directly from your backend (for cards, KHQR, wallets, status checks, and payouts)

> [!WARNING]  
> This is not a product of ABA Bank. This is an unofficial implementation based on the public documentation at https://www.payway.com.kh/developers/

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Requirements](#requirements)
- [Quick Start](#quick-start)
  - [Pattern 1: Client-side form submission](#pattern-1-client-side-form-submission-for-abapay)
  - [Pattern 2: Server-to-server API calls](#pattern-2-server-to-server-for-other-payment-options)
- [Pre-Authorization](#pre-authorization)
- [Payout](#payout)
- [Supported Payment Options](#supported-payment-options)
- [Environment Variables](#environment-variables)
- [TypeScript Support](#typescript-support)
- [Upgrading from 0.1.x to 0.2.0](#upgrading-from-01x-to-020)
- [Documentation](#documentation)
- [Frequently Asked Questions](#frequently-asked-questions)
- [Credits](#credits)
- [License](#license)

## Features

### Core ABA PayWay features

- Create ABA PayWay transactions (purchase / checkout)
- Check transaction status by `tran_id`
- List transactions for a date range
- Close (cancel) a pending transaction before it is paid
- HMAC-SHA512 request signing, handled automatically

### What payway-ts adds

- **Full TypeScript support** — complete type definitions with editor autocomplete for every request and response
- **Pre-authorization transactions** — reserve funds, then complete or cancel later, with RSA encryption
- **Payout** — distribute funds to beneficiaries, split from a purchase or standalone from your settlement account, with beneficiary whitelist management
- **Dual integration modes** — client-side form submission *or* server-to-server API calls
- **Enhanced error handling** — detailed API error responses with HTTP status codes and response bodies
- **RSA encryption** — secure encryption for sensitive operations, including 117-byte chunking
- **Server-side security** — build payloads on your server so API keys never reach the browser (Node.js 18+)
- **ESM and CommonJS** — ships both builds, so `import` and `require` both work
- **Zero runtime dependencies** — nothing beyond the Node.js standard library
- **Next.js ready** — works in Next.js App Router and Pages Router API routes
- **Smart validation** — catches common mistakes, such as using `abapay` with server-to-server calls

## Installation

Install the ABA PayWay SDK from npm:

```bash
npm install payway-ts
```

```bash
pnpm add payway-ts
```

```bash
yarn add payway-ts
```

## Requirements

- Node.js 18.0.0 or higher
- An ABA Bank merchant account with PayWay API credentials (merchant ID and API key)
- An RSA public key from ABA, only for pre-authorization and payout operations

## Quick Start

### Pattern 1: Client-side form submission (for `abapay`)

Use this when the browser needs to submit directly to ABA PayWay — this is how ABA PAY checkout works.

```typescript
// Server: build the signed ABA PayWay payload
import { PayWayClient } from 'payway-ts';

const client = new PayWayClient(
  process.env.PAYWAY_BASE_URL!,
  process.env.PAYWAY_MERCHANT_ID!,
  process.env.PAYWAY_API_KEY!
);

const payload = client.buildTransactionPayload({
  amount: 100,
  tran_id: 'ORDER-123',
  payment_option: 'abapay',
  return_url: 'https://yoursite.com/callback'
});

// Send the payload to the client
return Response.json(payload);
```

```typescript
// Client: create and submit the checkout form
const form = document.createElement('form');
form.method = payload.method;
form.action = payload.url;

for (const [key, value] of Object.entries(payload.fields)) {
  const input = document.createElement('input');
  input.type = 'hidden';
  input.name = key;
  input.value = String(value);
  form.appendChild(input);
}

document.body.appendChild(form);
form.submit();
```

Read the full [ABA PayWay client-side form submission guide](https://github.com/tykealy/payway-ts/blob/master/docs/client-side-form-submission.md), including Next.js App Router and Pages Router examples.

### Pattern 2: Server-to-server (for other payment options)

Use this when your server communicates directly with the ABA PayWay API.

```typescript
import { PayWayClient } from 'payway-ts';

const client = new PayWayClient(
  process.env.PAYWAY_BASE_URL!,
  process.env.PAYWAY_MERCHANT_ID!,
  process.env.PAYWAY_API_KEY!
);

// Create a transaction
const result = await client.execute(
  client.buildTransactionPayload({
    amount: 100,
    tran_id: 'ORDER-123',
    payment_option: 'cards',  // NOT 'abapay'
    return_url: 'https://yoursite.com/callback'
  })
);

// Check transaction status
const status = await client.execute(
  client.buildCheckTransactionPayload('ORDER-123')
);

// List transactions
const transactions = await client.execute(
  client.buildTransactionListPayload({
    from_date: '2024-01-01 00:00:00',
    to_date: '2024-01-03 23:59:59'
  })
);

// Close a transaction that has not been paid yet
const closed = await client.execute(
  client.buildCloseTransactionPayload('ORDER-123')
);
```

Read the full [ABA PayWay server-to-server integration guide](https://github.com/tykealy/payway-ts/blob/master/docs/server-to-server.md).

## Pre-Authorization

Pre-authorization reserves funds on a customer's card or account now and captures them later — useful for bookings, rentals, and marketplace orders. Completing or cancelling a pre-auth requires the RSA public key from ABA.

```typescript
// Capture the reserved funds
const result = await client.execute(
  client.buildCompletePreAuthPayload({
    tran_id: 'ORDER-123',
    complete_amount: 100
  })
);
```

Read the full [ABA PayWay pre-authorization guide](https://github.com/tykealy/payway-ts/blob/master/docs/pre-authorization.md).

## Payout

Distribute funds to ABA account holders or ABA merchants. Beneficiaries must be whitelisted first, and all payout operations need the RSA public key from ABA.

```typescript
// 1. Whitelist the beneficiary (active immediately)
await client.execute(
  client.buildAddBeneficiaryPayload({ payee: '318111358120004' })
);

// 2a. Standalone payout — debits your settlement account
await client.execute(
  client.buildPayoutPayload({
    tran_id: 'PAYOUT-123',
    beneficiaries: [{ account: '200030000', amount: 3.44 }],
    amount: 3.44,
    currency: 'USD'
  })
);

// 2b. Or split the funds of a purchase you are collecting
client.buildTransactionPayload({
  tran_id: 'ORDER-123',
  amount: 10,
  payout: [{ acc: '000133879', amt: 7 }]  // Auto base64 encoded
});
```

Read the full [ABA PayWay payout and Split & Payout guide](https://github.com/tykealy/payway-ts/blob/master/docs/payout.md).

## Supported Payment Options

| `payment_option` | Payment method | Integration pattern |
| --- | --- | --- |
| `abapay` | ABA PAY / ABA Mobile app | Client-side form submission |
| `abapay_deeplink` | ABA PAY deeplink | Server-to-server |
| `abapay_khqr` | KHQR | Server-to-server |
| `abapay_khqr_deeplink` | KHQR deeplink | Server-to-server |
| `cards` | Visa, Mastercard, UnionPay | Server-to-server |
| `wechat` | WeChat Pay | Server-to-server |
| `alipay` | Alipay | Server-to-server |
| `google_pay` | Google Pay | Server-to-server |

Passing `abapay` to `execute()` throws a descriptive error, because ABA PayWay requires that option to be submitted by the browser.

## Environment Variables

Create a `.env.local` file with your ABA PayWay sandbox or production credentials:

```env
# Sandbox
PAYWAY_BASE_URL=https://checkout-sandbox.payway.com.kh/
PAYWAY_MERCHANT_ID=your_sandbox_merchant_id
PAYWAY_API_KEY=your_sandbox_api_key

# Production
# PAYWAY_BASE_URL=https://checkout.payway.com.kh/
# PAYWAY_MERCHANT_ID=your_production_merchant_id
# PAYWAY_API_KEY=your_production_api_key

# Optional: Required for pre-authorization and payout
# ABA_RSA_PUBLIC_KEY=your_rsa_public_key

NEXT_PUBLIC_APP_URL=https://yoursite.com
```

Never expose `PAYWAY_API_KEY` to the browser. See the [security best practices guide](https://github.com/tykealy/payway-ts/blob/master/docs/security.md).

## TypeScript Support

All methods are fully typed:

```typescript
import type { 
  PayWayClient,
  CreateTransactionParams,
  PayloadBuilderResponse,
  TransactionStatus,
  PaymentOption,
  ExecuteOptions,
  CompletePreAuthParams,
  CompletePreAuthWithPayoutParams,
  CancelPreAuthParams,
  PreAuthResponse,
  PayWayAPIError
} from 'payway-ts';

const params: CreateTransactionParams = {
  amount: 100,
  tran_id: 'ORDER-123',
  currency: 'USD',
  payment_option: 'abapay'
};

const payload: PayloadBuilderResponse = client.buildTransactionPayload(params);
```

## Upgrading from 0.1.x to 0.2.0

**0.2.0 adds Payout** — standalone payouts, Split & Payout on purchases, and beneficiary whitelist management. See the [Payout guide](https://github.com/tykealy/payway-ts/blob/master/docs/payout.md).

Runtime behavior is unchanged and no method was removed or renamed, so most projects upgrade with no edits. Two type-level changes can affect a strict `tsc` build:

**1. `execute()` can now also return `PayoutResponse | BeneficiaryResponse.`** Properties that exist on only some members of that union no longer type-check directly. In practice this is `status.tran_id`, which `BeneficiaryResponse` does not have:

```typescript
const result = await client.execute(payload);

// Before 0.2.0 this compiled; now it errors
if (typeof result !== 'string') result.status.tran_id;

// Fix 1: narrow first
if (typeof result !== 'string' && 'tran_id' in result.status) {
  result.status.tran_id;
}

// Fix 2: cast to the response you expect (what most code already does)
const status = await client.execute(
  client.buildCheckTransactionPayload('ORDER-123')
) as PaywayPaymentStatusCheckResponse;
```

`status.code` and `status.message` exist on every member and are unaffected.

**2. The missing-RSA-key error message changed** to mention payout:

```typescript
// Before: "RSA public key is required for pre-auth operations. ..."
// Now:    "RSA public key is required for pre-auth and payout operations. ..."

// Match on the stable prefix rather than the full string
if (error.message.includes('RSA public key is required')) { /* ... */ }
```

**3. `date-fns` is no longer a dependency.** It was used for a single timestamp format, now done in-house, so payway-ts has **zero runtime dependencies**. This only affects you if your own code imports `date-fns` without declaring it in your `package.json` — it was previously available by accident through npm hoisting. The fix is to declare it:

```bash
npm install date-fns
```

Everything else is additive: `payout` on `buildTransactionPayload()` now accepts an array as well as a base64 string, `PayloadBuilderResponse` gained the optional `body` and `contentType` fields, and the new payout methods and types are new names.

### New in 0.2.0: CommonJS support

0.1.x was ESM-only, so `require('payway-ts')` failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` — which broke default NestJS projects and anything else compiling to CommonJS. 0.2.0 ships both builds, so `import` and `require` both work with no configuration:

```typescript
import { PayWayClient } from 'payway-ts';        // ESM
const { PayWayClient } = require('payway-ts');   // CommonJS
```

Existing ESM consumers need no changes — the entry point is unchanged, and deep imports into `dist/` were already blocked by the exports map in 0.1.x.

## Documentation

Comprehensive ABA PayWay integration guides for every use case:

- **[Getting started with ABA PayWay in TypeScript](https://github.com/tykealy/payway-ts/blob/master/docs/getting-started.md)** — choose your integration pattern
- **[Client-side form submission](https://github.com/tykealy/payway-ts/blob/master/docs/client-side-form-submission.md)** — Pattern 1 guide for `abapay`
- **[Server-to-server](https://github.com/tykealy/payway-ts/blob/master/docs/server-to-server.md)** — Pattern 2 guide for cards, KHQR, and wallets
- **[Pre-authorization](https://github.com/tykealy/payway-ts/blob/master/docs/pre-authorization.md)** — the two-step reserve-then-capture payment process
- **[Payout](https://github.com/tykealy/payway-ts/blob/master/docs/payout.md)** — distribute funds to beneficiaries, split or standalone
- **[API reference](https://github.com/tykealy/payway-ts/blob/master/docs/api-reference.md)** — complete method, parameter, and type documentation
- **[Error handling](https://github.com/tykealy/payway-ts/blob/master/docs/error-handling.md)** — handle ABA PayWay errors properly
- **[Security best practices](https://github.com/tykealy/payway-ts/blob/master/docs/security.md)** — keep your integration secure

## Frequently Asked Questions

### What is payway-ts?

payway-ts is an unofficial TypeScript SDK for ABA PayWay, the online payment gateway from ABA Bank in Cambodia. It builds and signs API requests, executes server-to-server calls, and ships complete type definitions for every request and response.

### Is payway-ts an official ABA Bank product?

No. payway-ts is a community-maintained, unofficial SDK built against the public documentation at https://www.payway.com.kh/developers/. It is not affiliated with or endorsed by ABA Bank.

### How do I integrate ABA PayWay with Next.js?

Build the signed payload inside a Next.js API route or server action, then return it to the browser and submit it as a form for `abapay`, or call `execute()` on the server for the other payment options. Both flows are covered in the [client-side form submission guide](https://github.com/tykealy/payway-ts/blob/master/docs/client-side-form-submission.md).

### Why does `abapay` fail with server-to-server calls?

ABA PayWay requires the `abapay` payment option to be submitted directly by the browser, so it cannot be sent from your server with `execute()`. Use the payload builder pattern and submit a form from the client instead. payway-ts validates this and throws a descriptive error.

### How do I check an ABA PayWay transaction status?

Call `client.execute(client.buildCheckTransactionPayload('ORDER-123'))` with the `tran_id` you used when creating the transaction. See the [server-to-server guide](https://github.com/tykealy/payway-ts/blob/master/docs/server-to-server.md#check-transaction-status).

### Does payway-ts work with CommonJS, NestJS, and Express?

Yes. Since 0.2.0 the package ships both an ESM and a CommonJS build, so `import { PayWayClient } from 'payway-ts'` and `const { PayWayClient } = require('payway-ts')` both work on Node.js 18 or higher, with no `tsconfig` changes.

### Do I need an RSA public key?

Only for pre-authorization and payout operations. Standard transactions, status checks, and transaction lists need just your merchant ID and API key. Request the RSA public key from ABA Bank, then pass it to the client.

### Can I test ABA PayWay without a production account?

Yes. Point `PAYWAY_BASE_URL` at the sandbox endpoint `https://checkout-sandbox.payway.com.kh/` and use the sandbox merchant ID and API key issued by ABA.

## Testing

```bash
npm test
npm run test:coverage
```

## Building

```bash
npm run build
npm run typecheck
```

## Credits

This package is built upon and inspired by the excellent work of **[Seanghay Yath](https://github.com/seanghay)** and the original [payway-js](https://github.com/seanghay/payway-js) package. We've extended it with:

- Full TypeScript support with comprehensive type definitions
- **Pre-Authorization transactions** (complete, cancel, with payout)
- **Payout** (standalone payouts, Split & Payout, beneficiary whitelist)
- **RSA encryption** for sensitive operations
- Dual integration patterns (payload builder + execute)
- Enhanced error handling with detailed API responses
- Extensive documentation and examples

Special thanks to the original contributors for laying the foundation!

## License

MIT License — see the [LICENSE](https://github.com/tykealy/payway-ts/blob/master/LICENSE) file for details.

## Disclaimer

This is an **unofficial** SDK and is not affiliated with or endorsed by ABA Bank. Use at your own risk.

For ABA PayWay API documentation and support, please contact ABA Bank directly or visit https://www.payway.com.kh/developers/

## Author

**tykealy** — [GitHub](https://github.com/tykealy)

## Links

- [payway-ts on npm](https://www.npmjs.com/package/payway-ts)
- [payway-ts GitHub repository](https://github.com/tykealy/payway-ts)
- [payway-ts documentation](https://github.com/tykealy/payway-ts/blob/master/docs/README.md)
- [Report an issue](https://github.com/tykealy/payway-ts/issues)
- [Original payway-js package](https://github.com/seanghay/payway-js) by Seanghay Yath
- [ABA Bank](https://www.ababank.com/)
- [PayWay Developer Docs](https://www.payway.com.kh/developers/)
