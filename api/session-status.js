import Stripe from "stripe";
import { computeTotals } from "./_catalog.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const sessionId = req.query?.session_id;
  if (!sessionId || !sessionId.startsWith("cs_")) {
    return res.status(400).json({ error: "Missing session id." });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId, {
      expand: ["line_items"]
    });

    const lineItems = session.line_items?.data || [];
    const total = typeof session.amount_total === "number" ? session.amount_total / 100 : 0;

    const shipping = session.shipping_details || {};
    const customer = session.customer_details || {};
    const address = shipping.address || customer.address || {};

    return res.status(200).json({
      status: session.status,
      payment_status: session.payment_status,
      paid: session.payment_status === "paid",
      currency: session.currency,
      email: customer.email || null,
      total,
      delivery: {
        name: shipping.name || customer.name || null,
        line1: address.line1 || null,
        line2: address.line2 || null,
        city: address.city || null,
        postcode: address.postal_code || null,
        country: address.country || null
      },
      totals: computeTotals(
        lineItems.map((item) => ({
          quantity: item.quantity || 1,
          price_data: { unit_amount: item.amount_total / (item.quantity || 1) }
        }))
      ),
      items: lineItems.map((item) => ({
        name: item.description,
        quantity: item.quantity,
        amount: item.amount_total / 100
      }))
    });
  } catch (error) {
    console.error("Stripe session retrieve error:", error);
    return res.status(404).json({ error: "We could not find that order." });
  }
}
