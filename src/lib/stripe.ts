import Stripe from "stripe";

let stripeClient: Stripe | null = null;

/**
 * Ленивая инициализация Stripe.
 * Не ломает билд, если нет STRIPE_SECRET_KEY  ошибка будет только при реальном вызове.
 */
export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error("Stripe is not configured (STRIPE_SECRET_KEY is missing)");
  }

  if (!stripeClient) {
    // Используем дефолтную версию из настроек Stripe-аккаунта
    stripeClient = new Stripe(key, {} as Stripe.StripeConfig);
  }

  return stripeClient;
}
