# Server-to-Server (Pattern 2)

**Best for:** All payment options except `abapay`, transaction checks, and transaction lists

This pattern allows your server to communicate directly with the ABA PayWay API. Use this when you need JSON responses from the API.

## When to Use

- Payment options: `cards`, `wechat`, `alipay`, `bakong` (anything except `abapay`)
- Checking transaction status
- Retrieving transaction lists
- Any operation that returns JSON

## How It Works

Instead of sending the payload to the client, your server executes the API call directly using the `execute()` method.

```typescript
// Build payload
const payload = client.buildTransactionPayload({ ... });

// Execute directly from server
const result = await client.execute(payload);
```

## Create Transaction

### Simple Example

```typescript
// app/api/payment/process/route.ts
import { PayWayClient } from 'payway-ts';

const client = new PayWayClient(
  process.env.PAYWAY_BASE_URL!,
  process.env.PAYWAY_MERCHANT_ID!,
  process.env.PAYWAY_API_KEY!
);

export async function POST(request: Request) {
  const { amount, orderId } = await request.json();
  
  try {
    // Build and execute in one step
    const result = await client.execute(
      client.buildTransactionPayload({
        tran_id: orderId,
        amount: amount,
        currency: 'USD',
        payment_option: 'cards',  // NOT 'abapay'
        return_url: 'https://yoursite.com/callback'
      })
    );
    
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

### Process Card Payment

```typescript
// app/api/payment/card/route.ts
import { PayWayClient } from 'payway-ts';

const client = new PayWayClient(
  process.env.PAYWAY_BASE_URL!,
  process.env.PAYWAY_MERCHANT_ID!,
  process.env.PAYWAY_API_KEY!
);

export async function POST(request: Request) {
  const { amount, orderId, customerEmail } = await request.json();
  
  try {
    // Server-to-server for card payments
    const result = await client.execute(
      client.buildTransactionPayload({
        tran_id: orderId,
        amount,
        currency: 'USD',
        payment_option: 'cards',  // NOT abapay
        email: customerEmail,
        return_url: `${process.env.NEXT_PUBLIC_APP_URL}/payment/callback`
      })
    );
    
    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

## Check Transaction Status

Check the status of a transaction by its transaction ID.

```typescript
// app/api/payment/status/[tranId]/route.ts
import { PayWayClient } from 'payway-ts';

const client = new PayWayClient(
  process.env.PAYWAY_BASE_URL!,
  process.env.PAYWAY_MERCHANT_ID!,
  process.env.PAYWAY_API_KEY!
);

export async function GET(
  request: Request,
  { params }: { params: { tranId: string } }
) {
  try {
    const status = await client.execute(
      client.buildCheckTransactionPayload(params.tranId)
    );
    
    return Response.json(status);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

**Simple usage:**

```typescript
// Check a transaction
const status = await client.execute(
  client.buildCheckTransactionPayload('ORDER-123')
);

console.log('Transaction status:', status);
```

## List Transactions

Retrieve a list of transactions with optional filters.

```typescript
// app/api/payment/list/route.ts
import { PayWayClient } from 'payway-ts';

const client = new PayWayClient(
  process.env.PAYWAY_BASE_URL!,
  process.env.PAYWAY_MERCHANT_ID!,
  process.env.PAYWAY_API_KEY!
);

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const status = searchParams.get('status');
  
  try {
    const transactions = await client.execute(
      client.buildTransactionListPayload({
        status: status as any,
        from_date: '2024-01-01 00:00:00',
        to_date: '2024-01-03 23:59:59'
      })
    );
    
    return Response.json(transactions);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

**Simple usage:**

```typescript
// Get transaction list
const transactions = await client.execute(
  client.buildTransactionListPayload({
    from_date: '2024-01-01 00:00:00',
    to_date: '2024-01-03 23:59:59',
    status: 'APPROVED'
  })
);

console.log('Transactions:', transactions);
```

### Available Filters

| Parameter | Type | Description |
|-----------|------|-------------|
| `from_date` | string | Start date (yyyy-MM-dd HH:mm:ss, max 3-day range) |
| `to_date` | string | End date (yyyy-MM-dd HH:mm:ss, max 3-day range) |
| `from_amount` | number \| string | Minimum amount |
| `to_amount` | number \| string | Maximum amount |
| `status` | TransactionStatus | Filter by status (e.g., "APPROVED", "PENDING") |
| `page` | number \| string | Page index, 1-based (default 1) |
| `pagination` | number \| string | Records per page (default 40, max 1000) |

## Close a Transaction

Cancel a transaction that has not been paid yet. Once closed, ABA PayWay rejects or reverses any incoming payment for that `tran_id` and sends no callback — so a customer who left the checkout page open cannot pay for an order you have already released.

```typescript
// app/api/payment/close/[tranId]/route.ts
import { PayWayClient } from 'payway-ts';

const client = new PayWayClient(
  process.env.PAYWAY_BASE_URL!,
  process.env.PAYWAY_MERCHANT_ID!,
  process.env.PAYWAY_API_KEY!
);

export async function POST(
  request: Request,
  { params }: { params: { tranId: string } }
) {
  try {
    const result = await client.execute(
      client.buildCloseTransactionPayload(params.tranId)
    );

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
```

**Simple usage:**

```typescript
const result = await client.execute(
  client.buildCloseTransactionPayload('ORDER-123')
);

if (result.status.code === '00') {
  console.log('Transaction closed');
}
```

### Response Codes

| Code | Meaning |
|------|---------|
| `00` | Success |
| `1` | Wrong hash |
| `5` | Transaction not found |
| `26` | Invalid merchant profile |

This endpoint expects a JSON body rather than form data, unlike the other transaction endpoints. `execute()` handles that for you.

## Payment Options

The following payment options work with this pattern:

- `cards` - Card payments
- `wechat` - WeChat Wallet
- `alipay` - Alipay Wallet
- `bakong` - Bakong

**DO NOT use `abapay`** with this pattern. See [Client-Side Form Submission](client-side-form-submission.md) instead.

## Why Not `abapay`?

The `execute()` method will throw an error if you try to use it with `payment_option: 'abapay'`:

```typescript
// ❌ This will throw an error
await client.execute(
  client.buildTransactionPayload({
    payment_option: 'abapay',  // Error!
    // ...
  })
);
// Error: Cannot execute transactions with payment_option "abapay" from server.
// The "abapay" option returns HTML and must be submitted via client-side form.

// ✅ Use client-side form submission instead (Pattern 1)
```

**Why?** Because `abapay` returns an HTML checkout page, not JSON. Your browser needs to render this page and handle the payment flow.

### Special Case: Allow HTML Response

If you really need to handle HTML responses on the server (advanced use case), you can override this:

```typescript
const htmlResponse = await client.execute(
  client.buildTransactionPayload({ payment_option: 'abapay', ... }),
  { allowHtml: true }  // ⚠️ Advanced: returns HTML string
);
```

## Next Steps

- [Learn about Pre-Authorization](pre-authorization.md) for two-step payments
- [Implement error handling](error-handling.md)
- [See complete API reference](api-reference.md)
