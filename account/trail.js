// The printed artwork and its transparent stamp buttons share the same aspect ratio.
class LoyaltyTrail extends HTMLElement {
  connectedCallback() {
    if (this.querySelector(".trail-art")) return;
    this.innerHTML = `
      <div class="trail-art">
        <img src="/account/burgundy-trail.webp" width="1586" height="992" alt="LEB EATS loyalty card. Follow the cedar trail from one to four across the top, then five to eight back along the bottom.">
        <div class="trail-stops"></div>
      </div>
      <div class="trail-caption"><h2 class="trail-count">Opening card…</h2><span class="trail-cycle"></span></div>
      <p class="trail-next"></p>
      <p class="trail-selection" role="status" hidden></p>
      <div class="trail-rewards"></div>`;
    for (let stamp=1; stamp<=8; stamp++) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "trail-stop stop-" + stamp;
      button.disabled = true;
      button.addEventListener("click", () => {
        const tip = this.querySelector(".trail-selection");
        tip.textContent = this.describe(stamp);
        tip.hidden = false;
      });
      this.querySelector(".trail-stops").append(button);
    }
  }
  describe(stamp) {
    const {level, cycle, welcome} = this.state;
    const earned = stamp <= level;
    const parts = ["Stamp " + stamp, earned ? "collected" : "still to collect"];
    if (earned && stamp === 1 && cycle === 1 && welcome) parts.push("welcome stamp");
    if (stamp === 4 || stamp === 8) {
      const reward = this.state.rewards.find(r => r.stamp === (cycle-1)*8 + stamp);
      parts.push((stamp===4 ? "£5 off" : "Free meal") + (reward ? (reward.usedAt ? " · used" : " · ready to use") : ""));
    }
    return parts.join(" · ");
  }
  update(state) {
    this.connectedCallback();
    const signature = JSON.stringify(state);
    if (this.signature === signature) return;
    this.signature = signature;
    this.state = state;
    this.querySelector(".trail-selection").hidden = true;
    for (const [i,button] of [...this.querySelectorAll(".trail-stop")].entries()) {
      const stamp=i+1;
      button.disabled = false;
      button.classList.toggle("earned", stamp <= state.level);
      button.classList.toggle("current", stamp === state.level);
      button.setAttribute("aria-label", this.describe(stamp));
      if (stamp===state.level) button.setAttribute("aria-current","step");
      else button.removeAttribute("aria-current");
    }
    this.querySelector(".trail-count").textContent = state.level + " of 8 stamps";
    this.querySelector(".trail-cycle").textContent = "Card " + state.cycle;
    const goal = state.level<4 ? 4 : 8;
    const left = goal-state.level;
    const next = left ? left + " more qualifying " + (left===1 ? "order" : "orders") + " for " + (goal===4 ? "£5 off." : "a free meal.") : "Card complete. The next qualifying order starts a new card.";
    const welcome = state.welcome && state.cycle===1 && state.level===1 ? "Welcome stamp collected. " : "";
    this.querySelector(".trail-next").textContent = welcome + next;
    this.renderRewards();
  }
  renderRewards() {
    const root = this.querySelector(".trail-rewards");
    const open = new Set([...root.querySelectorAll("details[open]")].map(el=>el.dataset.id));
    root.replaceChildren();
    if (!this.state.rewards.length) return;
    const heading = document.createElement("h3");
    heading.textContent = "Rewards";
    root.append(heading);
    for (const r of this.state.rewards) {
      const row = document.createElement("div");
      row.className = "reward-row";
      const name = document.createElement("strong");
      const title = r.stamp % 8 === 0 ? "Free meal" : "£5 off";
      name.textContent = title;
      const meta = document.createElement("span");
      const cardNo = Math.ceil(r.stamp/8);
      meta.textContent = "Card " + cardNo + " · Stamp " + (r.stamp%8 || 8);
      const status = document.createElement("b");
      status.className = r.usedAt ? "reward-used" : "reward-ready";
      status.textContent = r.usedAt ? "Used" : "Ready to use";
      row.append(name,meta,status);
      if (!r.usedAt && this.hasAttribute("customer") && r.code) {
        const details = document.createElement("details");
        details.dataset.id = r.id;
        details.open = open.has(r.id);
        const summary = document.createElement("summary");
        summary.textContent = "Show reward code";
        const code = document.createElement("code");
        code.textContent = r.code;
        const hint = document.createElement("p");
        hint.textContent = "Show this code at the till to use your reward.";
        details.append(summary,code,hint);
        row.append(details);
      } else if (!r.usedAt && !this.hasAttribute("customer")) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary";
        button.textContent = "Redeem " + title;
        button.addEventListener("click", () => this.dispatchEvent(new CustomEvent("redeem-reward",{bubbles:true,detail:{id:r.id,title}})));
        row.append(button);
      }
      root.append(row);
    }
  }
}
customElements.define("leb-trail", LoyaltyTrail);
