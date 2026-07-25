import { createHash, createHashHex } from "./crypto.js";
import { execute, type ExecuteResult } from "./execute.js";
import {
  buildTransactionPayload,
  buildCheckTransactionPayload,
  buildTransactionListPayload,
} from "./payloads/transaction.js";
import {
  buildCompletePreAuthPayload,
  buildCompletePreAuthWithPayoutPayload,
  buildCancelPreAuthPayload,
} from "./payloads/pre-auth.js";
import {
  buildPayoutPayload,
  buildAddBeneficiaryPayload,
  buildUpdateBeneficiaryStatusPayload,
} from "./payloads/payout.js";
import type {
  PayWayConfig,
  CreateTransactionParams,
  TransactionListParams,
  PayloadBuilderResponse,
  ExecuteOptions,
  CompletePreAuthParams,
  CompletePreAuthWithPayoutParams,
  CancelPreAuthParams,
  PayoutParams,
  AddBeneficiaryParams,
  UpdateBeneficiaryStatusParams,
} from "./types.js";

/**
 * PayWay API Client for ABA PayWay payment gateway
 *
 * This client builds request payloads with HMAC-SHA512 signatures.
 * It does NOT make HTTP requests - you use the returned payload to:
 * 1. Create an HTML form on the client-side, OR
 * 2. Make server-to-server API calls
 *
 * The class is a facade over the payload builders in `payloads/`, which are
 * plain functions taking a {@link PayWayConfig}. `PayWayClient` satisfies that
 * interface, so it passes itself straight through.
 *
 * @class PayWayClient
 */
export class PayWayClient implements PayWayConfig {
  public readonly base_url: string;
  public readonly merchant_id: string;
  public readonly api_key: string;
  public readonly rsa_public_key?: string;

  /**
   * Creates a new PayWayClient instance
   * @param base_url - Base URL of the PayWay API (e.g., https://checkout-sandbox.payway.com.kh/)
   * @param merchant_id - Your merchant ID from ABA Bank
   * @param api_key - Your API key from ABA Bank
   * @param rsa_public_key - Optional RSA public key from ABA Bank (required for pre-auth operations)
   */
  constructor(
    base_url: string,
    merchant_id: string,
    api_key: string,
    rsa_public_key?: string,
  ) {
    this.base_url = base_url;
    this.merchant_id = merchant_id;
    this.api_key = api_key;
    this.rsa_public_key = rsa_public_key;
  }

  /**
   * Creates HMAC-SHA512 hash for request signing
   * @param values - Array of strings to hash
   * @returns Base64 encoded hash
   */
  create_hash(values: string[]): string {
    return createHash(this.api_key, values);
  }

  /**
   * Creates a hex-encoded HMAC-SHA512 hash for request signing
   *
   * Only the Payout API expects a hex digest - every other PayWay endpoint
   * expects the base64 digest produced by {@link create_hash}.
   *
   * @param values - Array of strings to hash
   * @returns Lowercase hex encoded hash (128 characters)
   */
  create_hash_hex(values: string[]): string {
    return createHashHex(this.api_key, values);
  }

  /**
   * Builds a payment transaction payload
   *
   * Use this to create a client-side form that submits directly to ABA PayWay.
   * The returned payload contains all fields (including hash) and the URL.
   *
   * @param params - Transaction parameters
   * @returns Payload with fields, hash, and URL for form submission
   *
   * @example
   * ```typescript
   * // Server-side (Next.js API route)
   * const payload = client.buildTransactionPayload({
   *   payment_option: "abapay",
   *   amount: 100,
   *   tran_id: "ORDER-123",
   *   return_url: "https://mysite.com/callback"
   * });
   *
   * // Send to client
   * return Response.json(payload);
   *
   * // Client-side: Create and submit form
   * const form = document.createElement('form');
   * form.method = payload.method;
   * form.action = payload.url;
   * for (const [key, value] of Object.entries(payload.fields)) {
   *   const input = document.createElement('input');
   *   input.type = 'hidden';
   *   input.name = key;
   *   input.value = value;
   *   form.appendChild(input);
   * }
   * document.body.appendChild(form);
   * form.submit();
   * ```
   */
  buildTransactionPayload(
    params: CreateTransactionParams = {},
  ): PayloadBuilderResponse {
    return buildTransactionPayload(this, params);
  }

