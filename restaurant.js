const dialog = document.getElementById("card-dialog");
const cardForm = document.getElementById("card-form");
const cardStatus = document.getElementById("card-status");
const cardSubmit = cardForm.querySelector("button");
const cardName = cardForm.elements.namedItem("name");
const cardEmail = cardForm.elements.namedItem("email");
const cardPhone = cardForm.elements.namedItem("phone");
const cardCountry = cardForm.elements.namedItem("country");
const cardActionLabel = cardSubmit.textContent;
const phoneLibrary = window.libphonenumber;
const phoneExamples = { GB: "7700 900123", IE: "85 123 4567", US: "202 555 0142", CA: "416 555 0142", FR: "6 12 34 56 78", LB: "71 123 456" };

function countryFlag(code) {
  return String.fromCodePoint(...Array.from(code, letter => 127397 + letter.charCodeAt(0)));
}
if (phoneLibrary) {
  const names = typeof Intl.DisplayNames === "function" ? new Intl.DisplayNames(["en-GB"], { type: "region" }) : null;
  const countryOptions = phoneLibrary.getCountries()
    .map(code => ({ code, name: names?.of(code) || code }))
    .sort((a, b) => a.name.localeCompare(b.name, "en-GB"))
    .map(({ code, name }) => new Option(
      countryFlag(code) + " " + name + " (+" + phoneLibrary.getCountryCallingCode(code) + ")",
      code, code === "GB", code === "GB"
    ));
  cardCountry.replaceChildren(...countryOptions);
}
function syncCardCountry() {
  const code = cardCountry.value;
  document.getElementById("card-flag").textContent = countryFlag(code);
  document.getElementById("card-dial").textContent = "+" + (phoneLibrary?.getCountryCallingCode(code) || "44");
  cardPhone.placeholder = phoneExamples[code] || "Phone number";
  cardPhone.setCustomValidity("");
}
cardCountry.addEventListener("change", syncCardCountry);
const cardDescription = document.getElementById("card-description");
const seenKey = "lebeats.blackCardSignup.seen";
const cardTitle = document.getElementById("card-title");
const initialTitle = cardTitle.textContent;
const initialDescription = cardDescription.textContent;
const accountLink = dialog.querySelector(".card-account-link");
const bonusForm = document.getElementById("bonus-form");
const bonusSubmit = bonusForm.querySelector('[type="submit"]');
const confirmation = document.getElementById("bonus-confirmation");
const recoveryKey = document.getElementById("bonus-key");
let signupDetails = null;
let openTimer;
function openSignup() {
  clearTimeout(openTimer);
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
  const phoneInput = cardPhone.value.trim();
  let phone = "";
  if (phoneInput) {
    if (!phoneLibrary) {
      cardStatus.textContent = "The phone field couldn’t load. Refresh the page or leave the number blank.";
      return;
    }
    const number = phoneLibrary.parsePhoneNumberFromString(phoneInput, { defaultCountry: cardCountry.value, extract: false });
    if (!number?.isPossible() || number.ext) {
      cardPhone.setCustomValidity("Check the country code and phone number, or leave it blank.");
      cardPhone.reportValidity();
      return;
    }
    phone = number.number;
  }
  cardStatus.textContent = "";
  cardCountry.disabled = cardSubmit.disabled = true;
  cardSubmit.textContent = "Signing up…";
  cardName.readOnly = cardEmail.readOnly = cardPhone.readOnly = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(cardForm.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "omit",
      signal: controller.signal,
      body: JSON.stringify({
        name: cardName.value.trim(),
        email: cardEmail.value.trim(),
        phone,
        formVersion: "loyalty-card",
        source: window.lebSignupSource?.() || null
      })
    });
    if (!response.ok) {
      const messages = {
        422: "Check your details, then try again.",
        429: "Please wait a minute and try again."
      };
      cardStatus.textContent = messages[response.status] || "We couldn’t confirm your signup. Please try again.";
      return;
    }
    if ((await response.json()).saved !== true) throw new Error("Unconfirmed signup");
    signupDetails = { name: cardName.value.trim(), email: cardEmail.value.trim(), phone, country: cardCountry.value };
    cardForm.reset();
    syncCardCountry();
    cardForm.hidden = true;
    bonusForm.hidden = false;
    cardTitle.textContent = "GET 1 FREE POINT";
    cardDescription.textContent = "You’re on the email list. Choose a password to create your loyalty account and collect your free point.";
    accountLink.href = "/account/#login";
    accountLink.textContent = "Already have an account? Sign in";
    if (dialog.open) bonusForm.elements.password.focus();
  } catch {
    cardStatus.textContent = "We couldn’t confirm your signup. Check your connection and try again.";
  } finally {
    clearTimeout(timeout);
    cardCountry.disabled = cardSubmit.disabled = false;
    cardSubmit.textContent = cardActionLabel;
    cardName.readOnly = cardEmail.readOnly = cardPhone.readOnly = false;
  }
});
bonusForm.addEventListener("submit", async event => {
  event.preventDefault();
  if (!signupDetails || bonusSubmit.disabled) return;
  bonusSubmit.disabled = true;
  cardStatus.textContent = "Creating your account…";
  try {
    // Check the active account and use the same cookie fallback as the account page.
    let existing;
    try {
      existing = (await api("session")).member;
    } catch (error) {
      if (error.status !== 401) throw error;
      if (useTabSession) saveTabSession("");
      else if (brandedPage) useTabSession = !(await api("cookie-check")).supported;
    }
    if (existing) {
      cardTitle.textContent = "YOU’RE ON THE LIST";
      cardDescription.textContent = "Your email signup is saved.";
      cardStatus.textContent = "You’re already signed in. Open your account to see your points.";
      accountLink.href = "/account/";
      accountLink.textContent = "View my account";
      bonusForm.reset();
      bonusForm.hidden = true;
      return;
    }
    const result = await api("register", { ...signupDetails, password: bonusForm.elements.password.value });
    signupDetails = null;
    bonusForm.reset();
    bonusForm.hidden = true;
    cardTitle.textContent = "YOU’RE IN!";
    cardDescription.textContent = "Your loyalty balance is " + result.member.points + (result.member.points === 1 ? " point." : " points.");
    recoveryKey.textContent = result.recoveryKey;
    confirmation.hidden = false;
    accountLink.href = "/account/";
    accountLink.textContent = "View my account";
    cardStatus.textContent = "";
    if (dialog.open) accountLink.focus({ preventScroll: true });
  } catch (error) {
    cardStatus.textContent = error.status === 409
      ? "This email already has an account. Sign in below to view your balance."
      : error.message === "Failed to fetch" ? "Check your connection and try again." : error.message;
  } finally {
    bonusSubmit.disabled = false;
  }
});
bonusForm.querySelector(".card-skip").addEventListener("click", () => dialog.close());
dialog.addEventListener("close", () => {
  if (bonusSubmit.disabled || cardSubmit.disabled) return;
  signupDetails = null;
  bonusForm.reset();
  bonusForm.hidden = confirmation.hidden = true;
  recoveryKey.textContent = cardStatus.textContent = "";
  cardTitle.textContent = initialTitle;
  cardDescription.textContent = initialDescription;
  accountLink.href = "/account/";
  accountLink.textContent = "Open your loyalty account";
  cardForm.hidden = false;
});
cardName.addEventListener("input", () => cardName.setCustomValidity(""));
cardPhone.addEventListener("input", () => cardPhone.setCustomValidity(""));
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
