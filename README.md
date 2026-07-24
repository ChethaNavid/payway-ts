# payway-ts

> TypeScript SDK for ABA PayWay payment integration - Supports both client-side form submission and server-to-server API calls

[![npm version](https://img.shields.io/npm/v/payway-ts.svg)](https://www.npmjs.com/package/payway-ts)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An unofficial, type-safe TypeScript SDK for ABA PayWay payment integration. This SDK provides two integration patterns:

1. **Payload Builder** - Build signed payloads for client-side form submission (recommended for `abapay`)
2. **Server-to-Server** - Execute API calls directly from your server (for other payment options)

> [!WARNING]  
> This is not a product of ABA Bank. This is an unofficial implementation based on https://www.payway.com.kh/developers/

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

## Features

### Core Features (from original payway-js)
- Create transactions
- Check transaction status  
- List transactions
- HMAC-SHA512 request signing

### New Features in payway-ts
- **Full TypeScript Support** - Complete type definitions with autocomplete
- **Pre-Authorization Transactions** - Complete, cancel, and payout support with RSA encryption
- **Payout** - Distribute funds to beneficiaries, either split from a purchase or standalone from your settlement account, with beneficiary whitelist management
- **Dual Integration Modes** - Client-side form submission OR server-to-server API calls
- **Enhanced Error Handling** - Detailed API error responses with status codes and bodies
- **RSA Encryption** - Secure data encryption for sensitive operations (117-byte chunking)
- **Server-Side Security** - Build payloads securely on your server (Node.js 18+)
- **ES Modules** - Native ESM support
- **Minimal Dependencies** - Only `date-fns` for date formatting
- **Next.js Ready** - Works seamlessly with Next.js API routes
- **Smart Validation** - Prevents common mistakes (e.g., using `abapay` with server-to-server)

## Installation

```bash
npm install payway-ts
```

## Upgrading from 0.1.x

**0.2.0 adds Payout** — standalone payouts, Split & Payout on purchases, and beneficiary whitelist management. See the [Payout guide](docs/payout.md).

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

Everything else is additive: `payout` on `buildTransactionPayload()` now accepts an array as well as a base64 string, `PayloadBuilderResponse` gained the optional `body` and `contentType` fields, and the new payout methods and types are new names.

## Requirements

- Node.js 18.0.0 or higher
- ABA Bank merchant account with API credentials

## Quick Start

### Pattern 1: Client-Side Form Submission (for `abapay`)

Use this when the browser needs to submit directly to ABA PayWay.

```typescript
// Server: Build signed payload
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

// Send payload to client
return Response.json(payload);
```

```typescript
// Client: Create and submit form
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

**[See detailed guide →](docs/client-side-form-submission.md)**

### Pattern 2: Server-to-Server (for other payment options)

Use this when your server communicates directly with the ABA API.

```typescript
import { PayWayClient } from 'payway-ts';

const client = new PayWayClient(
  process.env.PAYWAY_BASE_URL!,
  process.env.PAYWAY_MERCHANT_ID!,
  process.env.PAYWAY_API_KEY!
);

// Create transaction
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
    from_date: '20240101000000',
    to_date: '20240131235959'
  })
);
```

**[See detailed guide →](docs/server-to-server.md)**

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

**[See detailed guide →](docs/payout.md)**

## Documentation

Comprehensive guides for every use case:

- **[Getting Started](docs/getting-started.md)** - Choose your integration pattern
- **[Client-Side Form Submission](docs/client-side-form-submission.md)** - Pattern 1 guide for `abapay`
- **[Server-to-Server](docs/server-to-server.md)** - Pattern 2 guide for API calls
- **[Pre-Authorization](docs/pre-authorization.md)** - Two-step payment process
- **[Payout](docs/payout.md)** - Distribute funds to beneficiaries, split or standalone
- **[API Reference](docs/api-reference.md)** - Complete method documentation
- **[Error Handling](docs/error-handling.md)** - Handle errors properly
- **[Security Best Practices](docs/security.md)** - Keep your integration secure

## Environment Variables

Create a `.env.local` file:

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

## License

MIT License - see [LICENSE](LICENSE) file for details

## Disclaimer

This is an **unofficial** SDK and is not affiliated with or endorsed by ABA Bank. Use at your own risk.

For ABA PayWay API documentation and support, please contact ABA Bank directly or visit https://www.payway.com.kh/developers/

## Author

**tykealy**

## Links

- [npm package](https://www.npmjs.com/package/payway-ts)
- [GitHub repository](https://github.com/tykealy/payway-ts)
- [Documentation](docs/README.md)
- [Original payway-js package](https://github.com/seanghay/payway-js) by Seanghay Yath
- [ABA Bank](https://www.ababank.com/)
- [PayWay Developer Docs](https://www.payway.com.kh/developers/)
