const path = require("path");
const supabase = require(path.join(__dirname, "..", "..", "config", "database"));
const sendgridEmailService = require("../../services/sendgridEmailService");
const logger = require("../../utils/logger");
const { createClient } = require("@supabase/supabase-js");

// Service role Supabase client for admin actions (balance updates)
const getServiceSupabase = () => {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );
};

/**
 * AUTO-CREDIT LIMIT GATE
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads the configurable auto-credit threshold from admin_settings.
 * Returns the limit for the given currency (defaults to 50,000 NGN / 50 USD).
 *
 * Deposits ≤ limit  → auto-credited immediately (no admin required)
 * Deposits > limit  → flagged as "pending_admin_review" for manual approval
 */
const DEFAULT_AUTO_CREDIT_LIMITS = {
  NGN: 50000,
  USD: 50,
  EUR: 50,
  GBP: 40,
  USDT: 50,
  USDC: 50,
};

async function getAutoApproveLimit(currency) {
  try {
    const { data } = await supabase
      .from("admin_settings")
      .select("value")
      .eq("key", "deposit_auto_credit_config")
      .maybeSingle();

    if (data && data.value && data.value.enabled === true) {
      const key = `limit_${currency.toLowerCase()}`;
      const limit = parseFloat(data.value[key]);
      if (!isNaN(limit)) return limit;
    }
  } catch (e) {
    logger.warn("[ManualDeposit] Could not read auto_credit config, using default:", e.message);
  }

  // Fallback to in-memory defaults
  return DEFAULT_AUTO_CREDIT_LIMITS[currency.toUpperCase()] ?? 50000;
}

/**
 * CORE CREDIT HELPER
 * ─────────────────────────────────────────────────────────────────────────────
 * Routes through DepositCreditEngine (the single authoritative credit path).
 * This guarantees exactly-once wallet credit via confirm_deposit_v7 RPC.
 */
async function creditWallet(userId, depositRecord, currency, amount) {
  const serviceSupabase = getServiceSupabase();
  const walletService = require("../../services/walletService");
  const DepositCreditEngine = require("../../services/payment/DepositCreditEngine");

  // 1. Ensure wallet exists
  const wallet = await walletService.createWallet(userId, currency.toUpperCase(), "native");
  if (!wallet) throw new Error("Could not find or create user wallet");

  // 2. Create a PENDING transaction record — DepositCreditEngine will flip it to COMPLETED
  //    Using deposit.id as reference_id is the idempotency anchor: if this exact
  //    manual_deposit record is re-processed, the ledger's idempotency_key check
  //    (COALESCE(reference_id, provider_reference, id::text)) will catch the duplicate.
  const { data: tx, error: txErr } = await serviceSupabase
    .from("transactions")
    .insert([{
      wallet_id:    wallet.id,
      user_id:      userId,
      type:         "DEPOSIT",
      display_label: "Manual Bank Deposit",
      category:     "funding",
      description:  `Manual deposit for reference ${depositRecord.reference}`,
      amount:       parseFloat(amount),
      currency:     currency.toUpperCase(),
      status:       "PENDING",          // ← PENDING, not COMPLETED, so idempotency guard works
      reference_id: depositRecord.id,   // ← deposit.id as idempotency anchor
      metadata: {
        manual_deposit_id: depositRecord.id,
        reference:         depositRecord.reference,
        source:            "manual_deposit_controller",
      },
    }])
    .select()
    .single();

  if (txErr) {
    // If unique constraint hit → transaction was already created for this deposit
    if (txErr.code === "23505") {
      logger.info(`[ManualDeposit] Transaction already exists for deposit ${depositRecord.id} — fetching existing`);
      const { data: existingTx } = await serviceSupabase
        .from("transactions")
        .select("*")
        .eq("reference_id", depositRecord.id)
        .eq("type", "DEPOSIT")
        .maybeSingle();
      if (existingTx) {
        if (["COMPLETED", "SUCCESS"].includes((existingTx.status || "").toUpperCase())) {
          logger.info(`[ManualDeposit] Deposit ${depositRecord.id} already credited — skipping`);
          return { alreadyCredited: true, txId: existingTx.id };
        }
        // Proceed with the existing PENDING tx
        const result = await DepositCreditEngine.credit({
          transactionId: existingTx.id,
          amount:        parseFloat(amount),
          currency:      currency.toUpperCase(),
          userId,
          source:        "MANUAL_DEPOSIT_SUBMIT",
        });
        return { ...result, txId: result.transactionId };
      }
    }
    throw txErr;
  }

  // 3. Route through DepositCreditEngine for exactly-once credit
  const result = await DepositCreditEngine.credit({
    transactionId: tx.id,
    amount:        parseFloat(amount),
    currency:      currency.toUpperCase(),
    userId,
    source:        "MANUAL_DEPOSIT_SUBMIT",
  });

  return { ...result, txId: result.transactionId };
}

