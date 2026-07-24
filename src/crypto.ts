import { createHmac, publicEncrypt, constants } from "node:crypto";

/**
 * Signing and encryption primitives shared by all payload builders.
 *
 * @packageDocumentation
 */

/**
 * Creates a base64 HMAC-SHA512 hash for request signing
 *
 * This is what every PayWay endpoint expects except Payout - see {@link createHashHex}.
 *
 * @param api_key - Your API key from ABA Bank
 * @param values - Array of strings to concatenate and hash
 * @returns Base64 encoded hash
 */
export function createHash(api_key: string, values: string[]): string {
  const data = values.join("");
  return createHmac("sha512", api_key).update(data).digest("base64");
}

/**
 * Creates a hex HMAC-SHA512 hash for request signing
 *
 * Only the Payout API expects a hex digest.
 *
 * @param api_key - Your API key from ABA Bank
 * @param values - Array of strings to concatenate and hash
 * @returns Lowercase hex encoded hash (128 characters)
 */
export function createHashHex(api_key: string, values: string[]): string {
  const data = values.join("");
  return createHmac("sha512", api_key).update(data).digest("hex");
}

/**
 * Normalizes an RSA public key to proper PEM format
 *
 * Handles common formatting issues:
 * - Literal \n escape sequences (from copy-paste or database storage)
 * - Missing or incorrect line breaks
 * - Extra whitespace
 *
 * @param key - RSA public key string (may be malformed)
 * @returns Properly formatted PEM key
 * @throws Error if key is missing required markers
 */
export function normalizePublicKey(key: string): string {
  // Remove extra whitespace
  let normalized = key.trim();

  // Replace literal \n with actual newlines
  normalized = normalized.replace(/\\n/g, "\n");

  // Ensure proper header/footer
  if (!normalized.includes("-----BEGIN")) {
    throw new Error(
      "Invalid RSA public key: missing BEGIN marker. " +
        'Key must start with "-----BEGIN PUBLIC KEY-----" or "-----BEGIN RSA PUBLIC KEY-----"',
    );
  }
  if (!normalized.includes("-----END")) {
    throw new Error(
      "Invalid RSA public key: missing END marker. " +
        'Key must end with "-----END PUBLIC KEY-----" or "-----END RSA PUBLIC KEY-----"',
    );
  }

  // Extract key content between BEGIN and END markers and rebuild properly
  const beginMatch = normalized.match(/-----BEGIN[^-]+-----/);
  const endMatch = normalized.match(/-----END[^-]+-----/);

  if (beginMatch && endMatch) {
    const beginMarker = beginMatch[0];
    const endMarker = endMatch[0];

    // Extract content between markers and remove all whitespace
    const startIdx = normalized.indexOf(beginMarker) + beginMarker.length;
    const endIdx = normalized.indexOf(endMarker);
    const keyContent = normalized
      .substring(startIdx, endIdx)
      .replace(/\s/g, "");

    // Split into 64-character lines (standard PEM format)
    const formattedLines = [];
    for (let i = 0; i < keyContent.length; i += 64) {
      formattedLines.push(keyContent.slice(i, i + 64));
    }

    // Rebuild key with proper formatting
    normalized = `${beginMarker}\n${formattedLines.join("\n")}\n${endMarker}`;
  }

  return normalized;
}

/**
 * Encrypts data with an RSA public key in 117-byte chunks
 *
 * Used for pre-auth operations where sensitive data (mc_id, tran_id, complete_amount)
 * must be encrypted using ABA Bank's RSA public key, and for payout operations
 * (beneficiaries array, whitelist merchant_auth).
 *
 * @param rsa_public_key - ABA Bank's RSA public key, in any of the formats {@link normalizePublicKey} accepts
 * @param data - Object or array to encrypt (will be JSON encoded)
 * @returns Base64 encoded encrypted data
 * @throws Error if the RSA public key is not configured
 */
export function encryptWithRSA(
  rsa_public_key: string | undefined,
  data: Record<string, any> | unknown[],
): string {
  if (!rsa_public_key) {
    throw new Error(
      "RSA public key is required for pre-auth and payout operations. " +
        "Please provide it when initializing PayWayClient: " +
        "new PayWayClient(base_url, merchant_id, api_key, rsa_public_key)",
    );
  }

  // Normalize the key to handle formatting issues (e.g., literal \n escape sequences)
  const normalizedKey = normalizePublicKey(rsa_public_key);

  // Step 1: JSON encode the data
  const jsonData = JSON.stringify(data);

  // Step 2: Split into 117-byte chunks and encrypt each
  // RSA with PKCS1 padding (1024-bit key) allows max 117 bytes per chunk
  const maxChunkSize = 117;
  let encryptedOutput = Buffer.alloc(0);

  for (let i = 0; i < jsonData.length; i += maxChunkSize) {
    const chunk = jsonData.slice(i, i + maxChunkSize);

    // Encrypt the chunk using ABA's public key (normalized)
    const encryptedChunk = publicEncrypt(
      {
        key: normalizedKey,
        padding: constants.RSA_PKCS1_PADDING,
      },
      Buffer.from(chunk, "utf8"),
    );

    // Concatenate encrypted chunks
    encryptedOutput = Buffer.concat([encryptedOutput, encryptedChunk]);
  }

  // Step 3: Base64 encode the concatenated encrypted output
  return encryptedOutput.toString("base64");
}

/**
 * Base64 encodes a string
 *
 * Several purchase parameters (return_url, cancel_url, payout, ...) are sent
 * base64 encoded.
 *
 * @param value - String to encode
 * @returns Base64 encoded value
 */
export function base64(value: string): string {
  return Buffer.from(value).toString("base64");
}
