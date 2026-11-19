const dialog = document.getElementById("card-dialog");
const seenKey = "lebeats.blackCardSignup.seen";
let openTimer;
function openSignup() {
  clearTimeout(openTimer);
  if (!dialog.open) dialog.showModal();
  try { sessionStorage.setItem(seenKey, "1"); } catch {}
}
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
const heroCopy = heroTrack.querySelector(".hero-copy");
const motion = matchMedia("(prefers-reduced-motion: reduce)");
let paintFrame = 0;
function paintHero() {
  const travel = Math.max(1, heroTrack.offsetHeight - innerHeight);
  const progress = motion.matches ? 0 : Math.min(1, Math.max(0, -heroTrack.getBoundingClientRect().top / travel));
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
const hero = heroTrack.querySelector(".hero");
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
    selectMode(button.dataset.jumpMode);
    document.getElementById("order").scrollIntoView();
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
