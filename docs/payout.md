# Payout

Payout distributes funds to **beneficiaries** — ABA account holders or ABA merchants (by MID). PayWay offers this two different ways, and payway-ts supports both.

## Which flow do you need?

| | **Split & Payout** | **Payout** (standalone) |
|---|---|---|
| How | A `payout` instruction inside the purchase request | Its own API call with its own `tran_id` |
| Funds come from | The customer transaction being collected | Your **settlement account** |
| When | Atomic with the payment, split at settlement | Whenever you decide |
| Balance needed | None — nothing leaves your balance | Yes — fails with code `93` if short |
| Payout total | Must not **exceed** the transaction amount; the remainder settles to you | **Equals** the transaction — `amount` is the sum of the beneficiaries |
| Beneficiary keys | `acc` / `amt` | `account` / `amount` |
| SDK method | `buildTransactionPayload({ payout })` | `buildPayoutPayload()` |

Use **Split & Payout** when the split maps 1:1 to one order (marketplace commission on a sale). Use **standalone Payout** for batch commission runs, vendor settlements on your own schedule, or anything where the amount doesn't correspond to a single transaction.

Both require the beneficiary to be whitelisted first.

## Prerequisites: RSA public key

All payout operations encrypt data with **ABA Bank's RSA public key**:

```typescript
const client = new PayWayClient(
  process.env.PAYWAY_BASE_URL!,
  process.env.PAYWAY_MERCHANT_ID!,
  process.env.PAYWAY_API_KEY!,
  process.env.ABA_RSA_PUBLIC_KEY!  // Required for payout
);
```

Without it, the builders throw before any request is made.

## Step 1: Whitelist the beneficiary

A beneficiary must be whitelisted before it can receive funds — through either flow. Newly added beneficiaries are **active immediately**.

```typescript
const result = await client.execute(
  client.buildAddBeneficiaryPayload({
    payee: '318111358120004'  // ABA account number or merchant MID
  })
);

console.log(result.data.name);     // "SOK DARA" or the outlet name
console.log(result.data.type);     // "ABA Account" or "Merchant"
console.log(result.data.currency); // "USD"
console.log(result.data.status);   // 1 (active)
```

The beneficiary's currency must match your merchant currency, otherwise you get `PTL147`.

### Disable or re-enable a beneficiary

```typescript
// Stop this beneficiary from receiving further funds
await client.execute(
  client.buildUpdateBeneficiaryStatusPayload({
    payee: '318111358120004',
    status: 0  // 0 = disable, 1 = activate
  })
);
```

Payouts referencing a disabled beneficiary fail with code `37`.

## Step 2a: Standalone Payout

Debits your settlement account and credits the beneficiaries.

```typescript
const result = await client.execute(
  client.buildPayoutPayload({
    tran_id: 'PAYOUT-123',        // Your unique ID, max 20 characters
    beneficiaries: [
      { account: '200030000', amount: 1.72 },
      { account: '012538302', amount: 1.72 }
    ],
    amount: 3.44,                 // Must equal the sum of all beneficiary amounts
    currency: 'USD'
  })
);

if (result.status.code === '0') {
  console.log('Payout ID:', result.transaction_id);
  console.log('Reference:', result.external_reference);
  for (const b of result.beneficiaries) {
    console.log(b.mid_acccount, b.amount, b.currency);
  }
} else {
  // Keep trace_id — ABA support needs it to investigate
  console.error(result.status.code, result.status.message, result.status.trace_id);
}
```

Constraints:

- **Maximum 10 beneficiaries** per request (code `25`)
- `amount` must equal the sum of the beneficiary amounts (code `92`)
- Minimum **0.01 USD** or **100 KHR**
- All beneficiaries must share the transaction currency (code `90`)
- `tran_id` must be unique (codes `4` / `83`)

### Attaching metadata

`custom_fields` accepts an object (JSON encoded for you) or a pre-encoded string. Max 255 characters once serialized.

```typescript
client.buildPayoutPayload({
  tran_id: 'PAYOUT-123',
  beneficiaries: [{ account: '200030000', amount: 3.44 }],
  amount: 3.44,
  currency: 'USD',
  custom_fields: { Invoice_ID: 'INV-1234', Province: 'Phnom Penh' }
});
```

## Step 2b: Split & Payout

Instead of a separate call, attach the split to the payment you're collecting. Pass an array and payway-ts JSON + base64 encodes it for you; a pre-encoded string is passed through unchanged.

