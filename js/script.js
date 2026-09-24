const products = [
  { id: "rally-one", name: "Elite Series Pink", brand: "Elite Padel / Everyday", price: 74.99, type: "Control", gallery: ["images/cutout/pink 1.png", "images/cutout/pink 3.png", "images/cutout/pink 4.png"], color: "#ead8df", accent: "#ef7657", tag: "Best seller", description: "A forgiving all-rounder for building confidence from the first ball to the last." },
  { id: "rally-line", name: "Elite Series Blue", brand: "Elite Padel / Precision", price: 74.99, type: "Precision", gallery: ["images/cutout/blue 1.png", "images/cutout/blue 2.png", "images/cutout/blue 3.png", "images/cutout/blue 4.png"], color: "#d6e2e7", accent: "#202522", tag: "New", description: "A teardrop profile with a crisp response for players who like to paint the corners." }
];

const CART_KEY = "rally-padel-cart";
const money = value => `£${value.toFixed(2)}`;
const getProduct = id => products.find(product => product.id === id);

function getCart() {
  try {
    const stored = JSON.parse(localStorage.getItem(CART_KEY) || "[]");
    if (!Array.isArray(stored)) return [];
    return stored.filter(item => getProduct(item.id) && Number.isInteger(item.quantity) && item.quantity > 0).map(item => ({ id: item.id, quantity: Math.min(item.quantity, 9) }));
  } catch (error) {
    return [];
  }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartCount();
}

function cartQuantity() { return getCart().reduce((total, item) => total + item.quantity, 0); }

function updateCartCount() {
  document.querySelectorAll(".cart-count").forEach(count => { count.textContent = cartQuantity(); });
}

function addToCart(id) {
  const cart = getCart();
  const item = cart.find(entry => entry.id === id);
  if (item) item.quantity = Math.min(item.quantity + 1, 9);
  else cart.push({ id, quantity: 1 });
  saveCart(cart);
  const button = document.querySelector(`[data-add="${id}"]`);
  if (button) { button.textContent = "Added to bag"; window.setTimeout(() => { button.textContent = "Add to bag +"; }, 1100); }
}

function productVisual(product, extraClass = "") {
  const slides = product.gallery.map((image, index) => `<div class="gallery-slide${index === 0 ? " active" : ""}" data-slide="${index}"><img src="${image}" alt="${product.name} padel racket photo ${index + 1} of ${product.gallery.length}" data-racket-image></div>`).join("");
  const dots = product.gallery.map((image, index) => `<button class="gallery-dot${index === 0 ? " active" : ""}" type="button" aria-label="Show photo ${index + 1} of ${product.name}" data-gallery-dot="${index}"></button>`).join("");
  return `<div class="product-gallery ${extraClass}" style="--card-color:${product.color};--card-accent:${product.accent}" data-gallery="${product.id}"><div class="gallery-viewport">${slides}</div><button class="gallery-arrow gallery-prev" type="button" aria-label="Previous ${product.name} photo" data-gallery-change="-1">←</button><button class="gallery-arrow gallery-next" type="button" aria-label="Next ${product.name} photo" data-gallery-change="1">→</button><div class="gallery-dots">${dots}</div></div>`;
}

function renderProductCard(product) {
  return `<article class="product-card">${productVisual(product)}<div class="card-label"><span>${product.tag}</span><b>${product.type}</b></div><div class="card-info"><h3 class="card-title">${product.name}</h3><div class="card-meta"><span>${product.brand}</span><span>${money(product.price)}</span></div><button class="card-action" type="button" data-add="${product.id}">Add to bag +</button></div></article>`;
}

function renderProductGrids() {
  document.querySelectorAll("[data-product-grid]").forEach(grid => {
    const isFeatured = grid.dataset.productGrid === "featured";
    grid.innerHTML = `${products.slice(0, isFeatured ? 2 : products.length).map(renderProductCard).join("")}<aside class="collection-note"><h3>Pick your<br><em>colour.</em></h3><p>Two shapes. Two personalities. Find the racket that feels like yours.</p></aside>`;
  });
  const count = document.querySelector("[data-product-count]");
  if (count) count.textContent = products.length;
  document.querySelectorAll("[data-racket-image]").forEach(image => image.addEventListener("error", () => image.classList.add("image-missing"), { once: true }));
}

function changeGallery(gallery, change) {
  const slides = [...gallery.querySelectorAll(".gallery-slide")];
  const current = slides.findIndex(slide => slide.classList.contains("active"));
  const next = (current + change + slides.length) % slides.length;
  slides.forEach((slide, index) => slide.classList.toggle("active", index === next));
  gallery.querySelectorAll(".gallery-dot").forEach((dot, index) => dot.classList.toggle("active", index === next));
}

function calculateTotals(cart = getCart()) {
  const subtotal = cart.reduce((total, item) => total + getProduct(item.id).price * item.quantity, 0);
  return { subtotal, shipping: subtotal === 0 || subtotal >= 100 ? 0 : 6.95, total: subtotal + (subtotal === 0 || subtotal >= 100 ? 0 : 6.95) };
}