/**
 * Manual Deposit Controller
 */
class ManualDepositController {
  /**
   * GET /api/deposit/initiate
   * Get Grey account details and generate reference
   */
  async initiateDeposit(req, res) {
    try {
      const { currency } = req.query;
      if (!currency) {
        return res.status(400).json({ error: "Currency is required" });
      }

      // Fetch Grey instructions
      const { data: instructions, error } = await supabase
        .from("grey_instructions")
        .select("*")
        .eq("currency", currency.toUpperCase())
        .maybeSingle();

      if (error) throw error;
      if (!instructions) {
        return res.status(404).json({ error: `No deposit instructions found for ${currency}` });
      }

      // Generate unique reference
      const timestamp = Date.now();
      const shortUserId = req.user.id.split("-")[0].toUpperCase();
      const reference = `NS-${shortUserId}-${timestamp}`;

      // Include the auto-credit limit so the UI can inform the user
      const autoApproveLimit = await getAutoApproveLimit(currency);

      res.json({
        instructions,
        reference,
        autoApproveLimit,
        autoApproveMessage:
          autoApproveLimit > 0
            ? `Deposits up to ${autoApproveLimit.toLocaleString()} ${currency.toUpperCase()} are credited instantly. Larger amounts require admin approval.`
            : "All deposits require admin approval.",
      });
    } catch (err) {
      logger.error("[ManualDeposit] Initiate Error:", err.message);
      res.status(500).json({ error: "Failed to initiate deposit" });
    }
  }

