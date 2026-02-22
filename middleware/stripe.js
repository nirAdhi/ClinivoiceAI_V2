// Stripe Integration Module for Subscription Management
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const db = require('../database');
const logger = require('./logger');

/**
 * Create Stripe Checkout Session for subscription
 * @param {Object} options - { userId, planId, successUrl, cancelUrl }
 * @returns {Object} - { sessionId, url }
 */
async function createCheckoutSession({ userId, planId, successUrl, cancelUrl }) {
    try {
        const plan = await db.getPlanById(planId);
        if (!plan) {
            throw new Error('Plan not found');
        }

        // Get user info
        const [[user]] = await db.promisePool.query('SELECT * FROM users WHERE id = ?', [userId]);
        if (!user) {
            throw new Error('User not found');
        }

        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [{
                price_data: {
                    currency: 'usd',
                    product_data: {
                        name: plan.display_name,
                        description: plan.description
                    },
                    unit_amount: Math.round(plan.price * 100), // Convert to cents
                    recurring: {
                        interval: plan.billing_period === 'yearly' ? 'year' : 'month'
                    }
                },
                quantity: 1
            }],
            mode: 'subscription',
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: String(userId),
            metadata: {
                userId: String(userId),
                planId: String(planId)
            },
            customer_email: user.email
        });

        return {
            sessionId: session.id,
            url: session.url
        };
    } catch (error) {
        logger.error('Stripe checkout error:', error);
        throw error;
    }
}

/**
 * Handle Stripe webhook events
 * @param {Object} event - Stripe event object
 */
async function handleWebhookEvent(event) {
    try {
        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const userId = parseInt(session.metadata.userId);
                const planId = parseInt(session.metadata.planId);
                const stripeCustomerId = session.customer;
                const stripeSubscriptionId = session.subscription;

                // Create subscription in database
                await db.createSubscription({
                    user_id: userId,
                    plan_id: planId,
                    stripe_customer_id: stripeCustomerId,
                    stripe_subscription_id: stripeSubscriptionId,
                    start_date: new Date().toISOString().split('T')[0],
                    status: 'active'
                });

                logger.info(`Subscription created for user ${userId}`);
                break;
            }

            case 'customer.subscription.updated': {
                const subscription = event.data.object;
                const dbSub = await db.getSubscriptionByStripeId(subscription.id);

                if (dbSub) {
                    await db.updateSubscription(dbSub.id, {
                        status: subscription.status === 'active' ? 'active' : subscription.status,
                        cancel_at_period_end: subscription.cancel_at_period_end
                    });
                    logger.info(`Subscription updated: ${subscription.id}`);
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const subscription = event.data.object;
                const dbSub = await db.getSubscriptionByStripeId(subscription.id);

                if (dbSub) {
                    await db.updateSubscription(dbSub.id, {
                        status: 'cancelled',
                        end_date: new Date().toISOString().split('T')[0]
                    });
                    logger.info(`Subscription cancelled: ${subscription.id}`);
                }
                break;
            }

            case 'invoice.payment_failed': {
                const invoice = event.data.object;
                const subscription = await stripe.subscriptions.retrieve(invoice.subscription);
                const dbSub = await db.getSubscriptionByStripeId(subscription.id);

                if (dbSub) {
                    await db.updateSubscription(dbSub.id, {
                        status: 'past_due'
                    });
                    logger.warn(`Payment failed for subscription: ${subscription.id}`);
                }
                break;
            }

            default:
                logger.debug(`Unhandled event type: ${event.type}`);
        }
    } catch (error) {
        logger.error('Webhook handler error:', error);
        throw error;
    }
}

/**
 * Cancel subscription at end of billing period
 * @param {number} subscriptionId - Database subscription ID
 */
async function cancelSubscription(subscriptionId) {
    try {
        const subscription = await db.getUserSubscription(subscriptionId);
        if (!subscription || !subscription.stripe_subscription_id) {
            throw new Error('Subscription not found');
        }

        // Cancel at period end in Stripe
        await stripe.subscriptions.update(subscription.stripe_subscription_id, {
            cancel_at_period_end: true
        });

        // Update in database
        await db.updateSubscription(subscriptionId, {
            cancel_at_period_end: true
        });

        return { success: true, message: 'Subscription will be cancelled at end of billing period' };
    } catch (error) {
        logger.error('Cancel subscription error:', error);
        throw error;
    }
}

module.exports = {
    createCheckoutSession,
    handleWebhookEvent,
    cancelSubscription
};
