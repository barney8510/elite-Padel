import Stripe from "stripe";

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Vercel needs the raw body to verify the Stripe signature, so we disable
// the automatic body parser and read the stream ourselves.
export const config = { api: { bodyParser: false } };

async function readRawBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!process.env.STRIPE_SECRET_KEY || !secret) {
    return res.status(500).json({ error: "Stripe webhook is not configured on the server." });
  }

  const signature = req.headers["stripe-signature"];
  const rawBody = await readRawBody(req);

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch (error) {
    console.error("Stripe webhook signature verification failed:", error.message);
    return res.status(400).json({ error: `Webhook error: ${error.message}` });
  }

  switch (event.type) {
    case "checkout.session.completed":
      await handleCompleted(event.data.object);
      break;
    case "checkout.session.expired":
      await handleExpired(event.data.object);
      break;
    case "payment_intent.payment_failed":
      await handleFailed(event.data.object);
      break;
    default:
      break;
  }

  return res.status(200).json({ received: true });
}

async function handleCompleted(session) {
  // Fulfilment hook: send confirmation emails, update inventory, write to a DB.
  const shipping = session.shipping_details || {};
  const customer = session.customer_details || {};
  const address = shipping.address || customer.address || {};

  const order = {
    session_id: session.id,
    email: customer.email || null,
    phone: customer.phone || null,
    amount_total: session.amount_total,
    currency: session.currency,
    cart: session.metadata?.cart ? safeParse(session.metadata.cart) : null,
    // Delivery details collected by Stripe Checkout.
    delivery: {
      name: shipping.name || customer.name || null,
      line1: address.line1 || null,
      line2: address.line2 || null,
      city: address.city || null,
      postcode: address.postal_code || null,
      state: address.state || null,
      country: address.country || null,
      shipping_method: session.shipping_cost?.shipping_rate || null
    }
  };

  console.log("Order paid:", JSON.stringify(order, null, 2));

  // TODO: replace this with your real fulfilment — send the order to your
  // warehouse / email service / database using `order.delivery` above.
  return order;
}

function safeParse(value) {
  try {
    return JSON.parse(value);
  } catch (error) {
    return null;
  }
}

async function handleExpired(session) {
  console.log("Checkout session expired:", session.id);
}

async function handleFailed(paymentIntent) {
  console.log("Payment failed:", paymentIntent.id, paymentIntent.last_payment_error?.message || "");
}
