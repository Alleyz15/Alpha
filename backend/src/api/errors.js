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
  // A money-moving action whose checks did not pass. Nothing was sent.
  PRECONDITION_FAILED: 412,
  // The chain rejected the transfer. Nothing moved - this is a definite answer
  // and it is safe to say so.
  TRANSFER_REVERTED: 502,

  // ---------------------------------------------------------------------
  // NOT A FAILURE. The transaction MAY have landed.
  // ---------------------------------------------------------------------
  //
  // 502 would sit beside every other upstream problem and invite a retry
  // button; a retry here pays twice and cannot be undone. 409 says the
  // request cannot be repeated, which is exactly the instruction, and the
  // body carries doNotRetry and `sent: null` rather than false.
  OUTCOME_UNKNOWN: 409,

  // The user asked to borrow more than their protection supports. Theirs.
  CREDIT_LIMIT_EXCEEDED: 400,
  // OUR operator wallet cannot fund the draw. 503, not 400: the request is
  // valid and the user's collateral is sufficient - we are the constraint, and
  // it is temporary. A 400 would blame the caller for our float.
  INSUFFICIENT_FLOAT: 503,
  // A vault deposit was previewed for an asset that has no above-spot buyable
  // call on the book right now. 409, not 400 or 502: the request is well-formed
  // and nothing is broken - the market for this asset is simply thin at this
  // moment, and the interface should say so and offer another asset. The
  // message is safe to surface, so it passes through rather than being scrubbed.
  NO_BUYABLE_CALLS: 409,
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
