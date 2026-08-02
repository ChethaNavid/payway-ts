import { describe, it, expect, vi, afterEach } from "vitest";
import { createHmac } from "node:crypto";
import { PayWayClient } from "../src/index.js";

const BASE_URL = "https://checkout-sandbox.payway.com.kh/";
const MERCHANT_ID = "merchant_123";
const API_KEY = "api_key_456";
const TRAN_ID = "ORDER-123";

function createClient() {
  return new PayWayClient(BASE_URL, MERCHANT_ID, API_KEY);
}

describe("buildCloseTransactionPayload", () => {
  it("should build payload with correct URL, method and content type", () => {
    const payload = createClient().buildCloseTransactionPayload(TRAN_ID);

    expect(payload.url).toBe(
      `${BASE_URL}api/payment-gateway/v1/payments/close-transaction`,
    );
    expect(payload.method).toBe("POST");
    expect(payload.contentType).toBe("application/json");
  });

  it("should send req_time, merchant_id, tran_id and hash in that order", () => {
    const payload = createClient().buildCloseTransactionPayload(TRAN_ID);

    expect(Object.keys(payload.fields)).toEqual([
      "req_time",
      "merchant_id",
      "tran_id",
      "hash",
    ]);
    expect(payload.fields.merchant_id).toBe(MERCHANT_ID);
    expect(payload.fields.tran_id).toBe(TRAN_ID);
  });

  it("should format req_time as yyyyMMddHHmmss", () => {
    const payload = createClient().buildCloseTransactionPayload(TRAN_ID);

    expect(payload.fields.req_time).toMatch(/^\d{14}$/);
  });

  it("should hash req_time, merchant_id and tran_id, base64 encoded", () => {
    const payload = createClient().buildCloseTransactionPayload(TRAN_ID);

    const expected = createHmac("sha512", API_KEY)
      .update(payload.fields.req_time + MERCHANT_ID + TRAN_ID)
      .digest("base64");

    expect(payload.hash).toBe(expected);
    expect(payload.fields.hash).toBe(expected);
    expect(payload.body!.hash).toBe(expected);
  });

  it("should mirror the fields into the JSON body", () => {
    const payload = createClient().buildCloseTransactionPayload(TRAN_ID);

    expect(payload.body).toEqual(payload.fields);
  });

  it("should sign the same values as a check transaction for the same tran_id", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 2, 10, 14, 30, 0));

    try {
      const client = createClient();
      const close = client.buildCloseTransactionPayload(TRAN_ID);
      const check = client.buildCheckTransactionPayload(TRAN_ID);

      // Only the URL and the wire format differ - the signature is identical
      expect(close.hash).toBe(check.hash);
      expect(close.url).not.toBe(check.url);
      expect(check.contentType).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("execute with buildCloseTransactionPayload", () => {
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
    const fetchSpy = mockJsonResponse({
      status: { code: "00", message: "Success!", tran_id: TRAN_ID },
    });

    const client = createClient();
    const payload = client.buildCloseTransactionPayload(TRAN_ID);
    await client.execute(payload);

    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(payload.url);
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(init.body).toBe(JSON.stringify(payload.body));
    expect(init.body).not.toBeInstanceOf(FormData);
  });

  it("should return the close transaction response", async () => {
    mockJsonResponse({
      status: { code: "00", message: "Success!", tran_id: "1729573626" },
    });

    const client = createClient();
    const result: any = await client.execute(
      client.buildCloseTransactionPayload(TRAN_ID),
    );

    expect(result.status.code).toBe("00");
    expect(result.status.tran_id).toBe("1729573626");
  });

  it("should surface a transaction not found response", async () => {
    mockJsonResponse({
      status: { code: "5", message: "Transaction not found", tran_id: TRAN_ID },
    });

    const client = createClient();
    const result: any = await client.execute(
      client.buildCloseTransactionPayload(TRAN_ID),
    );

    expect(result.status.code).toBe("5");
  });
});