  /**
   * POST /api/deposit/submit
   * User submits proof and reference.
   *
   * AUTO-CREDIT LOGIC:
   *   • If amount ≤ auto-approve limit AND proof is provided → instant credit, no admin needed
   *   • If amount > auto-approve limit (high-value) → status = "pending_admin_review", admin notified
   *   • If no proof provided → status = "pending", admin notified
   */
  async submitDeposit(req, res) {
    try {
      const { amount, currency, reference, proofUrl } = req.body;

      if (!amount || amount <= 0 || !currency || !reference) {
        return res.status(400).json({ error: "Invalid deposit details" });
      }

      const numAmount = parseFloat(amount);
      const upCurrency = currency.toUpperCase();

      // ── Duplicate reference check ────────────────────────────────────────
      const { data: existing } = await supabase
        .from("manual_deposits")
        .select("id, status, wallet_credited")
        .eq("reference", reference)
        .maybeSingle();

      if (existing) {
        if (existing.wallet_credited) {
          return res.status(400).json({ error: "This reference has already been submitted and credited" });
        }
        return res.status(400).json({ error: "This reference has already been submitted" });
      }

      // ── Determine auto-credit eligibility ───────────────────────────────
      const autoLimit = await getAutoApproveLimit(upCurrency);
      const isHighValue = numAmount > autoLimit;
      const hasProof = !!proofUrl;

      // Auto-credit: must have proof AND be within the limit
      const shouldAutoCredit = hasProof && !isHighValue;

      let initialStatus;
      let adminNotes;
      let reviewReason = null;

      if (shouldAutoCredit) {
        initialStatus = "approved";
        adminNotes = "Auto-approved: within auto-credit limit with proof provided";
      } else if (isHighValue && hasProof) {
        initialStatus = "pending_admin_review";
        adminNotes = null;
        reviewReason = `Amount ${numAmount} ${upCurrency} exceeds auto-credit limit of ${autoLimit} ${upCurrency}. Admin review required.`;
      } else if (!hasProof) {
        initialStatus = "pending";
        adminNotes = null;
        reviewReason = "No proof of payment provided.";
      } else {
        initialStatus = "pending";
        adminNotes = null;
      }

      // ── Save the deposit record ──────────────────────────────────────────
      const { data: deposit, error } = await supabase
        .from("manual_deposits")
        .insert([{
          user_id:             req.user.id,
          amount:              numAmount,
          currency:            upCurrency,
          reference,
          proof_url:           proofUrl,
          status:              initialStatus,
          admin_notes:         adminNotes,
          auto_credit_applied: shouldAutoCredit,
          review_reason:       reviewReason,
          wallet_credited:     false,
        }])
        .select()
        .single();

      if (error) throw error;

      // ── Auto-credit (below limit, proof provided) ────────────────────────
      if (shouldAutoCredit) {
        try {
          const creditResult = await creditWallet(req.user.id, deposit, upCurrency, numAmount);

          if (creditResult.credited || creditResult.alreadyCredited) {
            // Mark deposit as credited
            await supabase
              .from("manual_deposits")
              .update({
                wallet_credited:     true,
                credited_tx_id:      creditResult.txId || null,
                auto_credit_applied: true,
              })
              .eq("id", deposit.id);

            logger.info(`[ManualDeposit] ✅ Auto-credited ${numAmount} ${upCurrency} for user ${req.user.id}`);

            // Emit live balance update via Socket.io
            try {
              const realtimeService = require("../../services/realtimeService");
              if (realtimeService && typeof realtimeService.emitToUser === "function") {
                realtimeService.emitToUser(req.user.id, "balance_updated", {
                  currency: upCurrency,
                  amount:   numAmount,
                  type:     "DEPOSIT",
                });
              }
            } catch (sockErr) {
              logger.warn("[ManualDeposit] Socket notify warning:", sockErr.message);
            }
          } else {
            // Credit engine failed to apply — revert to pending_admin_review
            logger.error(`[ManualDeposit] Auto-credit engine returned no credit for deposit ${deposit.id}: ${creditResult.error}`);
            await supabase
              .from("manual_deposits")
              .update({
                status:        "pending_admin_review",
                admin_notes:   `Auto-credit failed: ${creditResult.error}. Needs manual review.`,
                review_reason: `Credit engine error: ${creditResult.error}`,
              })
              .eq("id", deposit.id);
          }
        } catch (creditErr) {
          logger.error("[ManualDeposit] Auto-credit error:", creditErr.message);
          // Don't fail the request — revert deposit to pending review
          await supabase
            .from("manual_deposits")
            .update({
              status:        "pending_admin_review",
              review_reason: `Auto-credit exception: ${creditErr.message}`,
            })
            .eq("id", deposit.id);
        }
      } else if (isHighValue) {
        // Notify admin about high-value deposit needing review
        try {
          const notificationService = require("../../services/notificationService");
          await notificationService.notifyAdmins?.({
            type:    "high_value_deposit_pending",
            title:   "High-Value Deposit Pending Review",
            message: `User submitted a ${numAmount.toLocaleString()} ${upCurrency} deposit that exceeds the auto-credit limit (${autoLimit.toLocaleString()} ${upCurrency}). Reference: ${reference}`,
            link:    "/admin/deposits",
          });
        } catch (notifErr) {
          logger.warn("[ManualDeposit] Admin notification error:", notifErr.message);
        }
      }

      // ── Confirmation email ───────────────────────────────────────────────
      try {
        await sendgridEmailService.sendDepositSubmittedEmail(req.user.email, {
          amount,
          currency: upCurrency,
          reference,
        });
      } catch (emailErr) {
        logger.warn("[ManualDeposit] Email warning:", emailErr.message);
      }

      const responseDeposit = await supabase
        .from("manual_deposits")
        .select("*")
        .eq("id", deposit.id)
        .single()
        .then(r => r.data || deposit);

      let message;
      if (responseDeposit.wallet_credited) {
        message = "Deposit verified and wallet credited instantly! Your balance has been updated.";
      } else if (isHighValue) {
        message = `Your deposit of ${numAmount.toLocaleString()} ${upCurrency} is above the auto-credit limit and requires admin review. You will be notified once approved.`;
      } else {
        message = "Deposit submitted successfully. Waiting for admin approval.";
      }

      res.status(201).json({ message, deposit: responseDeposit });
    } catch (err) {
      logger.error("[ManualDeposit] Submit Error:", err.message);
      res.status(500).json({ error: "Failed to submit deposit" });
    }
  }

