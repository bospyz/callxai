import Stripe from "stripe";
import { db } from "../db";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? "", {});

/**
 * Поддерживаемые тарифы.
 */
export type BillingPlan = "start" | "pro" | "team";

function getPriceIdForPlan(plan: BillingPlan): string {
  const priceStart = process.env.STRIPE_PRICE_START;
  const pricePro = process.env.STRIPE_PRICE_PRO;
  const priceTeam = process.env.STRIPE_PRICE_TEAM;

  switch (plan) {
    case "start":
      if (!priceStart) {
        throw new Error("STRIPE_PRICE_START is not set in environment");
      }
      return priceStart;
    case "pro":
      if (!pricePro) {
        throw new Error("STRIPE_PRICE_PRO is not set in environment");
      }
      return pricePro;
    case "team":
      if (!priceTeam) {
        throw new Error("STRIPE_PRICE_TEAM is not set in environment");
      }
      return priceTeam;
    default:
      throw new Error(`Unsupported plan: ${plan}`);
  }
}

/**
 * Готовим stripeCustomerId для компании.
 */
async function ensureStripeCustomer(companyId: string) {
  const company = await db.company.findUnique({
    where: { id: companyId },
  });

  if (!company) {
    throw new Error("Company not found");
  }

  if ((company as any).stripeCustomerId) {
    return (company as any).stripeCustomerId as string;
  }

  const customer = await stripe.customers.create({
    name: (company as any).name ?? undefined,
  });

  await db.company.update({
    where: { id: companyId },
    data: {
      stripeCustomerId: customer.id,
    },
  });

  return customer.id;
}

/**
 * Создаём checkout-сессию подписки для компании.
 */
export async function createSubscriptionCheckout(opts: {
  companyId: string;
  plan: BillingPlan;
  successUrl: string;
  cancelUrl: string;
}) {
  const { companyId, plan, successUrl, cancelUrl } = opts;

  const customerId = await ensureStripeCustomer(companyId);
  const priceId = getPriceIdForPlan(plan);

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price: priceId,
        quantity: 1,
      },
    ],
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: {
      companyId,
      plan,
    },
  });

  return session;
}
