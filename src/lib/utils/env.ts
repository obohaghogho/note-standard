// ============================================================================
// Environment Validation
// ============================================================================
// Called at startup to verify all required environment variables are set.
// Fails fast with a clear error message listing ALL missing variables.
// ============================================================================

interface EnvConfig {
  key: string;
  required: boolean;
  description: string;
}

const REQUIRED_VARS: EnvConfig[] = [
  { key: 'NEXT_PUBLIC_SUPABASE_URL', required: true, description: 'Supabase project URL' },
  { key: 'NEXT_PUBLIC_SUPABASE_ANON_KEY', required: true, description: 'Supabase anonymous key' },
  { key: 'SUPABASE_SERVICE_ROLE_KEY', required: true, description: 'Supabase service role key (server only)' },
  { key: 'PAYSTACK_SECRET_KEY', required: true, description: 'Paystack API secret key' },
  { key: 'PAYSTACK_PUBLIC_KEY', required: false, description: 'Paystack public key (for frontend)' },
  { key: 'PAYSTACK_WEBHOOK_SECRET', required: false, description: 'Paystack webhook secret for signature validation' },
  { key: 'NOWPAYMENTS_API_KEY', required: false, description: 'NowPayments API key (for crypto)' },
  { key: 'NOWPAYMENTS_IPN_SECRET', required: false, description: 'NowPayments IPN secret' },
  { key: 'NEXT_PUBLIC_APP_URL', required: false, description: 'Application base URL' },
];

export interface EnvValidationResult {
  isValid: boolean;
  missing: string[];
  warnings: string[];
}

/**
 * Validates that all required environment variables are set.
 * Returns a result object. Does NOT throw — callers decide how to handle.
 */
export function validateEnv(): EnvValidationResult {
  const missing: string[] = [];
  const warnings: string[] = [];

  for (const config of REQUIRED_VARS) {
    const value = process.env[config.key];

    if (!value && config.required) {
      missing.push(`${config.key} — ${config.description}`);
    } else if (!value && !config.required) {
      warnings.push(`${config.key} — ${config.description} (optional)`);
    }
  }

  return {
    isValid: missing.length === 0,
    missing,
    warnings,
  };
}

/**
 * Validates environment and logs the results.
 * Throws if required variables are missing (fail-fast at startup).
 */
export function assertEnv(): void {
  const result = validateEnv();

  if (result.warnings.length > 0) {
    console.warn(
      `[Env] Optional variables not set:\n  - ${result.warnings.join('\n  - ')}`,
    );
  }

  if (!result.isValid) {
    const message =
      `Missing required environment variables:\n  - ${result.missing.join('\n  - ')}\n\n` +
      `Copy .env.example to .env.local and fill in the values.`;

    console.error(`[Env] ${message}`);
    throw new Error(message);
  }

  console.log('[Env] All required environment variables are set ✓');
}
