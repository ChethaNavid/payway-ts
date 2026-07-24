import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac, generateKeyPairSync, privateDecrypt, constants } from "node:crypto";
import { PayWayClient } from "../src/index.js";

const BASE_URL = "https://checkout-sandbox.payway.com.kh/";
const MERCHANT_ID = "merchant_123";
const API_KEY = "api_key_456";

// 1024-bit keypair so tests can decrypt merchant_auth / beneficiaries and assert
// on the plaintext that ABA would receive
const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 1024,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

function createClient() {
  return new PayWayClient(BASE_URL, MERCHANT_ID, API_KEY, publicKey);
}

function createClientWithoutRsaKey() {
  return new PayWayClient(BASE_URL, MERCHANT_ID, API_KEY);
}

/**
 * Reverses encryptWithRSA: split the base64 payload into 128-byte cipher blocks
 * (1024-bit key), decrypt each, and concatenate.
 */
function decryptRSA(encoded: string): any {
  const buffer = Buffer.from(encoded, "base64");
  let plaintext = "";

  for (let i = 0; i < buffer.length; i += 128) {
    const block = buffer.subarray(i, i + 128);
    plaintext += privateDecrypt(
      { key: privateKey, padding: constants.RSA_PKCS1_PADDING },
      block,
    ).toString("utf8");
  }

  return JSON.parse(plaintext);
}

describe("create_hash_hex", () => {
  it("should create hex encoded HMAC-SHA512 hash", () => {
    const client = new PayWayClient("http://example.com", "1", "1");
    expect(client.create_hash_hex(["a", "b", "c"])).toBe(
      "25c4ceddde4fa15a1544f2168d483d6d346b493a4586ef495ce2e6fa72e3ae60" +
        "dab4666e4b3f5e0efdf6dc35f4e4ad6bfc1631eb4010559f863966d34b85d4bf",
    );
  });

  it("should return 128 lowercase hex characters", () => {
    const client = createClient();
    const hash = client.create_hash_hex(["anything"]);

    expect(hash).toHaveLength(128);
    expect(hash).toMatch(/^[0-9a-f]{128}$/);
  });

  it("should be the same digest as create_hash, differently encoded", () => {
    const client = createClient();
    const values = ["a", "b", "c"];

    expect(client.create_hash_hex(values)).toBe(
      Buffer.from(client.create_hash(values), "base64").toString("hex"),
    );
  });
});