```typescript
const payload = client.buildTransactionPayload({
  tran_id: 'ORDER-123',
  amount: 10,
  currency: 'USD',
  payment_option: 'cards',
  return_url: 'https://yoursite.com/callback',
  payout: [
    { acc: '000133879', amt: 7 },  // seller
    { acc: '000133880', amt: 2 }   // logistics
  ]
});
```

### The payout total does not have to equal the transaction amount

On a purchase, the payout total is a **ceiling, not an equality**: it must not exceed the transaction amount (status code `82`). The example above pays out $9 of a $10 sale and the remaining $1 settles to your own account — that is the normal way to take a commission. Paying out the full $10 is equally valid.

Two endpoints are stricter and require the payout to total the whole amount:

- **Payment links** — "Total payout amount must equal to payment link amount."
- **Standalone Payout** — `amount` is by definition the sum of the beneficiary amounts (code `92`).

### Constraints on a purchase payout

- Maximum **10** beneficiaries (code `25`)
- Total must not exceed the transaction amount (code `82`)
- No duplicate accounts in one instruction (code `39`) — sum multiple line items for the same seller yourself
- Card payments cannot pay out to an ABA account (code `71`); beneficiaries need to be MIDs
- Card payouts are not compatible with the discount program (code `78`)
- Code `59` reads "Payout info can not be fixed with MID and ABA account", which appears to be a typo for *mixed*. If so, a single purchase payout cannot combine MIDs and ABA accounts — note the standalone Payout API explicitly *allows* mixing, so verify this one against sandbox before relying on either behavior.

### Key names differ per endpoint

This mirrors the PayWay API rather than the SDK's choice, so check the endpoint you are calling:

| Endpoint | Keys | Shape |
|---|---|---|
| Purchase | `acc` / `amt` | base64 JSON string |
| Pre-auth completion | `acc` / `amt` | inside the RSA-encrypted blob |
| Payment link | `acc` / `amt` (+ `acc_name` in the response) | inside the RSA-encrypted blob |
| **QR API** | **`account` / `amount`** | base64 JSON string, max 255 chars |
| Standalone Payout | `account` / `amount` | RSA encrypted |

`PayoutItem` is typed `{ acc, amt }`, which covers purchase and pre-auth completion. For the QR API, build the `account` / `amount` array yourself.

For **pre-auth**, do not include the instruction when creating the authorization — pass it when completing:

```typescript
await client.execute(
  client.buildCompletePreAuthWithPayoutPayload({
    tran_id: 'ORDER-123',
    complete_amount: 100,
    payout: [{ acc: '000133879', amt: 80 }]
  })
);
```

