// HTTP error envelope.
//
// The API layer's whole job at the edges is translation: HTTP in, domain call,
// domain error out as a status code. It does not know what BR-49 is and does
// not re-check business rules - those live in the domain, and a second
// implementation here would be a second answer to the same question.

/** Domain error code -> HTTP status. */
const STATUS_BY_CODE = {
  QUOTE_EXPIRED: 409,
  BALANCE_EXCEEDED: 400,
  NO_EXPIRY: 404,
  NO_TIERS: 404,
  // A named thing that does not exist. Unlisted codes fall through to
  // UPSTREAM_ERROR, which would tell the caller the service broke when in fact
  // they asked for something that is not there.
  NOT_FOUND: 404,
  // A third-party market-data provider is rate-limiting us, unreachable, or
  // answering with something we cannot use. 503 rather than 502 because it is
  // temporary by nature and the interface should say "unavailable, try again"
  // rather than "something is broken".
  MARKET_DATA_UNAVAILABLE: 503,
  // A repayment transaction was supplied and did not hold up. 400 rather than
  // 422: the caller can fix it by sending the right transaction, and the
  // response carries the checklist so they can see which check failed.
  REPAYMENT_UNVERIFIED: 400,
  // The action is not available in the resource's current state - a loan that
  // is already repaid, a vault already matured. 409, because nothing about the
  // request is malformed; it simply arrived too late.
  CONFLICT: 409,
  INVALID_REQUEST: 400,
  UPSTREAM_ERROR: 502,
};

export function statusForCode(code) {
  return STATUS_BY_CODE[code] ?? 500;
}

/**
 * An error raised by the API layer itself - a malformed body, an unknown
 * route. Domain refusals arrive as QuoteRefusedError and are mapped by code.
 */
export class ApiError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.details = details;
  }
}

/**
 * Turn any thrown value into { status, body } in the agreed envelope.
 *
 * Anything unrecognised becomes UPSTREAM_ERROR: an RPC timeout, a Supabase
 * outage or a bug all look the same from the browser, and the interface says
 * "live pricing is unavailable" rather than leaking a stack trace.
 *
 * @param {unknown} error
 * @returns {{ status: number, body: object }}
 */
export function toErrorResponse(error) {
  const code = error?.code && STATUS_BY_CODE[error.code] ? error.code : 'UPSTREAM_ERROR';
  const status = statusForCode(code);

  // Never surface an internal message for an unmapped failure - it may carry a
  // connection string or a key fragment.
  const message = code === 'UPSTREAM_ERROR' && !STATUS_BY_CODE[error?.code]
    ? 'The service could not complete this request.'
    : (error?.message ?? 'Request failed');

  return {
    status,
    body: {
      error: {
        code,
        message,
        ...(error?.details && Object.keys(error.details).length > 0
          ? { details: error.details }
          : {}),
      },
    },
  };
}
