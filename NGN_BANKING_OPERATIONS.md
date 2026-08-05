# NGN Banking Operational Playbook

## 1. Deposit Processing Flow
1. User requests NGN deposit instructions.
2. `DepositSessionService` initializes a 24-hour deposit session (`dep_01K...`) and generates/retrieves the user's permanent reference (`NS-NGN-XXXXXXXX`).
3. User transfers funds via bank app to Guaranty Trust Bank account `5000701121`.
4. Fincra sends an HMAC-SHA256 verified webhook to NoteStandard.
5. `DepositEventQueue` enqueues the event with a unique correlation ID (`corr_01K...`).
6. `DepositMatchingService` executes 7-stage priority matching.
7. `DepositFraudRiskEngine` screens pre-ledger risk.
8. Double-entry ledger is credited and `DepositNotificationPipeline` notifies the user.

---

## 2. Exception & Manual Review Handling
Deposits arriving for expired 24h sessions or flagged by the risk engine move to `MANUAL_REVIEW` status in the Unknown Deposit Queue for admin resolution (Assign User, Refund, Merge, Reject, Annotate).