See [Pre-Authorization](pre-authorization.md#step-2b-complete-with-payout) for details.

## Sequencing purchase → payout

payway-ts is a payload builder and does not chain calls for you. Sequencing, status polling, retries and idempotency belong in your queue or worker, so that a crash between the two steps doesn't turn into a double payout:

```typescript
// 1. Collect the payment normally (no payout instruction)
// 2. Confirm it settled
const check: any = await client.execute(
  client.buildCheckTransactionPayload('ORDER-123')
);

// 3. Only then, on your own schedule, push the payout
if (check.data.payment_status === 'APPROVED' && !alreadyPaidOut('ORDER-123')) {
  await client.execute(
    client.buildPayoutPayload({
      tran_id: 'PO-ORDER-123',  // Deterministic ID makes retries idempotent
      beneficiaries: [{ account: '200030000', amount: 7 }],
      amount: 7,
      currency: 'USD'
    })
  );
}
```

Deriving `tran_id` from the order ID means a retry after an ambiguous failure returns code `83` (duplicate) rather than paying twice.

## Split & Payout status codes

Returned by the purchase endpoint when a `payout` instruction is attached. These are payout-specific codes only — see the Purchase API for the full transaction code list.

> **Note:** code `82` means something different here than on the standalone Payout API. Read these tables per endpoint, not interchangeably.

| Code | Meaning |
|---|---|
| `25` | Maximum 10 payouts per request |
| `35` | Payout info is invalid |
| `36` | Payout account or amount is invalid |
| `37` | Payout accounts are not in the whitelist |
| `38` | Payout contains invalid transaction ID |
| `39` | Payout contains duplicated account |
| `40` | Payout contains duplicated transaction ID |
| `41` | Payout info contains a MID not linked to any merchant profile |
| `42` | Payout info contains an account with invalid status |
| `59` | Payout info can not be "fixed" (likely *mixed*) with MID and ABA account |
| `71` | Payout for card payment is not allowed to an ABA account |
| `78` | Card payout transactions are not compatible with the discount program |
| `82` | Payout has exceeded the maximum allowable amount per transaction |

## Standalone Payout status codes

`status.code` is `"0"` on success.

| Code | Meaning |
|---|---|
| `0` | Success |
| `4` | Duplicated transaction ID |
| `11` | Something went wrong, try again |
| `24` | Cannot decrypt data — check your RSA public key |
| `25` | More than 10 beneficiaries in one request |
| `26` | Invalid merchant profile |
| `36` | Payout account or amount is invalid |
| `37` | Payout accounts are not in the whitelist |
| `44` | Transaction limit reached |
| `48` | Bad request parameters |
| `70` | Daily limit reached |
| `79` | Payment rejected |
| `80` | Custom fields invalid |
| `81` | Total amount must be greater than 0 |
| `82` | Invalid currency — only USD and KHR are supported |
| `83` | Transaction is duplicated |
| `84` | Cannot access merchant account details — check your settlement account is active |
| `85` | Transaction currency does not match the merchant currency |
| `86` | Unable to debit the merchant account |
| `87`, `89` | Unable to retrieve the beneficiary's account details |
| `88` | Unable to retrieve the beneficiary's MID details |
| `90` | Merchant and beneficiary currencies do not align |
| `91` | Unable to credit the beneficiary's account |
| `92` | Total payout amount does not match the total transaction amount |
| `93` | Insufficient balance |
| `400` | Bad request |
| `LAM01` | Daily limit reached |
| `LAM02` | Monthly limit reached |

## Beneficiary whitelist status codes

`status.code` is `"00"` on success.

| Code | Meaning |
|---|---|
| `00` | Success |
| `PTL02` | Wrong hash |
| `PTL04` | Parameter validation required |
| `PTL25` | Invalid account class |
| `PTL46` | Merchant not found |
| `PTL99` | Merchant invalid currency |
| `PTL134` | Account not found |
| `PTL146` | Payee is invalid |
| `PTL147` | Payee currency does not match the merchant currency |
| `PTL148` | Payee already exists |
| `PTL149` | Invalid whitelist account |
| `PTL150` | Business profile not found |
| `PTL151` | Failed to whitelist account |

## Troubleshooting

**Code `24` (cannot decrypt)** — the RSA public key is wrong or malformed. payway-ts normalizes common formatting problems (literal `\n`, missing line breaks), so this usually means the wrong key entirely, or a key from a different environment.

**Code `71` on a card purchase** — card payments cannot pay out to an ABA account. Use MIDs as beneficiaries, or route those payments through a different payment option.

**Code `82` on a purchase** — the payout total exceeded the transaction amount. This is a ceiling, not an equality: paying out less is fine and the remainder settles to you.

**Code `39`** — the same account appears twice in one instruction. Sum the line items for that beneficiary into a single entry before sending.

**`PTL02` / bad hash on payout** — the Payout API is the one endpoint that expects a **hex** HMAC digest; every other PayWay endpoint expects base64. payway-ts handles this via `create_hash_hex()`. If you are computing hashes yourself, note the order is `merchant_id + tran_id + beneficiaries + amount + custom_fields + currency`, which is *not* the field order of the request body.

**Code `37` after whitelisting successfully** — the beneficiary may have been disabled. Re-activate it with `buildUpdateBeneficiaryStatusPayload({ payee, status: 1 })`.

**Code `93` (insufficient balance)** — only applies to standalone Payout, which debits your settlement account. Split & Payout has no such requirement.

## Transport

Payout and the whitelist endpoints post `application/json`, unlike the rest of the SDK which posts `multipart/form-data`. `execute()` handles this automatically via the `contentType` field on the payload. If you make the request yourself, send `payload.body` (values in native types — `amount` must stay a number) rather than `payload.fields`:

```typescript
await fetch(payload.url, {
  method: payload.method,
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload.body)
});
```

## See also

- [Pre-Authorization](pre-authorization.md) — reserve funds first, capture with a payout later
- [API Reference](api-reference.md) — all methods, parameters and types
- [Error Handling](error-handling.md) — handling HTTP-level failures