describe("buildPayoutPayload", () => {
  const params = {
    tran_id: "PAYOUT-123",
    beneficiaries: [
      { account: "200030000", amount: 1.72 },
      { account: "012538302", amount: 1.72 },
    ],
    amount: 3.44,
    currency: "USD" as const,
  };

  it("should build payload with correct URL, method and content type", () => {
    const payload = createClient().buildPayoutPayload(params);

    expect(payload.url).toBe(
      `${BASE_URL}api/payment-gateway/v2/direct-payment/merchant/payout`,
    );
    expect(payload.method).toBe("POST");
    expect(payload.contentType).toBe("application/json");
  });

  it("should hash merchant_id, tran_id, beneficiaries, amount, custom_fields, currency in that order", () => {
    const payload = createClient().buildPayoutPayload(params);

    // custom_fields is absent, so it contributes an empty string to the hash
    const expected = createHmac("sha512", API_KEY)
      .update(
        MERCHANT_ID +
          "PAYOUT-123" +
          String(payload.body!.beneficiaries) +
          "3.44" +
          "" +
          "USD",
      )
      .digest("hex");

    expect(payload.hash).toBe(expected);
    expect(payload.body!.hash).toBe(expected);
  });

  it("should not hash the fields in body order", () => {
    const custom_fields = '{"Invoice_ID":"INV-1234"}';
    const payload = createClient().buildPayoutPayload({ ...params, custom_fields });

    // The body sends currency before custom_fields, but the hash is the other
    // way around - hashing in body order must not produce the same digest
    const bodyOrderHash = createHmac("sha512", API_KEY)
      .update(
        MERCHANT_ID +
          "PAYOUT-123" +
          String(payload.body!.beneficiaries) +
          "3.44" +
          "USD" +
          custom_fields,
      )
      .digest("hex");

    expect(payload.hash).not.toBe(bodyOrderHash);
  });

  it("should not use the base64 hash encoding used by other endpoints", () => {
    const payload = createClient().buildPayoutPayload(params);

    expect(payload.hash).toMatch(/^[0-9a-f]{128}$/);
    expect(payload.hash).not.toContain("=");
  });

  it("should RSA encrypt the beneficiaries array", () => {
    const payload = createClient().buildPayoutPayload(params);

    expect(decryptRSA(payload.body!.beneficiaries as string)).toEqual([
      { account: "200030000", amount: 1.72 },
      { account: "012538302", amount: 1.72 },
    ]);
  });

  it("should omit custom_fields from the body when not provided", () => {
    const payload = createClient().buildPayoutPayload(params);

    expect("custom_fields" in payload.body!).toBe(false);
    expect(Object.keys(payload.body!)).toEqual([
      "merchant_id",
      "tran_id",
      "beneficiaries",
      "amount",
      "currency",
      "hash",
    ]);
  });

  it("should JSON encode object custom_fields and include them in the hash", () => {
    const custom_fields = { Invoice_ID: "INV-1234", Province: "Phnom Penh" };
    const payload = createClient().buildPayoutPayload({ ...params, custom_fields });

    const serialized = JSON.stringify(custom_fields);
    expect(payload.body!.custom_fields).toBe(serialized);

    const expected = createHmac("sha512", API_KEY)
      .update(
        MERCHANT_ID +
          "PAYOUT-123" +
          String(payload.body!.beneficiaries) +
          "3.44" +
          serialized +
          "USD",
      )
      .digest("hex");

    expect(payload.hash).toBe(expected);
  });

  it("should pass string custom_fields through unchanged", () => {
    const custom_fields = '{"timestamp":"2024-08-23 10:35:55.437"}';
    const payload = createClient().buildPayoutPayload({ ...params, custom_fields });

    expect(payload.body!.custom_fields).toBe(custom_fields);
  });

  it("should keep the body amount a number", () => {
    const payload = createClient().buildPayoutPayload(params);

    expect(payload.body!.amount).toBe(3.44);
    expect(typeof payload.body!.amount).toBe("number");
  });

  it("should canonicalize a string amount so the hash matches the serialized body", () => {
    const payload = createClient().buildPayoutPayload({ ...params, amount: "3.40" });

    // "3.40" would serialize as 3.4, so the hash must use "3.4" too
    expect(payload.body!.amount).toBe(3.4);
    expect(JSON.parse(JSON.stringify(payload.body)).amount).toBe(3.4);

    const expected = createHmac("sha512", API_KEY)
      .update(
        MERCHANT_ID +
          "PAYOUT-123" +
          String(payload.body!.beneficiaries) +
          "3.4" +
          "" +
          "USD",
      )
      .digest("hex");

    expect(payload.hash).toBe(expected);
  });

  it("should mirror the body into stringified fields", () => {
    const payload = createClient().buildPayoutPayload(params);

    expect(payload.fields.merchant_id).toBe(MERCHANT_ID);
    expect(payload.fields.tran_id).toBe("PAYOUT-123");
    expect(payload.fields.amount).toBe("3.44");
    expect(payload.fields.currency).toBe("USD");
    expect(payload.fields.hash).toBe(payload.hash);
  });

  it("should throw error when RSA public key is not provided", () => {
    expect(() => {
      createClientWithoutRsaKey().buildPayoutPayload(params);
    }).toThrow("RSA public key is required for pre-auth and payout operations");
  });
});