  /**
   * GET /api/deposit/user
   * List user's manual deposits
   */
  async getUserDeposits(req, res) {
    try {
      const { data, error } = await supabase
        .from("manual_deposits")
        .select("*")
        .eq("user_id", req.user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error("[ManualDeposit] GetUserDeposits Error:", err.message);
      res.status(500).json({ error: "Failed to fetch deposits" });
    }
  }

  /**
   * GET /api/deposit/admin/pending (ADMIN ONLY)
   * Fetches manual deposits from BOTH legacy table and unified transactions table.
   * Supports optional status query parameter: 'all' | 'pending' | 'approved' | 'rejected' | 'pending_admin_review'
   */
  async getPendingDeposits(req, res) {
    try {
      const statusFilter = (req.query.status || "all").toLowerCase();

      // 1. Fetch from legacy manual_deposits table
      let legacyQuery = supabase
        .from("manual_deposits")
        .select("id, user_id, amount, currency, reference, proof_url, status, admin_notes, wallet_credited, auto_credit_applied, review_reason, created_at, updated_at");

      if (statusFilter !== "all") {
        legacyQuery = legacyQuery.eq("status", statusFilter);
      }

      const { data: legacy, error: legacyError } = await legacyQuery.order("created_at", { ascending: false });
      if (legacyError) throw legacyError;

      // 2. Fetch from unified transactions table (New Flow)
      let unifiedQuery = supabase
        .from("transactions")
        .select("id, user_id, amount, currency, reference_id, metadata, status, type, created_at, updated_at")
        .eq("type", "DEPOSIT");

      if (statusFilter === "pending") {
        unifiedQuery = unifiedQuery.eq("status", "PROCESSING");
      } else if (statusFilter === "approved") {
        unifiedQuery = unifiedQuery.eq("status", "COMPLETED");
      } else if (statusFilter === "rejected") {
        unifiedQuery = unifiedQuery.in("status", ["FAILED", "REJECTED", "CANCELLED"]);
      } else if (statusFilter === "pending_admin_review") {
        unifiedQuery = unifiedQuery.eq("status", "PENDING");
      }

      const { data: unified, error: unifiedError } = await unifiedQuery.order("created_at", { ascending: false });
      if (unifiedError) throw unifiedError;

      // Extract unique user IDs
      const userIds = new Set();
      (legacy || []).forEach(d => userIds.add(d.user_id));
      (unified || []).forEach(d => userIds.add(d.user_id));

      // Fetch profiles
      let profilesMap = {};
      if (userIds.size > 0) {
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, email, full_name, username")
          .in("id", Array.from(userIds));

        if (profiles) {
          profiles.forEach(p => profilesMap[p.id] = p);
        }
      }

      // Add profiles to legacy
      const legacyWithProfiles = (legacy || []).map(d => ({
        ...d,
        profile: profilesMap[d.user_id],
      }));

      // 3. Normalize unified transactions to match ManualDeposit interface for UI
      const normalizedUnified = (unified || []).map(tx => {
        let normStatus = "pending";
        if (tx.status === "COMPLETED") normStatus = "approved";
        else if (["FAILED", "REJECTED", "CANCELLED"].includes(tx.status)) normStatus = "rejected";

        return {
          id: tx.id,
          isUnified: true,
          user_id: tx.user_id,
          amount: tx.amount,
          currency: tx.currency,
          reference: tx.metadata?.display_ref || tx.metadata?.reference || tx.reference_id || tx.id,
          proof_url: tx.metadata?.proof_url || tx.metadata?.receipt_url,
          status: normStatus,
          admin_notes: tx.metadata?.admin_notes || tx.metadata?.status_note,
          created_at: tx.created_at,
          updated_at: tx.updated_at,
          profile: profilesMap[tx.user_id],
        };
      });

      // Combine both sources and sort newest first
      const allDeposits = [...legacyWithProfiles, ...normalizedUnified].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      res.json(allDeposits);
    } catch (err) {
      logger.error("[ManualDeposit] Admin Fetch Deposits Error:", err.message);
      res.status(500).json({ error: "Failed to fetch manual deposits" });
    }
  }

  /**
   * PATCH /api/deposit/:id/approve (ADMIN ONLY)
   *
   * IMPORTANT: This endpoint is ONLY for deposits that require admin approval
   * (high-value deposits or deposits without proof). Auto-credited deposits
   * (wallet_credited = true) cannot be re-approved — this prevents double-credit.
   */
  async approveDeposit(req, res) {
    const serviceSupabase = getServiceSupabase();
    try {
      const { id } = req.params;
      const { adminNotes, isUnified } = req.body;

      // ── 1. Fetch deposit details ──────────────────────────────────────────
      let deposit = null;
      if (!isUnified) {
        const { data, error } = await serviceSupabase
          .from("manual_deposits")
          .select("id, user_id, amount, currency, reference, status, wallet_credited, auto_credit_applied")
          .eq("id", id)
          .single();
        if (error) throw error;
        deposit = data;
      } else {
        const { data, error } = await serviceSupabase
          .from("transactions")
          .select("id, user_id, amount, currency, reference_id, metadata, status")
          .eq("id", id)
          .single();
        if (error) throw error;
        deposit = data;
      }

      if (!deposit) {
        return res.status(404).json({ error: "Deposit not found" });
      }

      // ── 2. ANTI-DOUBLE-CREDIT GUARD ───────────────────────────────────────
      // If wallet was already credited (auto-credit path), block re-approval entirely.
      if (!isUnified && deposit.wallet_credited === true) {
        return res.status(409).json({
          error: "This deposit has already been credited to the user's wallet. Re-approval is not allowed.",
          alreadyCredited: true,
        });
      }

      // Fetch user profile for email
      if (deposit) {
        const { data: pData } = await serviceSupabase
          .from("profiles")
          .select("email")
          .eq("id", deposit.user_id)
          .single();
        deposit.profile = pData || { email: "" };
      }

      // ── 3. Status guard — only process deposits that need admin approval ──
      const currentStatus = deposit.status;
      const approvableStatuses = isUnified
        ? ["PROCESSING", "PENDING"]
        : ["pending", "pending_admin_review"];

      if (!approvableStatuses.includes(currentStatus)) {
        return res.status(400).json({
          error: `Cannot approve a deposit with status: ${currentStatus}. Only pending or pending_admin_review deposits can be approved.`,
        });
      }

      // ── 4. Check for existing credited transaction to prevent new duplicate ─
      if (!isUnified) {
        const { data: existingCreditedTx } = await serviceSupabase
          .from("transactions")
          .select("id, status")
          .eq("reference_id", deposit.id)
          .eq("type", "DEPOSIT")
          .in("status", ["COMPLETED", "SUCCESS"])
          .maybeSingle();

        if (existingCreditedTx) {
          // The wallet was credited via a transaction but wallet_credited flag wasn't set — fix the flag
          await serviceSupabase
            .from("manual_deposits")
            .update({
              status:          "approved",
              wallet_credited: true,
              credited_tx_id:  existingCreditedTx.id,
              admin_notes:     `Already credited via tx ${existingCreditedTx.id}. Status corrected by admin ${req.user.id}.`,
              updated_at:      new Date().toISOString(),
            })
            .eq("id", id);

          return res.status(409).json({
            error: "Wallet was already credited for this deposit (existing completed transaction found). Deposit record has been corrected.",
            alreadyCredited: true,
          });
        }
      }

      // ── 5. Mark as approved in legacy table ──────────────────────────────
      if (!isUnified) {
        const { error: updateError } = await serviceSupabase
          .from("manual_deposits")
          .update({
            status:      "approved",
            admin_notes: adminNotes || "Approved by admin",
            updated_at:  new Date().toISOString(),
          })
          .eq("id", id);
        if (updateError) throw updateError;
      } else {
        // Unified flow: update transaction status
        const { error: txUpdateError } = await serviceSupabase
          .from("transactions")
          .update({
            status:       "COMPLETED",
            completed_at: new Date().toISOString(),
            metadata: {
              ...(deposit.metadata || {}),
              approved_by: req.user.id,
              admin_notes: adminNotes,
            },
          })
          .eq("id", id);

        if (txUpdateError) throw txUpdateError;
      }

      // ── 6. Credit the wallet via DepositCreditEngine ──────────────────────
      let creditResult;
      if (!isUnified) {
        creditResult = await creditWallet(deposit.user_id, deposit, deposit.currency, deposit.amount);
      } else {
        // For unified flow, the DepositCreditEngine can pick it up by transaction ID
        const DepositCreditEngine = require("../../services/payment/DepositCreditEngine");
        creditResult = await DepositCreditEngine.credit({
          transactionId: id,
          amount:        deposit.amount,
          currency:      deposit.currency,
          userId:        deposit.user_id,
          source:        "ADMIN_MANUAL_APPROVAL",
        });
      }

      if (creditResult.error && !creditResult.alreadyCredited) {
        logger.error(`[ManualDeposit] Admin approve credit error: ${creditResult.error}`);
        return res.status(500).json({ error: `Deposit approved but wallet credit failed: ${creditResult.error}` });
      }

      // ── 7. Mark wallet_credited = true in manual_deposits ────────────────
      if (!isUnified) {
        await serviceSupabase
          .from("manual_deposits")
          .update({
            wallet_credited: true,
            credited_tx_id:  creditResult.txId || null,
          })
          .eq("id", id);
      }

      // ── 8. Emit real-time balance update ──────────────────────────────────
      try {
        const realtimeService = require("../../services/realtimeService");
        if (realtimeService && typeof realtimeService.emitToUser === "function") {
          realtimeService.emitToUser(deposit.user_id, "balance_updated", {
            currency: deposit.currency,
            amount:   deposit.amount,
            type:     "DEPOSIT",
          });
        }
      } catch (sockErr) {
        logger.warn("[ManualDeposit] Realtime emit warning:", sockErr.message);
      }

      // ── 9. Send Approval Email ────────────────────────────────────────────
      try {
        await sendgridEmailService.sendDepositApprovedEmail(deposit.profile.email, {
          amount:   deposit.amount,
          currency: deposit.currency,
        });
      } catch (emailErr) {
        logger.warn("[ManualDeposit] Approval email warning:", emailErr.message);
      }

      res.json({ message: "Deposit approved and wallet credited successfully" });
    } catch (err) {
      logger.error("[ManualDeposit] Admin Approve Error:", err.message);
      res.status(500).json({ error: "Failed to approve deposit" });
    }
  }

  /**
   * PATCH /api/deposit/:id/reject (ADMIN ONLY)
   */
  async rejectDeposit(req, res) {
    const serviceSupabase = getServiceSupabase();
    try {
      const { id } = req.params;
      const { adminNotes, isUnified } = req.body;

      let deposit = null;
      if (!isUnified) {
        const { data, error } = await serviceSupabase
          .from("manual_deposits")
          .select("id, user_id, amount, currency, status, wallet_credited")
          .eq("id", id)
          .single();
        if (error) throw error;
        deposit = data;
      } else {
        const { data, error } = await serviceSupabase
          .from("transactions")
          .select("id, user_id, amount, currency, metadata, status")
          .eq("id", id)
          .single();
        if (error) throw error;
        deposit = data;
      }

      // Cannot reject an already-credited deposit
      if (!isUnified && deposit?.wallet_credited === true) {
        return res.status(409).json({
          error: "Cannot reject a deposit that has already been credited to the user's wallet.",
        });
      }

      if (deposit) {
        const { data: pData } = await serviceSupabase
          .from("profiles")
          .select("email")
          .eq("id", deposit.user_id)
          .single();
        deposit.profile = pData || { email: "" };
      }

      if (!deposit) {
        return res.status(404).json({ error: "Deposit not found" });
      }

      if (!isUnified) {
        await serviceSupabase
          .from("manual_deposits")
          .update({
            status:      "rejected",
            admin_notes: adminNotes,
            updated_at:  new Date().toISOString(),
          })
          .eq("id", id);
      } else {
        await serviceSupabase
          .from("transactions")
          .update({
            status:   "FAILED",
            metadata: {
              ...(deposit.metadata || {}),
              rejection_reason: adminNotes,
              rejected_at:      new Date().toISOString(),
            },
          })
          .eq("id", id);
      }

      // Send Rejection Email
      try {
        await sendgridEmailService.sendDepositRejectedEmail(deposit.profile.email, {
          amount:   deposit.amount,
          currency: deposit.currency,
          reason:   adminNotes,
        });
      } catch (emailErr) {
        logger.warn("[ManualDeposit] Rejection email warning:", emailErr.message);
      }

      res.json({ message: "Deposit rejected successfully" });
    } catch (err) {
      logger.error("[ManualDeposit] Admin Reject Error:", err.message);
      res.status(500).json({ error: "Failed to reject deposit" });
    }
  }

  /**
   * Auto-reconcile ONLY genuinely pending deposits (no proof, awaiting admin).
   *
   * IMPORTANT: This deliberately skips:
   *   - Deposits with status "approved" (already credited)
   *   - Deposits where wallet_credited = true (already credited)
   *   - Deposits with status "pending_admin_review" (need human review)
   *
   * To prevent the double-credit bug from recurring via the background job.
   */
  async autoReconcilePendingDeposits() {
    const serviceSupabase = getServiceSupabase();
    try {
      // Only process deposits that are genuinely pending AND have a proofUrl
      // AND have NOT yet been credited. Skip high-value pending_admin_review.
      const { data: pendingList, error } = await serviceSupabase
        .from("manual_deposits")
        .select("*")
        .eq("status", "pending")
        .eq("wallet_credited", false)
        .not("proof_url", "is", null);   // only ones with proof

      if (error || !pendingList || pendingList.length === 0) return { reconciledCount: 0 };

      let count = 0;

      for (const deposit of pendingList) {
        try {
          // Check auto-credit limit for this deposit's currency/amount
          const autoLimit = await getAutoApproveLimit(deposit.currency);
          const isHighValue = parseFloat(deposit.amount) > autoLimit;

          if (isHighValue) {
            // Escalate to admin review instead of auto-crediting
            await serviceSupabase
              .from("manual_deposits")
              .update({
                status:        "pending_admin_review",
                review_reason: `Auto-reconcile: amount ${deposit.amount} ${deposit.currency} exceeds limit ${autoLimit}`,
                updated_at:    new Date().toISOString(),
              })
              .eq("id", deposit.id);
            logger.info(`[ManualDeposit] Auto-reconcile: escalated high-value deposit ${deposit.id} to admin review`);
            continue;
          }

          // Within limit — auto-credit
          await serviceSupabase
            .from("manual_deposits")
            .update({
              status:      "approved",
              admin_notes: "Auto-approved via proof submission reconciliation",
              updated_at:  new Date().toISOString(),
            })
            .eq("id", deposit.id);

          const creditResult = await creditWallet(deposit.user_id, deposit, deposit.currency, deposit.amount);

          if (creditResult.credited || creditResult.alreadyCredited) {
            await serviceSupabase
              .from("manual_deposits")
              .update({
                wallet_credited:     true,
                credited_tx_id:      creditResult.txId || null,
                auto_credit_applied: true,
              })
              .eq("id", deposit.id);

            logger.info(`[ManualDeposit] Auto-reconciled & credited ${deposit.amount} ${deposit.currency} for user ${deposit.user_id}`);
            count++;
          } else {
            logger.error(`[ManualDeposit] Auto-reconcile credit failed for deposit ${deposit.id}: ${creditResult.error}`);
          }
        } catch (itemErr) {
          logger.error(`[ManualDeposit] Auto-reconcile failed for item ${deposit.id}:`, itemErr.message);
        }
      }

      return { reconciledCount: count };
    } catch (err) {
      logger.error("[ManualDeposit] autoReconcilePendingDeposits Error:", err.message);
      return { error: err.message };
    }
  }
}

module.exports = new ManualDepositController();
