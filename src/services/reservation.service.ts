// ============================================================================
// Reservation Service — Temporary fund holds
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WalletReservation, ReserveWalletParams } from '@/types';
import { ReservationNotFoundError } from '@/lib/utils/errors';

export class ReservationService {
  constructor(private readonly supabase: SupabaseClient) {}

  /** Reserve funds (available → reserved) */
  async reserve(params: ReserveWalletParams): Promise<string> {
    const { data, error } = await this.supabase.rpc('reserve_wallet_funds', {
      p_wallet_id: params.walletId,
      p_amount: params.amount,
      p_currency: params.currency,
      p_reference: params.reference,
      p_type: params.type,
      p_expires_at: params.expiresAt.toISOString(),
      p_related_entity_type: params.relatedEntityType ?? null,
      p_related_entity_id: params.relatedEntityId ?? null,
      p_metadata: params.metadata ?? {},
    });

    if (error) throw new Error(`reserve_wallet_funds RPC failed: ${error.message}`);
    return data as string;
  }

  /** Capture a reservation (reserved → locked) */
  async capture(reservationId: string): Promise<void> {
    const { error } = await this.supabase.rpc('capture_reservation', {
      p_reservation_id: reservationId,
    });
    if (error) throw new Error(`capture_reservation RPC failed: ${error.message}`);
  }

  /** Release a reservation (reserved → available) */
  async release(reservationId: string): Promise<void> {
    const { error } = await this.supabase.rpc('release_reservation', {
      p_reservation_id: reservationId,
    });
    if (error) throw new Error(`release_reservation RPC failed: ${error.message}`);
  }

  /** Get active reservations for a wallet */
  async getActive(walletId: string): Promise<WalletReservation[]> {
    const { data, error } = await this.supabase
      .from('wallet_reservations')
      .select('*')
      .eq('wallet_id', walletId)
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch reservations: ${error.message}`);
    return (data ?? []) as WalletReservation[];
  }

  /** Get a reservation by ID */
  async getById(reservationId: string): Promise<WalletReservation> {
    const { data, error } = await this.supabase
      .from('wallet_reservations')
      .select('*')
      .eq('id', reservationId)
      .maybeSingle();

    if (error) throw new Error(`Failed to fetch reservation: ${error.message}`);
    if (!data) throw new ReservationNotFoundError(reservationId);
    return data as WalletReservation;
  }

  /** Expire stale reservations (called by scheduled job) */
  async expireStale(): Promise<number> {
    const { data, error } = await this.supabase.rpc('expire_stale_reservations');
    if (error) throw new Error(`expire_stale_reservations RPC failed: ${error.message}`);
    return (data as number) ?? 0;
  }
}