describe("buildAddBeneficiaryPayload", () => {
  it("should build payload with correct URL, method and content type", () => {
    const payload = createClient().buildAddBeneficiaryPayload({
      payee: "318111358120004",
    });

    expect(payload.url).toBe(
      `${BASE_URL}api/merchant-portal/merchant-access/whitelist-account/add-whitelist-payout`,
    );
    expect(payload.method).toBe("POST");
    expect(payload.contentType).toBe("application/json");
  });

  it("should encrypt mc_id and payee into merchant_auth", () => {
    const payload = createClient().buildAddBeneficiaryPayload({
      payee: "318111358120004",
    });

    expect(decryptRSA(payload.body!.merchant_auth as string)).toEqual({
      mc_id: MERCHANT_ID,
      payee: "318111358120004",
    });
  });

  it("should hash request_time and merchant_auth only, base64 encoded", () => {
    const payload = createClient().buildAddBeneficiaryPayload({
      payee: "318111358120004",
    });

    const expected = createHmac("sha512", API_KEY)
      .update(String(payload.body!.request_time) + String(payload.body!.merchant_auth))
      .digest("base64");

    expect(payload.hash).toBe(expected);
    expect(payload.body!.hash).toBe(expected);
  });

  it("should send merchant_id in the body but exclude it from the hash", () => {
    const payload = createClient().buildAddBeneficiaryPayload({
      payee: "318111358120004",
    });

    expect(payload.body!.merchant_id).toBe(MERCHANT_ID);

    // The pre-auth ordering (merchant_auth + request_time + merchant_id) is wrong here
    const preAuthOrderHash = createHmac("sha512", API_KEY)
      .update(
        String(payload.body!.merchant_auth) +
          String(payload.body!.request_time) +
          MERCHANT_ID,
      )
      .digest("base64");

    expect(payload.hash).not.toBe(preAuthOrderHash);
  });

  it("should format request_time as yyyyMMddHHmmss", () => {
    const payload = createClient().buildAddBeneficiaryPayload({
      payee: "318111358120004",
    });

    expect(payload.body!.request_time).toMatch(/^\d{14}$/);
  });

  it("should throw error when RSA public key is not provided", () => {
    expect(() => {
      createClientWithoutRsaKey().buildAddBeneficiaryPayload({
        payee: "318111358120004",
      });
    }).toThrow("RSA public key is required for pre-auth and payout operations");
  });
});

describe("buildUpdateBeneficiaryStatusPayload", () => {
  it("should build payload with correct URL, method and content type", () => {
    const payload = createClient().buildUpdateBeneficiaryStatusPayload({
      payee: "318111358120004",
      status: 0,
    });

    expect(payload.url).toBe(
      `${BASE_URL}api/merchant-portal/merchant-access/whitelist-account/update-whitelist-status`,
    );
    expect(payload.method).toBe("POST");
    expect(payload.contentType).toBe("application/json");
  });

  it("should encrypt mc_id, payee and status into merchant_auth", () => {
    const payload = createClient().buildUpdateBeneficiaryStatusPayload({
      payee: "318111358120004",
      status: 0,
    });

    expect(decryptRSA(payload.body!.merchant_auth as string)).toEqual({
      mc_id: MERCHANT_ID,
      payee: "318111358120004",
      status: 0,
    });
  });

  it("should keep status a number so 0 survives encoding", () => {
    const payload = createClient().buildUpdateBeneficiaryStatusPayload({
      payee: "318111358120004",
      status: 0,
    });

    expect(typeof decryptRSA(payload.body!.merchant_auth as string).status).toBe("number");
  });

  it("should support activating a beneficiary", () => {
    const payload = createClient().buildUpdateBeneficiaryStatusPayload({
      payee: "318111358120004",
      status: 1,
    });

    expect(decryptRSA(payload.body!.merchant_auth as string).status).toBe(1);
  });

  it("should hash request_time and merchant_auth only, base64 encoded", () => {
    const payload = createClient().buildUpdateBeneficiaryStatusPayload({
      payee: "318111358120004",
      status: 1,
    });

    const expected = createHmac("sha512", API_KEY)
      .update(String(payload.body!.request_time) + String(payload.body!.merchant_auth))
      .digest("base64");

    expect(payload.hash).toBe(expected);
  });
});