function renderCart() {
  const container = document.querySelector("[data-cart-items]");
  if (!container) return;
  const cart = getCart();
  if (!cart.length) {
    container.innerHTML = `<div class="empty-state"><h2>Bag is light.</h2><p>There is still room for your next racket.</p><a class="button button-dark" href="products.html">Browse rackets <span>↗</span></a></div>`;
  } else {
    container.innerHTML = cart.map(item => {
      const product = getProduct(item.id);
      return `<div class="cart-row"><div class="cart-thumb" style="--card-color:${product.color};--card-accent:${product.accent}"><img class="cart-thumb-image" src="${product.gallery[0]}" alt="${product.name} padel racket"></div><div><p class="cart-name">${product.name}</p><div class="quantity"><button type="button" aria-label="Decrease ${product.name} quantity" data-quantity="${product.id}" data-change="-1">−</button><span>${item.quantity}</span><button type="button" aria-label="Increase ${product.name} quantity" data-quantity="${product.id}" data-change="1">+</button></div><br><button class="remove-item" type="button" data-remove="${product.id}">Remove</button></div><strong class="cart-price">${money(product.price * item.quantity)}</strong></div>`;
    }).join("");
  }
  const totals = calculateTotals(cart);
  const subtotal = document.querySelector("[data-subtotal]");
  const shipping = document.querySelector("[data-shipping]");
  const total = document.querySelector("[data-total]");
  if (subtotal) subtotal.textContent = money(totals.subtotal);
  if (shipping) shipping.textContent = totals.shipping ? money(totals.shipping) : "Free";
  if (total) total.textContent = money(totals.total);
  const checkout = document.querySelector("[data-checkout-link]");
  if (checkout) { checkout.style.opacity = cart.length ? "1" : ".45"; checkout.setAttribute("aria-disabled", String(!cart.length)); }
}

function renderCheckout() {
  const container = document.querySelector("[data-checkout-items]");
  if (!container) return;
  const cart = getCart();
  if (!cart.length) { window.location.href = "cart.html"; return; }
  container.innerHTML = cart.map(item => { const product = getProduct(item.id); return `<div class="checkout-line"><span>${product.name}<small>Qty ${item.quantity}</small></span><strong>${money(product.price * item.quantity)}</strong></div>`; }).join("");
  const total = document.querySelector("[data-checkout-total]");
  if (total) total.textContent = money(calculateTotals(cart).total);
}

function changeQuantity(id, change) {
  const cart = getCart();
  const item = cart.find(entry => entry.id === id);
  if (!item) return;
  item.quantity += change;
  saveCart(item.quantity > 0 ? cart : cart.filter(entry => entry.id !== id));
  renderCart();
  renderCheckout();
}

function setupCheckout() {
  const form = document.querySelector("[data-checkout-form]");
  if (!form) return;
  const button = form.querySelector("[data-submit-button]");
  const error = document.querySelector("[data-form-error]");
  const cancelFlag = new URLSearchParams(window.location.search).get("canceled");
  if (cancelFlag && error) error.textContent = "Payment was canceled. Your bag is still here whenever you are ready.";

  form.addEventListener("submit", async event => {
    event.preventDefault();
    const required = [...form.querySelectorAll("[required]")];
    const missing = required.filter(input => !input.value.trim());
    required.forEach(input => input.classList.toggle("invalid", missing.includes(input)));
    if (missing.length) { error.textContent = "Please complete the highlighted fields to continue."; missing[0].focus(); return; }

    const cart = getCart();
    if (!cart.length) { window.location.href = "cart.html"; return; }

    error.textContent = "";
    button.disabled = true;
    const label = button.innerHTML;
    button.innerHTML = "Taking you to payment…";

    try {
      const response = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: cart,
          customer: {
            email: form.elements.email?.value.trim() || undefined,
            phone: form.elements.phone?.value.trim() || undefined
          }
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.url) throw new Error(data.error || "We could not start the payment.");
      window.location.href = data.url;
    } catch (fetchError) {
      error.textContent = fetchError.message;
      button.disabled = false;
      button.innerHTML = label;
    }
  });
}

async function setupSuccess() {
  const card = document.querySelector("[data-success-card]");
  if (!card) return;
  const sessionId = new URLSearchParams(window.location.search).get("session_id");
  if (!sessionId) { renderSuccessError(card, "We could not find that order."); return; }

  try {
    const response = await fetch(`/api/session-status?session_id=${encodeURIComponent(sessionId)}`);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "We could not find that order.");
    if (!data.paid) { renderSuccessPending(card, data); return; }
    renderSuccess(card, data);
  } catch (fetchError) {
    renderSuccessError(card, fetchError.message);
  }
}

function clearBag() {
  localStorage.removeItem(CART_KEY);
  updateCartCount();
}

