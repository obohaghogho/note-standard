/**
 * Strict Transaction State Machine for Enterprise Payouts
 * ────────────────────────────────────────────────────────
 * Enforces legal state transition sequences for financial safety.
 * Illegal state jumps (e.g. SUCCESSFUL -> PROCESSING or FAILED -> SUCCESSFUL without reconciliation) are strictly blocked.
 */

const WITHDRAWAL_STATES = Object.freeze({
  CREATED:          "CREATED",
  VALIDATED:        "VALIDATED",
  RESERVED:         "RESERVED",
  SENT_TO_PROVIDER: "SENT_TO_PROVIDER",
  PROCESSING:       "PROCESSING",
  SUCCESSFUL:       "SUCCESSFUL",
  FAILED:           "FAILED",
  REVERSED:         "REVERSED",
  MANUAL_REVIEW:    "MANUAL_REVIEW",
  CANCELLED:        "CANCELLED",
});

const LEGAL_TRANSITIONS = Object.freeze({
  [WITHDRAWAL_STATES.CREATED]: [
    WITHDRAWAL_STATES.VALIDATED,
    WITHDRAWAL_STATES.FAILED,
    WITHDRAWAL_STATES.CANCELLED
  ],
  [WITHDRAWAL_STATES.VALIDATED]: [
    WITHDRAWAL_STATES.RESERVED,
    WITHDRAWAL_STATES.MANUAL_REVIEW,
    WITHDRAWAL_STATES.FAILED,
    WITHDRAWAL_STATES.CANCELLED
  ],
  [WITHDRAWAL_STATES.RESERVED]: [
    WITHDRAWAL_STATES.SENT_TO_PROVIDER,
    WITHDRAWAL_STATES.MANUAL_REVIEW,
    WITHDRAWAL_STATES.FAILED,
    WITHDRAWAL_STATES.REVERSED,
    WITHDRAWAL_STATES.CANCELLED
  ],
  [WITHDRAWAL_STATES.SENT_TO_PROVIDER]: [
    WITHDRAWAL_STATES.PROCESSING,
    WITHDRAWAL_STATES.SUCCESSFUL,
    WITHDRAWAL_STATES.FAILED,
    WITHDRAWAL_STATES.REVERSED
  ],
  [WITHDRAWAL_STATES.PROCESSING]: [
    WITHDRAWAL_STATES.SUCCESSFUL,
    WITHDRAWAL_STATES.FAILED,
    WITHDRAWAL_STATES.REVERSED,
    WITHDRAWAL_STATES.MANUAL_REVIEW
  ],
  [WITHDRAWAL_STATES.MANUAL_REVIEW]: [
    WITHDRAWAL_STATES.RESERVED,
    WITHDRAWAL_STATES.SENT_TO_PROVIDER,
    WITHDRAWAL_STATES.REJECTED,
    WITHDRAWAL_STATES.CANCELLED,
    WITHDRAWAL_STATES.REVERSED
  ],
  // Terminal States
  [WITHDRAWAL_STATES.SUCCESSFUL]: [],
  [WITHDRAWAL_STATES.FAILED]:     [WITHDRAWAL_STATES.REVERSED], // Allow reversal transition for audit
  [WITHDRAWAL_STATES.REVERSED]:   [],
  [WITHDRAWAL_STATES.CANCELLED]:  [],
});

class InvalidStateTransitionError extends Error {
  constructor(currentState, nextState) {
    super(`Invalid State Transition: Cannot transition transaction state from '${currentState}' to '${nextState}'`);
    this.name = "InvalidStateTransitionError";
    this.currentState = currentState;
    this.nextState = nextState;
  }
}

/**
 * Validates if a state transition is legal.
 * @param {string} currentState 
 * @param {string} nextState 
 * @returns {boolean}
 */
function canTransition(currentState, nextState) {
  if (currentState === nextState) return true; // No-op transition
  const allowed = LEGAL_TRANSITIONS[currentState] || [];
  return allowed.includes(nextState);
}

/**
 * Asserts a legal transition; throws InvalidStateTransitionError if illegal.
 * @param {string} currentState 
 * @param {string} nextState 
 */
function assertTransition(currentState, nextState) {
  if (!canTransition(currentState, nextState)) {
    throw new InvalidStateTransitionError(currentState, nextState);
  }
}

module.exports = {
  WITHDRAWAL_STATES,
  canTransition,
  assertTransition,
  InvalidStateTransitionError,
};