  /**
   * Builds a check transaction payload
   *
   * Use this for server-to-server API calls to check transaction status.
   *
   * @param tran_id - Transaction ID to check
   * @returns Payload with fields, hash, and URL
   *
   * @example
   * ```typescript
   * const payload = client.buildCheckTransactionPayload("ORDER-123");
   *
   * // Make server-to-server request
   * const formData = new FormData();
   * for (const [key, value] of Object.entries(payload.fields)) {
   *   formData.append(key, value);
   * }
   *
   * const response = await fetch(payload.url, {
   *   method: payload.method,
   *   body: formData
   * });
   * const result = await response.json();
   * ```
   */
  buildCheckTransactionPayload(tran_id: string): PayloadBuilderResponse {
    return buildCheckTransactionPayload(this, tran_id);
  }

  /**
   * Builds a transaction list payload
   *
   * Use this for server-to-server API calls to retrieve transaction lists.
   *
   * `from_date` and `to_date` must be `yyyy-MM-dd HH:mm:ss` and may not span
   * more than 3 days.
   *
   * @param params - Filter parameters
   * @returns Payload with fields, hash, and URL
   *
   * @example
   * ```typescript
   * const payload = client.buildTransactionListPayload({
   *   from_date: "2024-01-01 00:00:00",
   *   to_date: "2024-01-03 23:59:59",
   *   status: "APPROVED"
   * });
   *
   * // Make server-to-server request
   * const formData = new FormData();
   * for (const [key, value] of Object.entries(payload.fields)) {
   *   formData.append(key, value);
   * }
   *
   * const response = await fetch(payload.url, {
   *   method: payload.method,
   *   body: formData
   * });
   * const result = await response.json();
   * ```
   */
  buildTransactionListPayload(
    params: TransactionListParams = {},
  ): PayloadBuilderResponse {
    return buildTransactionListPayload(this, params);
  }

  /**
   * Builds a complete pre-auth transaction payload
   *
   * Use this to capture funds from a pre-authorized transaction.
   * The pre-auth must be in valid state (not expired or already completed).
   *
   * For card payments: You can complete with up to 10% more than the original amount.
   *
   * @param params - Complete pre-auth parameters
   * @returns Payload with fields, hash, and URL
   *
   * @example
   * ```typescript
   * // Complete with the authorized amount
   * const payload = client.buildCompletePreAuthPayload({
   *   tran_id: "ORDER-123",
   *   complete_amount: 100  // Required
   * });
   *
   * // Complete with increased amount (+10% allowed for cards)
   * const payload = client.buildCompletePreAuthPayload({
   *   tran_id: "ORDER-123",
   *   complete_amount: 110  // Original was 100, can add up to 10%
   * });
   *
   * // Execute the completion
   * const result = await client.execute(payload);
   * console.log('Status:', result.transaction_status); // "COMPLETED"
   * ```
   */
  buildCompletePreAuthPayload(
    params: CompletePreAuthParams,
  ): PayloadBuilderResponse {
    return buildCompletePreAuthPayload(this, params);
  }

  /**
   * Builds a complete pre-auth transaction with payout payload
   *
   * Use this to capture funds and distribute them according to payout rules.
   * Useful for marketplace scenarios where funds need to be split.
   *
   * @param params - Complete pre-auth with payout parameters
   * @returns Payload with fields, hash, and URL
   *
   * @example
   * ```typescript
   * const payload = client.buildCompletePreAuthWithPayoutPayload({
   *   tran_id: "ORDER-123",
   *   complete_amount: 100,
   *   payout: [
   *     { acc: "123456", amt: 80 },
   *     { acc: "789012", amt: 20 }
   *   ]
   * });
   *
   * const result = await client.execute(payload);
   * ```
   */
  buildCompletePreAuthWithPayoutPayload(
    params: CompletePreAuthWithPayoutParams,
  ): PayloadBuilderResponse {
    return buildCompletePreAuthWithPayoutPayload(this, params);
  }

  /**
   * Builds a cancel pre-auth transaction payload
   *
   * Use this to release reserved funds from a pre-authorized transaction.
   * The pre-auth must be in valid state (not expired or already completed/cancelled).
   *
   * @param params - Cancel pre-auth parameters
   * @returns Payload with fields, hash, and URL
   *
   * @example
   * ```typescript
   * const payload = client.buildCancelPreAuthPayload({
   *   tran_id: "ORDER-123"
   * });
   *
   * const result = await client.execute(payload);
   * console.log('Status:', result.transaction_status); // "CANCELLED"
   * ```
   */
  buildCancelPreAuthPayload(
    params: CancelPreAuthParams,
  ): PayloadBuilderResponse {
    return buildCancelPreAuthPayload(this, params);
  }

