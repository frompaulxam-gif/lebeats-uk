const dialog = document.getElementById("card-dialog");
const cardForm = document.getElementById("card-form");
const cardStatus = document.getElementById("card-status");
const cardSubmit = cardForm.querySelector("button");
const cardName = cardForm.elements.namedItem("name");
const cardEmail = cardForm.elements.namedItem("email");
const cardDescription = document.getElementById("card-description");
const seenKey = "lebeats.blackCardSignup.seen";
let openTimer;
function openSignup() {
  clearTimeout(openTimer);
  if (cardForm.hidden) {
    cardForm.hidden = false;
    cardDescription.hidden = false;
    cardStatus.textContent = "";
  }
  if (!dialog.open) dialog.showModal();
  try { sessionStorage.setItem(seenKey, "1"); } catch {}
}
cardForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (cardSubmit.disabled) return;
  if (!cardName.value.trim()) {
    cardName.setCustomValidity("Enter your name.");
    cardName.reportValidity();
    return;
  }
  cardStatus.textContent = "";
  cardSubmit.disabled = true;
  cardSubmit.textContent = "Signing up…";
  cardName.readOnly = cardEmail.readOnly = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(cardForm.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      signal: controller.signal,
      body: JSON.stringify({ name: cardName.value.trim(), email: cardEmail.value.trim() })
    });
    if (!response.ok) {
      const messages = {
        422: "Check your name and email, then try again.",
        429: "Please wait a minute and try again."
      };
      cardStatus.textContent = messages[response.status] || "We couldn’t confirm your signup. Please try again.";
      return;
    }
    if ((await response.json()).saved !== true) throw new Error("Unconfirmed signup");
    cardForm.reset();
    cardForm.hidden = true;
    cardDescription.hidden = true;
    cardStatus.textContent = "You’re on the list for Black Card updates and discounts.";
    if (dialog.open) cardStatus.focus({ preventScroll: true });
  } catch {
    cardStatus.textContent = "We couldn’t confirm your signup. Check your connection and try again.";
  } finally {
    clearTimeout(timeout);
    cardSubmit.disabled = false;
    cardSubmit.textContent = "Sign up";
    cardName.readOnly = cardEmail.readOnly = false;
  }
});
cardName.addEventListener("input", () => cardName.setCustomValidity(""));
for (const button of document.querySelectorAll(".open-card")) {
  button.addEventListener("click", openSignup);
}
dialog.querySelector(".card-close").addEventListener("click", () => dialog.close());
dialog.addEventListener("click", event => {
  if (event.target !== dialog) return;
  const bounds = dialog.getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right ||
      event.clientY < bounds.top || event.clientY > bounds.bottom) dialog.close();
});
window.addEventListener("load", () => {
  try { if (sessionStorage.getItem(seenKey)) return; } catch {}
  openTimer = setTimeout(() => { if (!document.querySelector("dialog[open]")) openSignup(); }, 1500);
}, { once: true });

const heroTrack = document.querySelector(".hero-track");
const hero = heroTrack.querySelector(".hero");
const heroCopy = hero.querySelector(".hero-copy");
const header = document.querySelector("header");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let paintFrame = 0;
function paintHero() {
  const travel = Math.max(1, heroTrack.offsetHeight - hero.offsetHeight);
  const distance = header.offsetHeight - heroTrack.getBoundingClientRect().top;
  const progress = motion.matches ? 0 : Math.min(1, Math.max(0, distance / travel));
  heroTrack.style.setProperty("--p", String(progress));
  heroCopy.inert = progress >= 1 / 2.8;
  heroCopy.style.visibility = heroCopy.inert ? "hidden" : "visible";
  paintFrame = 0;
}
function schedulePaint() {
  if (!paintFrame) paintFrame = requestAnimationFrame(paintHero);
}
addEventListener("scroll", schedulePaint, { passive: true });
addEventListener("resize", schedulePaint);
const secondPanel = hero.querySelector(".hero-second");
function positionSecondPanel() {
  const parent = motion.matches ? heroTrack : hero;
  if (secondPanel.parentElement !== parent) parent.append(secondPanel);
  schedulePaint();
}
motion.addEventListener("change", positionSecondPanel);
positionSecondPanel();
paintHero();

const modeButtons = document.querySelectorAll("[data-mode]");
function selectMode(mode) {
  for (const button of modeButtons) {
    const selected = button.dataset.mode === mode;
    button.setAttribute("aria-pressed", String(selected));
    button.classList.toggle("active", selected);
    document.getElementById(button.dataset.mode + "-panel").hidden = !selected;
  }
}
for (const button of modeButtons) {
  button.addEventListener("click", () => selectMode(button.dataset.mode));
}
for (const button of document.querySelectorAll("[data-jump-mode]")) {
  button.addEventListener("click", () => {
    const mode = button.dataset.jumpMode;
    selectMode(mode);
    const heading = document.querySelector("#" + mode + "-panel h3");
    heading.focus({ preventScroll: true });
    heading.closest(".order-box").scrollIntoView({ block: "start" });
  });
}

const navDialog = document.getElementById("nav-dialog");
const navTrigger = document.querySelector(".menu-toggle");
navTrigger.addEventListener("click", () => {
  navDialog.showModal();
  navTrigger.setAttribute("aria-expanded", "true");
});
navDialog.addEventListener("close", () => navTrigger.setAttribute("aria-expanded", "false"));
navDialog.addEventListener("click", event => {
  if (event.target.closest("a, button")) navDialog.close();
});

const reviews = document.querySelector(".google-reviews");
const reviewTrack = reviews.querySelector(".reviews-track");
const repeatReviews = reviewTrack.querySelector(".reviews-list").cloneNode(true);
repeatReviews.setAttribute("aria-hidden", "true");
repeatReviews.inert = true;
reviewTrack.append(repeatReviews);
reviews.classList.add("is-moving");

const playback = reviews.querySelector(".review-playback");
playback.hidden = false;
playback.addEventListener("click", () => {
  const paused = reviews.toggleAttribute("data-paused");
  const label = paused ? "Resume scrolling reviews" : "Pause scrolling reviews";
  playback.setAttribute("aria-label", label);
  playback.title = label;
});
