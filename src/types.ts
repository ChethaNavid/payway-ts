/**
 * Credentials and endpoint configuration shared by every payload builder
 *
 * `PayWayClient` satisfies this interface, so it can be passed directly to the
 * builder functions in `payloads/`.
 */
export interface PayWayConfig {
  /**
   * Base URL of the PayWay API (e.g. https://checkout-sandbox.payway.com.kh/)
   */
  base_url: string;

  /**
   * Your merchant ID from ABA Bank
   */
  merchant_id: string;

  /**
   * Your API key from ABA Bank, used to sign requests
   */
  api_key: string;

  /**
   * ABA Bank's RSA public key. Required for pre-auth and payout operations.
   */
  rsa_public_key?: string;
}

export type TransactionStatus =
  | "APPROVED"
  | "DECLINED"
  | "PENDING"
  | "PRE-AUTH"
  | "CANCELLED"
  | "REFUNDED"
  | string & {}


export type ReturnType = {
  status: {
    code: string;
    message: string;
    tran_id: string;
  };
  qr_string: string;
  abapay_deeplink: string;
  checkout_qr_url: string;
};

export interface PaywayPaymentStatusCheckResponse {
  data: {
    payment_status_code: number;
    total_amount: number;
    original_amount: number;
    refund_amount: number;
    discount_amount: number;
    payment_amount: number;
    payment_currency: string;
    apv: string;
    payment_status: string;
    transaction_date: string;
  };
  status: {
    code: string;
    message: string;
    tran_id: string;
  };
}

export type PaymentOption =
  | "cards"
  | "abapay_khqr"
  | "abapay"
  | "abapay_deeplink"
  | "abapay_khqr_deeplink"
  | "wechat"
  | "alipay"
  |"google_pay"
  | string & {}

export type ViewType =
  | "hosted_view"  // Redirect payer to a new tab
  | "popup"        // Display as bottom sheet on mobile, modal on desktop
  | string & {}

export interface CreateTransactionParams {
  tran_id?: string;
  payment_option?: PaymentOption;
  amount?: number | string;
  currency?: "USD" | "KHR";
  return_url?: string;
  return_deeplink?: { android_scheme: string; ios_scheme: string };
  continue_success_url?: string;
  firstname?: string;
  lastname?: string;
  email?: string;
  phone?: string;
  items?: string
  shipping?: number
  cancel_url?: string
  skip_success_page?: number | boolean 
  custom_fields?: string
  return_params?: string
  payment_gate?: number
  /**
   * Split & Payout instruction for this transaction.
   *
   * Pass a `PayoutItem[]` and it will be JSON encoded and base64 encoded for you,
   * or pass an already base64 encoded string to send it through untouched.
   *
   * Beneficiaries must be whitelisted first (see `AddBeneficiaryParams`).
   */
  payout?: PayoutItem[] | string
  additional_params?: string
  lifetime?: number
  google_play_token?: string
  type?: "purchase" | "pre-auth",
  view_type?: ViewType;
}

export interface CheckTransactionParams {
  tran_id: string;
}

export interface TransactionListParams {
  limit_additional_params?: string
  limit_limit_amount?: number
  limit_limit_currency?: string
  limit_limit_payment_option?: PaymentOption
  limit_limit_view_type?: ViewType
  limit_limit_type?: "purchase" | "pre-auth"
  limit_limit_firstname?: string
  limit_limit_lastname?: string
  from_date?: string;
  to_date?: string;
  from_amount?: string | number;
  to_amount?: string | number;
  status?: TransactionStatus;
}

/**
 * Response from payload builder methods
 * Contains all fields needed to submit a form to PayWay API
 */
export interface PayloadBuilderResponse {
  /**
   * All form fields including hash (ready to iterate and create form inputs)
   */
  fields: Record<string, string>;
  
  /**
   * The HMAC-SHA512 hash signature (also included in fields)
   */
  hash: string;
  
  /**
   * Full URL to submit the form to
   */
  url: string;
  