  /**
   * Builds a standalone payout payload
   *
   * Distributes funds from your settlement account to whitelisted beneficiaries.
   * This is independent of any customer purchase - use the `payout` parameter of
   * buildTransactionPayload() instead if you want to split the funds of a
   * transaction you are collecting.
   *
   * Every beneficiary must be whitelisted first via buildAddBeneficiaryPayload(),
   * otherwise the payout is rejected with status code 37.
   *
   * @param params - Payout parameters
   * @returns Payload with fields, JSON body, hash, and URL
   * @throws Error if RSA public key is not configured
   *
   * @example
   * ```typescript
   * const payload = client.buildPayoutPayload({
   *   tran_id: "PAYOUT-123",
   *   beneficiaries: [
   *     { account: "200030000", amount: 1.72 },
   *     { account: "012538302", amount: 1.72 }
   *   ],
   *   amount: 3.44,
   *   currency: "USD"
   * });
   *
   * const result = await client.execute(payload);
   * console.log('Code:', result.status.code); // "0" on success
   * ```
   */
  buildPayoutPayload(params: PayoutParams): PayloadBuilderResponse {
    return buildPayoutPayload(this, params);
  }

  /**
   * Builds an add beneficiary to whitelist payload
   *
   * A beneficiary must be whitelisted before it can receive a payout, whether
   * through the standalone Payout API or a Split & Payout instruction.
   * Newly added beneficiaries are active immediately.
   *
   * @param params - Beneficiary parameters
   * @returns Payload with fields, JSON body, hash, and URL
   * @throws Error if RSA public key is not configured
   *
   * @example
   * ```typescript
   * const payload = client.buildAddBeneficiaryPayload({
   *   payee: "318111358120004" // ABA account number or merchant MID
   * });
   *
   * const result = await client.execute(payload);
   * console.log('Type:', result.data.type);     // "Merchant" or "ABA Account"
   * console.log('Status:', result.data.status); // 1 (active)
   * ```
   */
  buildAddBeneficiaryPayload(
    params: AddBeneficiaryParams,
  ): PayloadBuilderResponse {
    return buildAddBeneficiaryPayload(this, params);
  }

  /**
   * Builds an update beneficiary status payload
   *
   * Use this to stop a whitelisted beneficiary from receiving further funds, or
   * to resume a previously disabled one. A disabled beneficiary makes payouts
   * that reference it fail with status code 37.
   *
   * @param params - Beneficiary and target status
   * @returns Payload with fields, JSON body, hash, and URL
   * @throws Error if RSA public key is not configured
   *
   * @example
   * ```typescript
   * // Disable a beneficiary
   * const payload = client.buildUpdateBeneficiaryStatusPayload({
   *   payee: "318111358120004",
   *   status: 0
   * });
   *
   * const result = await client.execute(payload);
   * console.log('Status:', result.data.status); // 0 (inactive)
   * ```
   */
  buildUpdateBeneficiaryStatusPayload(
    params: UpdateBeneficiaryStatusParams,
  ): PayloadBuilderResponse {
    return buildUpdateBeneficiaryStatusPayload(this, params);
  }

  /**
   * Execute a server-to-server API call
   *
   * This method takes a payload and makes the HTTP request for you.
   * Useful for server-to-server calls like check_transaction and transaction_list.
   *
   * WARNING: For create_transaction with payment_option "abapay", use client-side
   * form submission instead, as it returns HTML. This method will throw an error
   * if you try to execute with payment_option "abapay" (unless allowHtml is true).
   *
   * @param payload - Payload from any build method
   * @param options - Execution options
   * @returns JSON response from ABA PayWay API
   *
   * @throws {PayWayAPIError} If HTTP request fails - includes status, statusText, and response body
   * @throws {Error} If payment_option is "abapay" and allowHtml is false
   * @throws {Error} If response is HTML and allowHtml is false
   *
   * @example
   * ```typescript
   * // Check transaction status (always server-to-server)
   * const result = await client.execute(
   *   client.buildCheckTransactionPayload("ORDER-123")
   * );
   * console.log('Status:', result.status);
   *
   * // With error handling
   * try {
   *   const result = await client.execute(
   *     client.buildCompletePreAuthPayload({
   *       tran_id: 'ORDER-123',
   *       complete_amount: 100
   *     })
   *   );
   * } catch (error: any) {
   *   console.error('Error:', error.message);
   *   console.error('Status:', error.status);
   *   console.error('Details:', error.body);
   * }
   *
   * // Get transaction list
   * const transactions = await client.execute(
   *   client.buildTransactionListPayload({ status: 'APPROVED' })
   * );
   * ```
   */
  async execute(
    payload: PayloadBuilderResponse,
    options: ExecuteOptions = {},
  ): Promise<ExecuteResult> {
    return execute(payload, options);
  }
}
