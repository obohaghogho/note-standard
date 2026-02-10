const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const supabase = require('../config/supabase');

exports.createCheckoutSession = async (req, res) => {
    try {
        const userId = req.user.id;
        const { email } = req.user;

        // 1. Create or retrieve Stripe Customer
        // In a real app, we should store stripe_customer_id in our DB.
        // For this MVP, we'll search by email or create new.
        let customer;
        const existingCustomers = await stripe.customers.list({ email: email, limit: 1 });

        if (existingCustomers.data.length > 0) {
            customer = existingCustomers.data[0];
        } else {
            customer = await stripe.customers.create({
                email: email,
                metadata: {
                    userId: userId
                }
            });
        }

        // 2. Create Checkout Session
        const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Note Standard Pro',
                            description: 'Unlock unlimited storage and AI features',
                        },
                        unit_amount: 999, // $9.99
                        recurring: {
                            interval: 'month',
                        },
                    },
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/billing?success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/billing?canceled=true`,
            metadata: {
                userId: userId
            }
        });

        res.json({ url: session.url });

    } catch (error) {
        console.error('Error creating checkout session:', error);
        res.status(500).json({ error: 'Failed to create checkout session' });
    }
};

exports.getSubscriptionStatus = async (req, res) => {
    try {
        const userId = req.user.id;

        const { data, error } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('user_id', userId)
            .maybeSingle();

        if (error) {
            throw error;
        }

        res.json({ subscription: data || null });
    } catch (error) {
        console.error('Error fetching subscription status:', error);
        res.status(500).json({ error: 'Failed to fetch subscription status' });
    }
};

// Simple success handler called by frontend after redirect
// In production, rely on Webhooks! This is a fallback/visual sync.
exports.syncSubscription = async (req, res) => {
    try {
        const { session_id } = req.body;
        const userId = req.user.id;

        if (!session_id) {
            return res.status(400).json({ error: 'Session ID required' });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid') {
            // 3. Upsert subscription manually (Check then Update/Insert)
            // This avoids unique constraint errors if the DB schema is missing the unique constraint on user_id

            // Check if subscription exists
            const { data: existing, error: fetchError } = await supabase
                .from('subscriptions')
                .select('id')
                .eq('user_id', userId)
                .maybeSingle();

            if (fetchError) throw fetchError;

            let opError;
            if (existing) {
                // Update existing
                const { error: updateError } = await supabase
                    .from('subscriptions')
                    .update({
                        stripe_customer_id: session.customer,
                        stripe_subscription_id: session.subscription,
                        plan_tier: 'pro',
                        status: 'active'
                    })
                    .eq('user_id', userId);
                opError = updateError;
            } else {
                // Insert new
                const { error: insertError } = await supabase
                    .from('subscriptions')
                    .insert({
                        user_id: userId,
                        stripe_customer_id: session.customer,
                        stripe_subscription_id: session.subscription,
                        plan_tier: 'pro',
                        status: 'active'
                    });
                opError = insertError;
            }

            if (opError) throw opError;



            res.json({ success: true });
        } else {
            res.json({ success: false });
        }

    } catch (error) {
        console.error('Error syncing subscription:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
};
// ... existing code ...

exports.createAdCheckoutSession = async (req, res) => {
    try {
        const userId = req.user.id;
        const { email } = req.user;
        const { adId } = req.body;

        if (!adId) {
            return res.status(400).json({ error: 'Ad ID is required' });
        }

        // Reuse customer lookup logic
        let customer;
        const existingCustomers = await stripe.customers.list({ email: email, limit: 1 });

        if (existingCustomers.data.length > 0) {
            customer = existingCustomers.data[0];
        } else {
            customer = await stripe.customers.create({
                email: email,
                metadata: { userId: userId }
            });
        }

        const session = await stripe.checkout.sessions.create({
            customer: customer.id,
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Standard Ad Campaign',
                            description: 'Run your advertisement on Note Standard',
                        },
                        unit_amount: 500, // $5.00
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment', // One-time payment
            success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/settings?ad_success=true&session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/settings?ad_canceled=true`,
            metadata: {
                userId: userId,
                adId: adId,
                type: 'ad_payment'
            }
        });

        res.json({ url: session.url });

    } catch (error) {
        console.error('Error creating ad checkout session:', error);
        res.status(500).json({ error: 'Failed to create ad checkout session' });
    }
};

exports.syncAdPayment = async (req, res) => {
    try {
        const { session_id } = req.body;
        // userId check is good practice but metadata is source of truth for adId

        if (!session_id) {
            return res.status(400).json({ error: 'Session ID required' });
        }

        const session = await stripe.checkout.sessions.retrieve(session_id);

        if (session.payment_status === 'paid' && session.metadata?.type === 'ad_payment') {
            const adId = session.metadata.adId;

            const { error } = await supabase
                .from('ads')
                .update({ status: 'pending' }) // Move from pending_payment to pending (review)
                .eq('id', adId);

            if (error) throw error;

            res.json({ success: true });
        } else {
            res.json({ success: false });
        }

    } catch (error) {
        console.error('Error syncing ad payment:', error);
        res.status(500).json({ error: 'Sync failed' });
    }
};

// Create Stripe Customer Portal Session for managing subscription
exports.createPortalSession = async (req, res) => {
    try {
        const userId = req.user.id;
        const { email } = req.user;

        // Find the Stripe customer
        const existingCustomers = await stripe.customers.list({ email: email, limit: 1 });

        if (existingCustomers.data.length === 0) {
            return res.status(404).json({ error: 'No subscription found' });
        }

        const customer = existingCustomers.data[0];

        // Create portal session
        const portalSession = await stripe.billingPortal.sessions.create({
            customer: customer.id,
            return_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/billing`,
        });

        res.json({ url: portalSession.url });

    } catch (error) {
        console.error('Error creating portal session:', error.message || error);
        // Common issue: Customer Portal not configured in Stripe Dashboard
        if (error.message && error.message.includes('portal')) {
            return res.status(500).json({
                error: 'Stripe Customer Portal not configured. Please configure it at https://dashboard.stripe.com/test/settings/billing/portal'
            });
        }
        res.status(500).json({ error: error.message || 'Failed to create portal session' });
    }
};

