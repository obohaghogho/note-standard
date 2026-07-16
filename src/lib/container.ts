// ============================================================================
// Service Container — Singleton factory for all services
// ============================================================================
// All services are instantiated lazily on first access.
// Uses the service-role Supabase client for backend operations.
// ============================================================================

import { createServiceClient } from '@/lib/supabase/server';
import { WalletService } from '@/services/wallet.service';
import { LedgerService } from '@/services/ledger.service';
import { ReservationService } from '@/services/reservation.service';
import { RiskEngineService } from '@/services/risk-engine.service';
import { AuditService } from '@/services/audit.service';
import { NotificationService } from '@/services/notification.service';
import { SystemConfigService } from '@/services/system-config.service';
import { FeatureFlagService } from '@/services/feature-flag.service';
import { TransactionEngineService } from '@/services/transaction-engine.service';
import { ProviderRegistry } from '@/lib/providers/provider-registry';
import { ProviderHealthMonitor } from '@/lib/providers/health-monitor';
import { WebhookDispatcher } from '@/lib/providers/webhook-dispatcher';
import { PaystackAdapter } from '@/lib/providers/paystack/paystack.adapter';
import { NowPaymentsAdapter } from '@/lib/providers/nowpayments/nowpayments.adapter';
import { FincraAdapter } from '@/lib/providers/fincra/fincra.adapter';
import { eventBus } from '@/lib/events/event-bus';

let container: ServiceContainer | null = null;

export interface ServiceContainer {
  wallet: WalletService;
  ledger: LedgerService;
  reservation: ReservationService;
  risk: RiskEngineService;
  audit: AuditService;
  notification: NotificationService;
  config: SystemConfigService;
  featureFlags: FeatureFlagService;
  transactionEngine: TransactionEngineService;
  providerRegistry: ProviderRegistry;
  healthMonitor: ProviderHealthMonitor;
  webhookDispatcher: WebhookDispatcher;
}

/**
 * Returns a singleton ServiceContainer with all services initialized.
 * Call this from API route handlers.
 */
export function getServices(): ServiceContainer {
  if (container) return container;

  const supabase = createServiceClient();

  // Core services
  const wallet = new WalletService(supabase);
  const ledger = new LedgerService(supabase);
  const reservation = new ReservationService(supabase);
  const risk = new RiskEngineService(supabase);
  const audit = new AuditService(supabase);
  const notification = new NotificationService(supabase);
  const config = new SystemConfigService(supabase);
  const featureFlags = new FeatureFlagService(supabase);

  // Provider infrastructure
  const healthMonitor = new ProviderHealthMonitor(supabase);
  const providerRegistry = new ProviderRegistry(healthMonitor);
  const webhookDispatcher = new WebhookDispatcher(providerRegistry);

  // Register providers
  const paystack = new PaystackAdapter();
  providerRegistry.registerPaymentProvider(paystack);
  providerRegistry.registerPayoutProvider(paystack);

  // Stub providers (stubbed — will throw NotImplementedError)
  providerRegistry.registerCryptoProvider(new NowPaymentsAdapter());
  providerRegistry.registerPaymentProvider(new FincraAdapter());

  // Transaction Engine
  const transactionEngine = new TransactionEngineService(
    supabase,
    wallet,
    risk,
    providerRegistry,
    healthMonitor,
    eventBus,
  );

  container = {
    wallet,
    ledger,
    reservation,
    risk,
    audit,
    notification,
    config,
    featureFlags,
    transactionEngine,
    providerRegistry,
    healthMonitor,
    webhookDispatcher,
  };

  return container;
}
