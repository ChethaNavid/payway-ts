import type {
  PayloadBuilderResponse,
  ExecuteOptions,
  ReturnType,
  PaywayPaymentStatusCheckResponse,
  PayoutResponse,
  BeneficiaryResponse,
} from "./types.js";

/**
 * HTTP transport for server-to-server calls.
 *
 * @packageDocumentation
 */

/**
 * Response types a PayWay endpoint can return
 */
export type ExecuteResult =
  | ReturnType
  | PaywayPaymentStatusCheckResponse
  | PayoutResponse
  | BeneficiaryResponse
  | string;

/**
 * Executes a payload against the PayWay API
 *
 * Payout and beneficiary whitelist payloads are sent as JSON; everything else
 * is sent as multipart form data.
 *
 * @param payload - Payload from any build method
 * @param options - Execution options
 * @returns Parsed response from ABA PayWay
 *
 * @throws {PayWayAPIError} If the HTTP request fails - includes status, statusText, and response body
 * @throws {Error} If payment_option is "abapay" and allowHtml is false
 * @throws {Error} If the response is HTML and allowHtml is false
 */
export async function execute(
  payload: PayloadBuilderResponse,
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  const { allowHtml = false } = options;

  // Validation: Prevent accidental abapay server-to-server calls
  if (payload.fields.payment_option === "abapay" && !allowHtml) {
    throw new Error(
      'Cannot execute server-to-server call with payment_option "abapay". ' +
        "ABA PayWay returns HTML for abapay which should be displayed via client-side form submission. " +
        "Use buildTransactionPayload() and create a form in the browser instead. " +
        "If you really need to get the HTML on the server, pass { allowHtml: true }.",
    );
  }

  // Payout and beneficiary whitelist endpoints expect JSON, everything else
  // expects multipart form data
  let requestInit: RequestInit;
  if (payload.contentType === "application/json") {
    requestInit = {
      method: payload.method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload.body ?? payload.fields),
    };
  } else {
    const formData = new FormData();
    for (const [key, value] of Object.entries(payload.fields)) {
      formData.append(key, value);
    }
    requestInit = { method: payload.method, body: formData };
  }

  // Make request to ABA PayWay
  const response = await fetch(payload.url, requestInit);

  if (!response.ok) {
    // Try to get error details from response body
    let errorBody: any;
    try {
      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        errorBody = await response.json();
      } else {
        errorBody = await response.text();
      }
    } catch {
      errorBody = null;
    }

    // Create detailed error message
    const error: any = new Error(
      `PayWay API Error: ${response.status} ${response.statusText}`,
    );
    error.status = response.status;
    error.statusText = response.statusText;
    error.body = errorBody;

    throw error;
  }

  // Parse response based on Content-Type
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    // Expected: JSON response
    return (await response.json()) as ReturnType;
  } else if (contentType.includes("text/html")) {
    // HTML response (likely abapay or error page)
    if (!allowHtml) {
      throw new Error(
        "Received HTML response but expected JSON. " +
          'This usually means payment_option "abapay" was used, which returns an HTML checkout page. ' +
          "Use client-side form submission for abapay payments. " +
          "If you intentionally want the HTML, pass { allowHtml: true }.",
      );
    }
    return await response.text();
  } else {
    // Unknown content type - try JSON first, then text
    try {
      return (await response.json()) as ReturnType;
    } catch {
      if (!allowHtml) {
        throw new Error(
          `Unexpected content-type: ${contentType}. ` +
            "Response is not JSON and allowHtml is false.",
        );
      }
      return await response.text();
    }
  }
}
