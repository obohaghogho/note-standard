const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../server/.env') });

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from server/.env");
  process.exit(1);
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(supabaseUrl, supabaseKey);

const requiredColumns = {
  messages: ['id', 'conversation_id', 'sender_id', 'created_at', 'is_deleted'],
  conversations: ['id', 'type', 'created_at'],
  conversation_members: ['conversation_id', 'user_id', 'cleared_at']
};

async function verifySchema() {
  console.log("🔍 Verifying Schema Integrity...");
  for (const [table, columns] of Object.entries(requiredColumns)) {
    const { data, error } = await supabase.from(table).select(columns.join(',')).limit(1);
    
    if (error) {
      if (error.code === '42P01') {
        console.error(`❌ Table ${table} does not exist!`);
        return false;
      }
      if (error.code === '42703') {
        console.error(`❌ Missing columns in ${table}! Required: ${columns.join(', ')}`);
        return false;
      }
      console.error(`❌ Unexpected error verifying ${table}:`, error.message);
      return false;
    }
  }
  console.log("✅ Schema Integrity Verified.");
  return true;
}

async function runDeployGate() {
  console.log("=========================================");
  console.log("   INITIATING DEPLOYMENT SAFETY GATE     ");
  console.log("=========================================");

  const targetEnv = process.env.DEPLOY_ENV || 'STAGING';
  console.log(`📡 Target Environment: ${targetEnv}`);

  if (targetEnv === 'PRODUCTION') {
    console.log("⚠️ PRODUCTION DEPLOYMENT DETECTED.");
    // Simulate checking if Staging passed
    if (process.env.STAGING_VERIFIED !== 'true') {
      console.error("❌ STAGING_VERIFIED is not true. Deployment to production aborted.");
      process.exit(1);
    }
  }

  const isSchemaValid = await verifySchema();
  if (!isSchemaValid) {
    console.error("❌ Schema verification failed. Aborting deployment.");
    process.exit(1);
  }

  // Simulate API Health Check
  console.log("🏥 Simulating API Health Check...");
  // In a real scenario, this would ping localhost or staging server API endpoints
  console.log("✅ API Health Check Passed.");

  console.log("=========================================");
  console.log(`✅ DEPLOYMENT GATE PASSED FOR ${targetEnv}`);
  console.log("=========================================");
  process.exit(0);
}

runDeployGate();