  /**
   * HTTP method (always "POST" for PayWay)
   */
  method: "POST";

  /**
   * Request body for JSON endpoints, with values in their native types
   * (numbers stay numbers).
   *
   * Only present when `contentType` is "application/json".
   */
  body?: Record<string, unknown>;

  /**
   * Content type the endpoint expects.
   *
   * Defaults to "multipart/form-data" when absent, which is what every
   * endpoint except Payout and the beneficiary whitelist APIs uses.
   */
  contentType?: "multipart/form-data" | "application/json";
}

/**
 * Options for executing server-to-server API calls
 */
export interface ExecuteOptions {
  /**
   * Allow HTML responses (default: false)
   * 
   * Set to true if you intentionally want to receive HTML responses.
   * Normally, server-to-server calls should only receive JSON.
   * 
   * WARNING: Using payment_option "abapay" returns HTML and should use
   * client-side form submission instead of server-to-server execution.
   */
  allowHtml?: boolean;
}

/**
 * Error thrown when PayWay API request fails
 * 
 * Contains detailed information about the error including
 * HTTP status code and response body from ABA PayWay
 */
export interface PayWayAPIError extends Error {
  /**
   * HTTP status code (e.g., 403, 500)
   */
  status: number;
  
  /**
   * HTTP status text (e.g., "Forbidden", "Internal Server Error")
   */
  statusText: string;
  
  /**
   * Response body from ABA PayWay API
   * Can be JSON object with error details or plain text
   */
  body: any;
}

/**
 * Parameters for completing a pre-auth transaction
 */
export interface CompletePreAuthParams {
  /**
   * Transaction ID of the pre-authorized transaction
   */
  tran_id: string;
  
  /**
   * Amount to complete (required)
   * For card payments: can be up to 10% more than original amount
   */
  complete_amount: number | string;
}

/**
 * Individual payout item for distributing funds
 */
export interface PayoutItem {
  /**
   * Account number to receive payout
   */
  acc: string;
  
  /**
   * Amount to payout to this account
   */
  amt: number;
}

/**
 * Parameters for completing a pre-auth transaction with payout
 */
export interface CompletePreAuthWithPayoutParams {
  /**
   * Transaction ID of the pre-authorized transaction
   */
  tran_id: string;
  
  /**
   * Amount to complete (required)
   * For card payments: can be up to 10% more than original amount
   */
  complete_amount: number | string;
  
  /**
   * Payout array containing account and amount for each beneficiary
   * Funds will be distributed according to this array
   */
  payout: PayoutItem[];
}

/**
 * Parameters for canceling a pre-auth transaction
 */
export interface CancelPreAuthParams {
  /**
   * Transaction ID of the pre-authorized transaction to cancel
   */
  tran_id: string;
}

/**
 * Response from pre-auth operations (complete or cancel)
 */
export interface PreAuthResponse {
  /**
   * Final transaction amount (for completed transactions)
   */
  grand_total?: number;
  
  /**
   * Currency code
   */
  currency?: string;
  
  /**
   * Transaction status after the operation
   * - "COMPLETED" for successful completion
   * - "CANCELLED" for successful cancellation
   */
  transaction_status: "COMPLETED" | "CANCELLED" | string;
  
  /**
   * Operation status details
   */
  status: {
    /**
     * Status code (e.g., "00" for success)
     */
    code: string;

    /**
     * Human-readable status message
     */
    message: string;
  };
}

/**
 * Beneficiary entry for the standalone Payout API
 *
 * Note the full-word keys: the Split & Payout instruction used by purchase and
 * pre-auth completion uses the shorter `acc` / `amt` keys instead (see `PayoutItem`).
 */
export interface PayoutBeneficiary {
  /**
   * ABA account number or merchant MID
   * Must already be whitelisted, otherwise the payout is rejected with code 37
   */
  account: string;

  /**
   * Amount to credit this beneficiary, in the transaction currency
   */
  amount: number;
}