function renderSuccess(card, data) {
  clearBag();
  const d = data.delivery || {};
  const addressLines = [d.line1, d.line2, d.city, d.postcode, d.country].filter(Boolean);
  const deliveryBlock = addressLines.length
    ? `<div class="success-delivery"><p class="eyebrow">Delivering to</p><p><strong>${d.name || ""}</strong><br>${addressLines.join("<br>")}</p></div>`
    : "";
  card.innerHTML = `<p class="eyebrow">Order confirmed</p><h2>That’s a <em>rally.</em></h2><p>A confirmation has been sent${data.email ? ` to <strong>${data.email}</strong>` : ""}. Your rackets are on their way.</p>${deliveryBlock}<a class="button button-dark" href="products.html">Back to rackets <span>↗</span></a>`;
  const items = document.querySelector("[data-success-items]");
  if (items) items.innerHTML = (data.items || []).map(item => `<div class="checkout-line"><span>${item.name}<small>Qty ${item.quantity}</small></span><strong>${money(item.amount)}</strong></div>`).join("") || `<p class="success-muted">Your items are confirmed.</p>`;
  const shipping = document.querySelector("[data-success-shipping]");
  if (shipping) shipping.textContent = data.totals?.shipping ? money(data.totals.shipping) : "Free";
  const total = document.querySelector("[data-success-total]");
  if (total) total.textContent = money(data.total || 0);
}

function renderSuccessPending(card, data) {
  card.innerHTML = `<p class="eyebrow">Processing</p><h2>Still <em>settling.</em></h2><p>Your payment is being confirmed. Refresh this page in a moment to see your order.</p><a class="button button-dark" href="products.html">Back to rackets <span>↗</span></a>`;
  if (data?.email) { const total = document.querySelector("[data-success-total]"); if (total) total.textContent = money(data.total || 0); }
}

function renderSuccessError(card, message) {
  card.innerHTML = `<p class="eyebrow">Something went wrong</p><h2>No <em>rattle.</em></h2><p>${message || "We could not confirm that payment."} If you were charged, contact us and we will sort it out.</p><a class="button button-dark" href="cart.html">Back to bag <span>↗</span></a>`;
}

function applyBranding() {
  document.title = document.title.replace("Rally Padel", "Elite Padel");
  document.querySelectorAll(".wordmark").forEach(wordmark => {
    if (!wordmark.querySelector(".site-logo")) {
      wordmark.innerHTML = '<img class="site-logo" src="images/logo.jpeg" alt="Elite Padel">';
    }
    wordmark.setAttribute("aria-label", "Elite Padel home");
  });
  document.querySelectorAll(".footer-meta").forEach(meta => { meta.textContent = "© 2026 Elite Padel"; });
}

document.addEventListener("click", event => {
  const add = event.target.closest("[data-add]");
  if (add) addToCart(add.dataset.add);
  const quantity = event.target.closest("[data-quantity]");
  if (quantity) changeQuantity(quantity.dataset.quantity, Number(quantity.dataset.change));
  const remove = event.target.closest("[data-remove]");
  if (remove) { saveCart(getCart().filter(item => item.id !== remove.dataset.remove)); renderCart(); }
  const checkout = event.target.closest("[data-checkout-link][aria-disabled='true']");
  if (checkout) event.preventDefault();
  const galleryChange = event.target.closest("[data-gallery-change]");
  if (galleryChange) changeGallery(galleryChange.closest("[data-gallery]"), Number(galleryChange.dataset.galleryChange));
  const galleryDot = event.target.closest("[data-gallery-dot]");
  if (galleryDot) {
    const gallery = galleryDot.closest("[data-gallery]");
    const slides = [...gallery.querySelectorAll(".gallery-slide")];
    slides.forEach((slide, index) => slide.classList.toggle("active", index === Number(galleryDot.dataset.galleryDot)));
    gallery.querySelectorAll(".gallery-dot").forEach((dot, index) => dot.classList.toggle("active", index === Number(galleryDot.dataset.galleryDot)));
  }
});

document.addEventListener("DOMContentLoaded", () => {
  applyBranding();
  updateCartCount();
  renderProductGrids();
  renderCart();
  renderCheckout();
  setupCheckout();
  setupSuccess();
  if (new URLSearchParams(window.location.search).get("canceled")) renderCart();
  const sort = document.querySelector("#sort-products");
  if (sort) sort.addEventListener("change", () => { const grid = document.querySelector('[data-product-grid="all"]'); if (!grid) return; const sorted = [...products].sort((a, b) => sort.value === "price-low" ? a.price - b.price : sort.value === "price-high" ? b.price - a.price : products.indexOf(a) - products.indexOf(b)); grid.innerHTML = `${sorted.map(renderProductCard).join("")}<aside class="collection-note"><h3>Pick your<br><em>colour.</em></h3><p>Two shapes. Two personalities. Find the racket that feels like yours.</p></aside>`; });
});
