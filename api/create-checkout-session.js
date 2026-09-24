import Stripe from "stripe";
import { buildLineItems, computeTotals, shippingOptions, CURRENCY } from "./_catalog.js";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

function originFrom(req) {
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  // Vercel terminates TLS and forwards the real scheme. Locally there is no
  // such header, so fall back to detecting TLS from the socket itself rather
  // than assuming https (which Stripe rejects for localhost).
  const proto = req.headers["x-forwarded-proto"] || (req.socket?.encrypted ? "https" : "http");
  return `${proto}://${host}`;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return res.status(500).json({ error: "Stripe is not configured on the server." });
  }

  const body = typeof req.body === "string" ? safeParse(req.body) : req.body || {};
  const lineItems = buildLineItems(body.items);

  if (!lineItems.length) {
    return res.status(400).json({ error: "Your bag is empty." });
  }

  const origin = originFrom(req);

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: lineItems,
      currency: CURRENCY,
      shipping_address_collection: { allowed_countries: ["GB"] },
      shipping_options: shippingOptions(lineItems),
      phone_number_collection: { enabled: true },
      metadata: { cart: JSON.stringify(lineItems.map((item) => ({ id: item.price_data.product_data.metadata.product_id, quantity: item.quantity }))),
        subtotal: String(computeTotals(lineItems).subtotal) },
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/checkout.html?canceled=1`
    });

    return res.status(200).json({ id: session.id, url: session.url });
  } catch (error) {
    console.error("Stripe checkout session error:", error);
    return res.status(502).json({ error: "We could not start the payment. Please try again." });
  }
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return {};
  }
}
