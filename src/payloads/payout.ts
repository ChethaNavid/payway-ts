import { createHash, createHashHex, encryptWithRSA } from "../crypto.js";
import { formatRequestTime } from "../utils.js";
import type {
  PayWayConfig,
  PayoutParams,
  AddBeneficiaryParams,
  UpdateBeneficiaryStatusParams,
  PayloadBuilderResponse,
} from "../types.js";

/**
 * Payout and beneficiary whitelist payload builders.
 *
 * These are the only JSON endpoints, and they sign differently from each other:
 * payout uses a hex digest over its own field order, while the whitelist
 * endpoints use a base64 digest over `request_time + merchant_auth` only.
 *
 * @packageDocumentation
 */

/**
 * Builds a standalone payout payload
 *
 * @param config - Merchant credentials
 * @param params - Payout parameters
 * @returns Payload with fields, JSON body, hash, and URL
 * @throws Error if RSA public key is not configured
 */
export function buildPayoutPayload(
  config: PayWayConfig,
  params: PayoutParams,
): PayloadBuilderResponse {
  const { tran_id, beneficiaries, amount, currency, custom_fields } = params;

  // Encrypt the beneficiary list with ABA's RSA public key
  const encrypted_beneficiaries = encryptWithRSA(
    config.rsa_public_key,
    beneficiaries,
  );

  // Serialize custom_fields. PayWay concatenates a missing value as an empty
  // string when building the hash, so keep it as "" rather than dropping it.
  const serialized_custom_fields =
    custom_fields == null
      ? ""
      : typeof custom_fields === "string"
        ? custom_fields
        : JSON.stringify(custom_fields);

  // Canonicalize the amount so the hashed string always matches what
  // JSON.stringify puts on the wire (e.g. "3.40" hashes and serializes as 3.4)
  const amount_number = Number(amount);
  const amount_string = String(amount_number);

  // Hash order differs from the body order: custom_fields comes before currency
  const hash = createHashHex(config.api_key, [
    config.merchant_id,
    tran_id,
    encrypted_beneficiaries,
    amount_string,
    serialized_custom_fields,
    currency,
  ]);

  const body: Record<string, unknown> = {
    merchant_id: config.merchant_id,
    tran_id,
    beneficiaries: encrypted_beneficiaries,
    amount: amount_number,
    currency,
  };

  if (custom_fields != null) {
    body.custom_fields = serialized_custom_fields;
  }

  body.hash = hash;

  // Mirror the body as strings so the payload shape stays uniform with the
  // form-encoded endpoints
  const fields: Record<string, string> = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, String(value)]),
  );

  return {
    fields,
    body,
    hash,
    url: `${config.base_url}api/payment-gateway/v2/direct-payment/merchant/payout`,
    method: "POST",
    contentType: "application/json",
  };
}

/**
 * Builds a whitelist payload (shared by the add / update beneficiary APIs)
 *
 * Note the hash covers only request_time and merchant_auth - unlike the
 * pre-auth endpoints, merchant_id is sent in the body but not hashed.
 *
 * @param config - Merchant credentials
 * @param dataToEncrypt - Object to encrypt into merchant_auth
 * @param path - API path relative to base_url
 * @returns Payload with fields, JSON body, hash, and URL
 */
function buildWhitelistPayload(
  config: PayWayConfig,
  dataToEncrypt: Record<string, any>,
  path: string,
): PayloadBuilderResponse {
  const merchant_auth = encryptWithRSA(config.rsa_public_key, dataToEncrypt);
  const request_time = formatRequestTime(new Date());

  const hash = createHash(config.api_key, [request_time, merchant_auth]);

  const body: Record<string, unknown> = {
    request_time,
    merchant_id: config.merchant_id,
    merchant_auth,
    hash,
  };

  const fields: Record<string, string> = Object.fromEntries(
    Object.entries(body).map(([key, value]) => [key, String(value)]),
  );

  return {
    fields,
    body,
    hash,
    url: `${config.base_url}${path}`,
    method: "POST",
    contentType: "application/json",
  };
}

/**
 * Builds an add beneficiary to whitelist payload
 *
 * @param config - Merchant credentials
 * @param params - Beneficiary parameters
 * @returns Payload with fields, JSON body, hash, and URL
 * @throws Error if RSA public key is not configured
 */
export function buildAddBeneficiaryPayload(
  config: PayWayConfig,
  params: AddBeneficiaryParams,
): PayloadBuilderResponse {
  const { payee } = params;

  return buildWhitelistPayload(
    config,
    { mc_id: config.merchant_id, payee },
    "api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout",
  );
}

/**
 * Builds an update beneficiary status payload
 *
 * @param config - Merchant credentials
 * @param params - Beneficiary and target status
 * @returns Payload with fields, JSON body, hash, and URL
 * @throws Error if RSA public key is not configured
 */
export function buildUpdateBeneficiaryStatusPayload(
  config: PayWayConfig,
  params: UpdateBeneficiaryStatusParams,
): PayloadBuilderResponse {
  const { payee, status } = params;

  return buildWhitelistPayload(
    config,
    { mc_id: config.merchant_id, payee, status },
    "api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status",
  );
}
