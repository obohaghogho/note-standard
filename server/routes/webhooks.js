/**
 * Webhook Routes
 * Handles payment provider webhooks (Stripe, Paystack)
 */

const express = require('express');
const router = express.Router();
const depositService = require('../services/depositService');

// Initialize Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * POST /webhooks/stripe
 * Handle Stripe webhook events
 * 
 * IMPORTANT: This route must receive raw body, not parsed JSON
 * The raw body parser is set up in index.js specifically for this route
 */
router.post('/stripe', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    
    let event;

    try {
        // If webhook secret is configured, verify signature
        if (webhookSecret) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            // Development mode: Parse body directly (less secure)
            console.warn('[Webhook] No STRIPE_WEBHOOK_SECRET configured - signature verification skipped');
            event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        }
    } catch (err) {
        console.error('[Webhook] Signature verification failed:', err.message);
        return res.status(400).json({ error: `Webhook Error: ${err.message}` });
    }

    console.log(`[Webhook] Received Stripe event: ${event.type}`);

    // Handle the event
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const { reference, user_id, wallet_id, currency, amount } = session.metadata || {};

                if (!reference) {
                    console.error('[Webhook] No reference in session metadata');
                    break;
                }

                console.log(`[Webhook] Processing checkout.session.completed for ${reference}`);

                // Confirm the deposit
                const result = await depositService.confirmDeposit(reference, session.payment_intent);
                
                if (result.alreadyProcessed) {
                    console.log(`[Webhook] Deposit ${reference} was already processed`);
                } else {
                    console.log(`[Webhook] Successfully credited ${result.amount} ${result.currency} to wallet`);
                }
                break;
            }

            case 'checkout.session.expired': {
                const session = event.data.object;
                const { reference } = session.metadata || {};

                if (reference) {
                    console.log(`[Webhook] Session expired for ${reference}`);
                    await depositService.failDeposit(reference, 'Payment session expired');
                }
                break;
            }

            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object;
                const reference = paymentIntent.metadata?.reference;

                if (reference) {
                    console.log(`[Webhook] Payment failed for ${reference}`);
                    await depositService.failDeposit(
                        reference, 
                        paymentIntent.last_payment_error?.message || 'Payment failed'
                    );
                }
                break;
            }

            case 'charge.refunded': {
                const charge = event.data.object;
                // Handle refund logic if needed
                console.log(`[Webhook] Charge refunded: ${charge.id}`);
                break;
            }

            default:
                console.log(`[Webhook] Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (err) {
        console.error(`[Webhook] Error processing ${event.type}:`, err);
        // Return 200 to prevent Stripe from retrying (we've logged the error)
        res.json({ received: true, error: err.message });
    }
});

/**
 * POST /webhooks/paystack
 * Handle Paystack webhook events (for Nigerian bank payments)
 */
router.post('/paystack', async (req, res) => {
    const hash = req.headers['x-paystack-signature'];
    const secret = process.env.PAYSTACK_SECRET_KEY;

    // Verify Paystack signature
    if (secret) {
        const crypto = require('crypto');
        const expectedHash = crypto
            .createHmac('sha512', secret)
            .update(JSON.stringify(req.body))
            .digest('hex');

        if (hash !== expectedHash) {
            console.error('[Webhook] Paystack signature verification failed');
            return res.status(400).json({ error: 'Invalid signature' });
        }
    }

    const event = req.body;
    console.log(`[Webhook] Received Paystack event: ${event.event}`);

    try {
        switch (event.event) {
            case 'charge.success': {
                const data = event.data;
                const reference = data.reference;

                if (!reference) {
                    console.error('[Webhook] No reference in Paystack event');
                    break;
                }

                // Only process bank transfers with our prefix
                if (reference.startsWith('bank_')) {
                    console.log(`[Webhook] Processing Paystack charge.success for ${reference}`);
                    const result = await depositService.confirmDeposit(reference, data.id?.toString());
                    console.log(`[Webhook] Paystack deposit confirmed: ${result.amount} ${result.currency}`);
                }
                break;
            }

            case 'transfer.failed':
            case 'charge.failed': {
                const data = event.data;
                const reference = data.reference;

                if (reference?.startsWith('bank_')) {
                    console.log(`[Webhook] Paystack payment failed for ${reference}`);
                    await depositService.failDeposit(reference, data.gateway_response || 'Payment failed');
                }
                break;
            }

            default:
                console.log(`[Webhook] Unhandled Paystack event: ${event.event}`);
        }

        res.json({ received: true });
    } catch (err) {
        console.error(`[Webhook] Error processing Paystack ${event.event}:`, err);
        res.json({ received: true, error: err.message });
    }
});

/**
 * POST /webhooks/manual-confirm
 * Manual confirmation endpoint for testing/admin use
 * Protected by auth in production
 */
router.post('/manual-confirm', async (req, res) => {
    const { reference, externalHash } = req.body;

    if (!reference) {
        return res.status(400).json({ error: 'Reference is required' });
    }

    // In production, add admin authentication here
    const adminKey = req.headers['x-admin-key'];
    if (process.env.NODE_ENV === 'production' && adminKey !== process.env.ADMIN_SECRET_KEY) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const result = await depositService.confirmDeposit(reference, externalHash);
        res.json(result);
    } catch (err) {
        console.error('[Webhook] Manual confirm error:', err);
        res.status(400).json({ error: err.message });
    }
});

/**
 * GET /webhooks/status/:reference
 * Check deposit status (for polling from frontend)
 */
router.get('/status/:reference', async (req, res) => {
    const { reference } = req.params;

    try {
        const status = await depositService.getDepositStatus(reference);
        
        if (!status) {
            return res.status(404).json({ error: 'Deposit not found' });
        }

        res.json(status);
    } catch (err) {
        console.error('[Webhook] Status check error:', err);
        res.status(500).json({ error: 'Failed to check status' });
    }
});

module.exports = router;
