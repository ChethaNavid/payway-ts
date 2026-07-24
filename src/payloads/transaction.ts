import { base64, createHash } from "../crypto.js";
import { formatRequestTime, trim } from "../utils.js";
import type {
  PayWayConfig,
  CreateTransactionParams,
  TransactionListParams,
  PayloadBuilderResponse,
} from "../types.js";

/**
 * Purchase, check-transaction and transaction-list payload builders.
 *
 * These are the form-encoded endpoints: the hash covers `req_time`, `merchant_id`
 * and then every body value in insertion order.
 *
 * @packageDocumentation
 */

/**
 * Creates payload fields with a hash signature
 *
 * Null and undefined values are dropped before hashing, so optional parameters
 * do not contribute to the signature.
 *
 * @param config - Merchant credentials
 * @param body - Request body parameters, in the order they must be hashed
 * @param date - Date for the request (defaults to now)
 * @returns Plain object with all fields including hash
 */
function createPayload(
  config: PayWayConfig,
  body: Record<string, any> = {},
  date: Date = new Date(),
): Record<string, string> {
  // Filter out null and undefined values
  body = Object.fromEntries(Object.entries(body).filter(([_k, v]) => v != null));

  const req_time = formatRequestTime(date);
  const merchant_id = config.merchant_id;

  // Create hash with req_time, merchant_id, and all body values
  const hash = createHash(config.api_key, [
    req_time,
    merchant_id,
    ...Object.values(body).map(String),
  ]);

  // Build fields object
  const fields: Record<string, string> = {
    req_time,
    merchant_id,
  };

  // Add all body fields as strings
  for (const [key, value] of Object.entries(body)) {
    fields[key] = String(value);
  }

  // Add hash at the end
  fields.hash = hash;

  return fields;
}

/**
 * Builds a payment transaction payload
 *
 * @param config - Merchant credentials
 * @param params - Transaction parameters
 * @returns Payload with fields, hash, and URL for form submission
 */
export function buildTransactionPayload(
  config: PayWayConfig,
  params: CreateTransactionParams = {},
): PayloadBuilderResponse {
  const {
    tran_id,
    payment_option,
    amount,
    currency,
    return_url,
    return_deeplink,
    continue_success_url,
    firstname,
    lastname,
    email,
    phone,
    view_type,
    type,
    lifetime,
    google_play_token,
    items,
    shipping,
    cancel_url,
    skip_success_page,
    custom_fields,
    return_params,
    payout,
    additional_params,
  } = params;

  let processedReturnUrl = return_url;
  let processedCancelUrl = cancel_url;
  let processedContinueSuccessUrl = continue_success_url;
  if (typeof continue_success_url === "string") {
    processedContinueSuccessUrl = base64(continue_success_url);
  }

  if (typeof cancel_url === "string") {
    processedCancelUrl = base64(cancel_url);
  }

  if (typeof return_url === "string") {
    processedReturnUrl = base64(return_url);
  }
  let processedReturnDeeplink: string | undefined;

  if (return_deeplink != null) {
    processedReturnDeeplink = base64(JSON.stringify(return_deeplink));
  }

  // Accept a payout instruction as an array and encode it, or pass an
  // already encoded string through untouched
  const processedPayout = Array.isArray(payout)
    ? base64(JSON.stringify(payout))
    : payout;

  // Build payload fields (order matters for hash generation)
  const fields = createPayload(config, {
    tran_id,
    amount,
    items,
    shipping,
    firstname: trim(firstname),
    lastname: trim(lastname),
    email: trim(email),
    phone: trim(phone),
    type,
    payment_option,
    return_url: processedReturnUrl,
    cancel_url: processedCancelUrl,
    continue_success_url: processedContinueSuccessUrl,
    return_deeplink: processedReturnDeeplink,
    currency,
    custom_fields,
    return_params,
    payout: processedPayout,
    lifetime,
    additional_params,
    google_play_token,
    skip_success_page,
  });

  // Add view_type AFTER hash generation (not included in hash)
  if (view_type != null) {
    fields.view_type = view_type;
  }
  if (type != null) {
    fields.type = type;
  }

  return {
    fields,
    hash: fields.hash,
    url: `${config.base_url}api/payment-gateway/v1/payments/purchase`,
    method: "POST",
  };
}

/**
 * Builds a check transaction payload
 *
 * @param config - Merchant credentials
 * @param tran_id - Transaction ID to check
 * @returns Payload with fields, hash, and URL
 */
export function buildCheckTransactionPayload(
  config: PayWayConfig,
  tran_id: string,
): PayloadBuilderResponse {
  const fields = createPayload(config, { tran_id });

  return {
    fields,
    hash: fields.hash,
    url: `${config.base_url}api/payment-gateway/v1/payments/check-transaction-2`,
    method: "POST",
  };
}

/**
 * Builds a transaction list payload
 *
 * @param config - Merchant credentials
 * @param params - Filter parameters
 * @returns Payload with fields, hash, and URL
 */
export function buildTransactionListPayload(
  config: PayWayConfig,
  params: TransactionListParams = {},
): PayloadBuilderResponse {
  const { from_date, to_date, from_amount, to_amount, status } = params;

  const fields = createPayload(config, {
    from_date,
    to_date,
    from_amount,
    to_amount,
    status,
  });

  return {
    fields,
    hash: fields.hash,
    url: `${config.base_url}api/payment-gateway/v1/payments/transaction-list`,
    method: "POST",
  };
}