describe("Split & Payout instruction on buildTransactionPayload", () => {
  it("should base64 encode a payout array", () => {
    const payout = [
      { acc: "000133879", amt: 1 },
      { acc: "000133880", amt: 1 },
    ];
    const payload = createClient().buildTransactionPayload({
      tran_id: "ORDER-123",
      amount: 2,
      payout,
    });

    expect(payload.fields.payout).toBe(
      Buffer.from(JSON.stringify(payout)).toString("base64"),
    );
  });

  it("should produce the same field for an array and a pre-encoded string", () => {
    const client = createClient();
    const payout = [{ acc: "000133879", amt: 1 }];
    const encoded = Buffer.from(JSON.stringify(payout)).toString("base64");

    const fromArray = client.buildTransactionPayload({
      tran_id: "ORDER-123",
      amount: 1,
      payout,
    });
    const fromString = client.buildTransactionPayload({
      tran_id: "ORDER-123",
      amount: 1,
      payout: encoded,
    });

    expect(fromArray.fields.payout).toBe(fromString.fields.payout);
  });

  it("should include the encoded payout in the hash", () => {
    const client = createClient();
    const withPayout = client.buildTransactionPayload({
      tran_id: "ORDER-123",
      amount: 2,
      payout: [{ acc: "000133879", amt: 1 }],
    });
    const withoutPayout = client.buildTransactionPayload({
      tran_id: "ORDER-123",
      amount: 2,
    });

    expect(withPayout.hash).not.toBe(withoutPayout.hash);
  });

  it("should omit payout when not provided", () => {
    const payload = createClient().buildTransactionPayload({
      tran_id: "ORDER-123",
      amount: 2,
    });

    expect(payload.fields.payout).toBeUndefined();
  });
});

describe("execute with JSON endpoints", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function mockJsonResponse(body: unknown) {
    return vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      headers: new Headers({ "content-type": "application/json" }),
      json: async () => body,
    } as Response);
  }

  it("should send a JSON body with the JSON content type header", async () => {
    const fetchSpy = mockJsonResponse({ status: { code: "0", message: "Success!" } });

    const client = createClient();
    const payload = client.buildPayoutPayload({
      tran_id: "PAYOUT-123",
      beneficiaries: [{ account: "200030000", amount: 3.44 }],
      amount: 3.44,
      currency: "USD",
    });

    await client.execute(payload);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(payload.url);
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify(payload.body));
    expect(init.body).not.toBeInstanceOf(FormData);
  });

  it("should serialize the amount as a number, not a string", async () => {
    const fetchSpy = mockJsonResponse({ status: { code: "0" } });

    const client = createClient();
    await client.execute(
      client.buildPayoutPayload({
        tran_id: "PAYOUT-123",
        beneficiaries: [{ account: "200030000", amount: 3.44 }],
        amount: 3.44,
        currency: "USD",
      }),
    );

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(JSON.parse(init.body as string).amount).toBe(3.44);
  });

  it("should return the payout response", async () => {
    mockJsonResponse({
      transaction_id: "172595840773178",
      transaction_amount: 3.44,
      status: { code: "0", message: "Success!", tran_id: "1", trace_id: "abc" },
    });

    const client = createClient();
    const result: any = await client.execute(
      client.buildPayoutPayload({
        tran_id: "PAYOUT-123",
        beneficiaries: [{ account: "200030000", amount: 3.44 }],
        amount: 3.44,
        currency: "USD",
      }),
    );

    expect(result.status.code).toBe("0");
    expect(result.transaction_id).toBe("172595840773178");
  });

  it("should send JSON for the whitelist endpoints", async () => {
    const fetchSpy = mockJsonResponse({ status: { code: "00", message: "Success!" } });

    const client = createClient();
    const payload = client.buildAddBeneficiaryPayload({ payee: "318111358120004" });
    await client.execute(payload);

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(payload.body);
  });

  it("should still send FormData for form endpoints", async () => {
    const fetchSpy = mockJsonResponse({ status: { code: "00" } });

    const client = createClient();
    await client.execute(client.buildCheckTransactionPayload("ORDER-123"));

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.headers).toBeUndefined();
  });
});