/**
 * Parameters for a standalone payout
 *
 * Distributes funds from your settlement account to whitelisted beneficiaries.
 * Unrelated to any customer purchase - it has its own transaction ID.
 */
export interface PayoutParams {
  /**
   * Unique transaction ID for this payout (max 20 characters)
   */
  tran_id: string;

  /**
   * Beneficiaries to credit (maximum 10 per request)
   * All beneficiaries must share the transaction currency
   */
  beneficiaries: PayoutBeneficiary[];

  /**
   * Total payout amount, which must equal the sum of all beneficiary amounts
   * Minimum 0.01 USD or 100 KHR
   */
  amount: number | string;

  /**
   * Transaction currency
   */
  currency: "USD" | "KHR";

  /**
   * Additional metadata associated with the payout
   * Objects are JSON encoded for you. Max 255 characters once serialized.
   */
  custom_fields?: string | Record<string, unknown>;
}

/**
 * Parameters for adding a beneficiary to the payout whitelist
 */
export interface AddBeneficiaryParams {
  /**
   * Beneficiary identifier: an ABA account number or a merchant MID
   */
  payee: string;
}

/**
 * Parameters for enabling or disabling a whitelisted beneficiary
 */
export interface UpdateBeneficiaryStatusParams {
  /**
   * Beneficiary identifier: an ABA account number or a merchant MID
   */
  payee: string;

  /**
   * 1 to activate the beneficiary, 0 to disable it
   */
  status: 0 | 1;
}

/**
 * Response from the standalone Payout API
 *
 * On failure only `status` is populated.
 */
export interface PayoutResponse {
  /**
   * Transaction ID passed by the merchant
   */
  transaction_id?: string;

  /**
   * Approved date and time of the transaction
   */
  transaction_date?: string;

  /**
   * Unique reference booking entry number from the core banking system
   */
  external_reference?: string;

  /**
   * Random 6 digit number generated by the payment gateway
   */
  apv?: string;

  transaction_amount?: number;
  transaction_currency?: string;

  /**
   * Per-beneficiary result of the distribution
   */
  beneficiaries?: Array<{
    /**
     * Unique payout ID generated by the payment gateway
     */
    payout_id: string;

    /**
     * Beneficiary name
     */
    name: string;

    /**
     * Beneficiary identifier: MID for a merchant, or ABA account number
     * Note: the misspelling matches the PayWay API response
     */
    mid_acccount: string;

    amount: number;
    currency: string;
  }>;

  status: {
    /**
     * "0" on success. Notable failures: 24 (cannot decrypt), 25 (more than 10
     * beneficiaries), 37 (accounts not whitelisted), 83 (duplicate transaction),
     * 92 (payout total does not match transaction amount), 93 (insufficient balance)
     */
    code: string;
    message: string;
    tran_id: string;

    /**
     * Unique ID generated by the payment gateway, used to trace errors with ABA
     */
    trace_id: string;
  };
}

/**
 * Response from the add / update beneficiary whitelist APIs
 *
 * On failure only `status` is populated.
 */
export interface BeneficiaryResponse {
  data?: {
    /**
     * Outlet name if the payee is a MID, otherwise the account holder's name
     */
    name: string;

    /**
     * The destination beneficiary: MID or ABA account number
     */
    payee: string;

    /**
     * Merchant currency if the payee is a MID, otherwise the account currency
     */
    currency: string;

    /**
     * "Merchant" if the payee is a MID, otherwise "ABA Account"
     */
    type: "Merchant" | "ABA Account" | (string & {});

    /**
     * 1 = Active, 0 = Inactive
     */
    status: 0 | 1;

    /**
     * When the beneficiary was added to the whitelist
     */
    created_at: string;
  };

  status: {
    /**
     * "00" on success. Notable failures: PTL02 (wrong hash), PTL134 (account not
     * found), PTL146 (invalid payee), PTL147 (currency mismatch), PTL148 (payee
     * already exists), PTL149 (invalid whitelist account)
     */
    code: string;
    message: string;
  };
}
