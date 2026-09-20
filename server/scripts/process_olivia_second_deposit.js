const supabase = require("../config/database");

async function run() {
  const oliviaId = "7ed6886b-237d-4812-8149-938a7ee8fe3b";
  const refNo = "TRF|2MPTzsu5|2096605246245167104";
  const providerRef = "2096605246245167104";
  const depositAmount = 200;

  console.log("=== 1. FETCH OLIVIA WALLET ===");
  const { data: wallet, error: wErr } = await supabase
    .from("wallets_v6")
    .select("*")
    .eq("user_id", oliviaId)
    .eq("currency", "NGN")
    .single();

  if (wErr || !wallet) {
    console.error("❌ Failed to find Olivia NGN wallet:", wErr);
    process.exit(1);
  }

  console.log("Current wallet:", wallet);
  const currentBalance = Number(wallet.balance || 0);
  const newBalance = currentBalance + depositAmount;

  console.log(`Current Balance: ₦${currentBalance} | Adding: ₦${depositAmount} | New Balance: ₦${newBalance}`);

  console.log("\n=== 2. CHECK IF THIS TRANSACTION WAS ALREADY RECORDED ===");
  const { data: existingTx } = await supabase
    .from("transactions")
    .select("*")
    .or(`reference_id.eq.${refNo},provider_reference.eq.${providerRef}`);

  if (existingTx && existingTx.length > 0) {
    console.log("⚠️ Transaction reference already exists in database:", existingTx);
  }

  console.log("\n=== 3. INSERT COMPLETED DEPOSIT TRANSACTION ===");
  const { data: newTx, error: txErr } = await supabase
    .from("transactions")
    .insert({
      user_id: oliviaId,
      wallet_id: wallet.id,
      type: "DEPOSIT",
      amount: depositAmount,
      currency: "NGN",
      status: "COMPLETED",
      payment_status: "WALLET_CREDITED",
      wallet_credit_status: "WALLET_CREDITED",
      reference_id: refNo,
      provider_reference: providerRef,
      provider: "moniepoint_nip",
      completed_at: new Date().toISOString(),
      display_label: "Bank Transfer Deposit",
      product_type: "deposit",
      funds_status: "AVAILABLE",
      metadata: {
        reference_no: refNo,
        provider_ref: providerRef,
        source: "MONIEPOINT_NIP_TRANSFER",
        verified_via: "bank_reference_submission",
        manual_reconciliation_reason: `Instant verification and wallet credit for Moniepoint NIP transfer reference ${refNo}`
      }
    })
    .select()
    .single();

  if (txErr) {
    console.error("❌ Failed to insert transaction:", txErr.message);
    process.exit(1);
  }
  console.log("✅ Transaction record inserted:", newTx);

  console.log("\n=== 4. UPDATE WALLET BALANCE IN WALLETS_STORE ===");
  const { error: storeErr } = await supabase
    .from("wallets_store")
    .update({
      balance: newBalance,
      available_balance: newBalance,
      updated_at: new Date().toISOString()
    })
    .eq("id", wallet.id);

  if (storeErr) {
    console.error("❌ Failed to update wallets_store:", storeErr.message);
    process.exit(1);
  }
  console.log("✅ Wallets store balance updated to:", newBalance);

  console.log("\n=== 5. CREATE DEPOSIT SUCCESS NOTIFICATION ===");
  const { data: notif, error: nErr } = await supabase
    .from("notifications")
    .insert({
      user_id: oliviaId,
      title: "Deposit Successful",
      message: `Your wallet has been credited with NGN ${depositAmount}.00 via Moniepoint Bank Transfer (Ref: ${providerRef}).`,
      type: "deposit_success",
      read: false
    })
    .select();

  if (nErr) {
    console.warn("⚠️ Warning creating notification:", nErr.message);
  } else {
    console.log("✅ Notification created:", notif);
  }

  console.log("\n=== 6. VERIFY FINAL WALLET BALANCE IN WALLETS_V6 ===");
  const { data: finalWallet } = await supabase
    .from("wallets_v6")
    .select("*")
    .eq("id", wallet.id)
    .single();

  console.log("🎉 Final Olivia NGN Wallet State:", finalWallet);
}

run().then(() => process.exit(0)).catch(err => {
  console.error("Script Execution Error:", err);
  process.exit(1);
});
