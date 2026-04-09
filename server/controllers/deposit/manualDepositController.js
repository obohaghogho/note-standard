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

      res.json({
        instructions,
        reference,
      });
    } catch (err) {
      logger.error("[ManualDeposit] Initiate Error:", err.message);
      res.status(500).json({ error: "Failed to initiate deposit" });
    }
  }

  /**
   * POST /api/deposit/submit
   * User submits proof and reference
   */
  async submitDeposit(req, res) {
    try {
      const { amount, currency, reference, proofUrl } = req.body;

      if (!amount || amount <= 0 || !currency || !reference) {
        return res.status(400).json({ error: "Invalid deposit details" });
      }

      // Check for duplicate reference
      const { data: existing } = await supabase
        .from("manual_deposits")
        .select("id")
        .eq("reference", reference)
        .maybeSingle();

      if (existing) {
        return res.status(400).json({ error: "This reference has already been submitted" });
      }

      // Save deposit
      const { data: deposit, error } = await supabase
        .from("manual_deposits")
        .insert([{
          user_id: req.user.id,
          amount: parseFloat(amount),
          currency: currency.toUpperCase(),
          reference,
          proof_url: proofUrl,
          status: "pending"
        }])
        .select()
        .single();

      if (error) throw error;

      // Send confirmation email
      await sendgridEmailService.sendDepositSubmittedEmail(req.user.email, {
        amount,
        currency: currency.toUpperCase(),
        reference
      });

      res.status(201).json({
        message: "Deposit submitted successfully. Waiting for admin approval.",
        deposit
      });
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
   */
  async getPendingDeposits(req, res) {
    try {
      const { data, error } = await supabase
        .from("manual_deposits")
        .select("*, profile:profiles(email, full_name, username)")
        .eq("status", "pending")
        .order("created_at", { ascending: true });

      if (error) throw error;
      res.json(data);
    } catch (err) {
      logger.error("[ManualDeposit] Admin Pending Error:", err.message);
      res.status(500).json({ error: "Failed to fetch pending deposits" });
    }
  }

  /**
   * PATCH /api/deposit/:id/approve (ADMIN ONLY)
   */
  async approveDeposit(req, res) {
    const serviceSupabase = getServiceSupabase();
    try {
      const { id } = req.params;
      const { adminNotes } = req.body;

      // 1. Fetch deposit details
      const { data: deposit, error: depError } = await serviceSupabase
        .from("manual_deposits")
        .select("*, profile:profiles(email)")
        .eq("id", id)
        .single();

      if (depError || !deposit) {
        return res.status(404).json({ error: "Deposit not found" });
      }

      if (deposit.status !== "pending") {
        return res.status(400).json({ error: `Cannot approve a deposit with status: ${deposit.status}` });
      }

      // 2. Mark as approved
      const { error: updateError } = await serviceSupabase
        .from("manual_deposits")
        .update({
          status: "approved",
          admin_notes: adminNotes,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      if (updateError) throw updateError;

      // 3. Credit User Wallet
      // Find or create wallet for currency
      const walletService = require("../../services/walletService");
      const wallet = await walletService.createWallet(deposit.user_id, deposit.currency, 'native');

      if (!wallet) throw new Error("Could not find or create user wallet");

      // Record transaction
      const { data: tx, error: txError } = await serviceSupabase
        .from("transactions")
        .insert([{
          wallet_id: wallet.id,
          user_id: deposit.user_id,
          type: "DEPOSIT",
          display_label: "Manual Bank Deposit",
          category: "funding",
          description: `Manual deposit approval for reference ${deposit.reference}`,
          amount: deposit.amount,
          currency: deposit.currency,
          status: "COMPLETED",
          reference_id: deposit.id, // Linking to manual_deposits table
          metadata: {
            manual_deposit_id: deposit.id,
            reference: deposit.reference,
            approved_by: req.user.id
          },
          completed_at: new Date().toISOString()
        }])
        .select()
        .single();

      if (txError) throw txError;

      // Update wallet balance
      const { error: balError } = await serviceSupabase.rpc("confirm_deposit", {
        p_transaction_id: tx.id,
        p_wallet_id: wallet.id,
        p_amount: deposit.amount
      });

      if (balError) throw balError;

      // 4. Send Approval Email
      await sendgridEmailService.sendDepositApprovedEmail(deposit.profile.email, {
        amount: deposit.amount,
        currency: deposit.currency
      });

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
      const { adminNotes } = req.body;

      const { data: deposit, error: depError } = await serviceSupabase
        .from("manual_deposits")
        .select("*, profile:profiles(email)")
        .eq("id", id)
        .single();

      if (depError || !deposit) {
        return res.status(404).json({ error: "Deposit not found" });
      }

      if (deposit.status !== "pending") {
        return res.status(400).json({ error: `Cannot reject a deposit with status: ${deposit.status}` });
      }

      await serviceSupabase
        .from("manual_deposits")
        .update({
          status: "rejected",
          admin_notes: adminNotes,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      // Send Rejection Email
      await sendgridEmailService.sendDepositRejectedEmail(deposit.profile.email, {
        amount: deposit.amount,
        currency: deposit.currency,
        reason: adminNotes
      });

      res.json({ message: "Deposit rejected successfully" });
    } catch (err) {
      logger.error("[ManualDeposit] Admin Reject Error:", err.message);
      res.status(500).json({ error: "Failed to reject deposit" });
    }
  }
}

module.exports = new ManualDepositController();
