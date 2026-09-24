// Server-side source of truth for products and pricing.
// Prices are NEVER trusted from the browser — the client only sends product
// ids and quantities, and everything below is looked up here.

export const PRODUCTS = {
  "rally-one": {
    id: "rally-one",
    name: "Elite Series Pink",
    description: "A forgiving all-rounder for building confidence from the first ball to the last.",
    price: 74.99,
    currency: "gbp"
  },
  "rally-line": {
    id: "rally-line",
    name: "Elite Series Blue",
    description: "A teardrop profile with a crisp response for players who like to paint the corners.",
    price: 74.99,
    currency: "gbp"
  }
};

export const CURRENCY = "gbp";
export const FREE_SHIPPING_THRESHOLD = 100;
export const SHIPPING_RATE = 6.95;
const MAX_QUANTITY = 9;

/**
 * Convert a client-supplied cart into Stripe line items.
 * Quantities are clamped and unknown ids are dropped, so a tampered
 * localStorage payload can never invent a product or a price.
 */
export function buildLineItems(rawItems) {
  if (!Array.isArray(rawItems)) return [];

  const merged = new Map();
  for (const item of rawItems) {
    const product = PRODUCTS[item?.id];
    const quantity = Number(item?.quantity);
    if (!product || !Number.isInteger(quantity) || quantity < 1) continue;
    const existing = merged.get(product.id) || 0;
    merged.set(product.id, Math.min(existing + quantity, MAX_QUANTITY));
  }

  return [...merged].map(([id, quantity]) => {
    const product = PRODUCTS[id];
    return {
      quantity,
      price_data: {
        currency: CURRENCY,
        unit_amount: Math.round(product.price * 100),
        product_data: {
          name: product.name,
          description: product.description,
          metadata: { product_id: product.id }
        }
      }
    };
  });
}

export function computeTotals(lineItems) {
  const subtotal = lineItems.reduce(
    (total, item) => total + (item.price_data.unit_amount * item.quantity) / 100,
    0
  );
  const shipping = subtotal === 0 || subtotal >= FREE_SHIPPING_THRESHOLD ? 0 : SHIPPING_RATE;
  return { subtotal: round(subtotal), shipping: round(shipping), total: round(subtotal + shipping) };
}

/** Free delivery over the threshold, otherwise a flat fee, as a Stripe shipping option. */
export function shippingOptions(lineItems) {
  const { shipping } = computeTotals(lineItems);
  if (shipping === 0) {
    return [{ shipping_rate_data: shippingRateData(0, "Free delivery", "Free delivery on orders over £100") }];
  }
  return [{ shipping_rate_data: shippingRateData(Math.round(shipping * 100), "Standard delivery", "UK standard delivery") }];
}

function shippingRateData(amount, label, detail) {
  return {
    type: "fixed_amount",
    fixed_amount: { amount, currency: CURRENCY },
    display_name: label,
    delivery_estimate: {
      minimum: { unit: "business_day", value: 2 },
      maximum: { unit: "business_day", value: 5 }
    },
    metadata: { detail }
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}
