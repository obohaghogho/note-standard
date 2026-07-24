// ============================================================================
// Webhook Dispatcher — Single entry point for all provider webhooks
// ============================================================================

import type { ProviderRegistry } from './provider-registry';
import type { NormalizedWebhookEvent } from './interfaces/types';
import { WebhookSignatureError } from '@/lib/utils/errors';

export class WebhookDispatcher {
  constructor(private registry: ProviderRegistry) {}

  /**
   * Validates the webhook signature and parses it into a normalized event.
   *
   * @param providerName - The provider that sent the webhook (from URL param)
   * @param rawPayload - The raw request body as a string
   * @param headers - The request headers (lowercased keys)
   * @returns A normalized webhook event ready for the Transaction Engine
   * @throws WebhookSignatureError if signature validation fails
   */
  dispatch(
    providerName: string,
    rawPayload: string,
    headers: Record<string, string>,
  ): NormalizedWebhookEvent {
    const provider = this.registry.getProviderByName(providerName);

    // 1. Validate signature
    if (
      'validateWebhookSignature' in provider &&
      typeof provider.validateWebhookSignature === 'function'
    ) {
      const isValid = provider.validateWebhookSignature(rawPayload, headers);
      if (!isValid) {
        throw new WebhookSignatureError(providerName);
      }
    }

    // 2. Parse into normalized event
    if (
      'parseWebhookEvent' in provider &&
      typeof provider.parseWebhookEvent === 'function'
    ) {
      return provider.parseWebhookEvent(rawPayload, headers);
    }

    throw new Error(
      `Provider "${providerName}" does not implement webhook handling`,
    );
  }
}
