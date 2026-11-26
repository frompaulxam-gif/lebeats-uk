// Coordinates are shared by the printed route, interactive stops and moving stamp.
const trailStops = [[89,196],[264,196],[439,196],[632,196],[632,331],[439,331],[264,331],[89,331]];
const trailRoute = trailStops.map(([x,y],i)=>{
  if (i===0) return `M ${x-48} ${y-48} Q ${x-5} ${y-65} ${x} ${y}`;
  if (i===4) return "M632 196 C777 196 777 331 632 331";
  const [startX,startY]=trailStops[i-1];
  return `M${startX} ${startY} L${x} ${y}`;
});
const cedarShape = "M0 -24 C-3 -18 -9 -14 -15 -12 L-8 -12 Q-12 -7 -19 -5 L-10 -5 Q-14 1 -22 3 L-13 4 Q-17 10 -25 12 Q-14 16 -4 12 L-4 19 L-7 23 H7 L4 19 V12 Q15 16 25 12 Q17 10 13 4 L22 3 Q14 0 10 -5 L19 -5 Q12 -8 8 -12 H15 Q4 -18 0 -24Z";
const cardLevel = total => total ? (total-1)%8+1 : 0;
let trailInstance = 0;

function sealOutline() {
  // Two smooth quadratic curves form each scallop.
  const point = (radius,angle) => [Math.cos(angle)*radius,Math.sin(angle)*radius].map(n=>n.toFixed(2)).join(" ");
  const step = 2*Math.PI/16;
  let d = "M"+point(54,0);
  for(let i=0;i<16;i++) d += " Q"+point(61,(i+.25)*step)+" "+point(58,(i+.5)*step)+" Q"+point(56,(i+.75)*step)+" "+point(54,(i+1)*step);
  return d+"Z";
}
const seal = sealOutline();
function stampMarkup([x,y],index) {
  const n=index+1, prize=n===4 || n===8;
  const face = prize ? '<path class="coin" d="'+seal+'"/>' : '<circle class="coin" r="41"/>';
  return `<g class="trail-stop stop-${n} ${prize?'prize':''} ${n>4?'red':'green'}" transform="translate(${x} ${y})" role="button" tabindex="0" aria-label="Stamp ${n}">
    <title>Stamp ${n}</title>
    <circle class="burst" r="${prize?61:44}"/>
    <g class="impression">${face}
      <g transform="translate(0 ${prize?-13:0})">
        <text class="stamp-number" x="-15" y="14">${n}</text>
        <g transform="translate(15 0) scale(.72)"><path class="cedar" d="${cedarShape}"/></g>
      </g>
      ${prize?'<text class="prize-label" y="24">'+(n===4?'£5 OFF':'FREE MEAL')+'</text>':''}
    </g>
    <g transform="translate(${prize?43:33} ${prize?35:29})"><g class="tick">
      <circle r="24"/><path class="tick-ink" pathLength="1" d="M-13 0 L-4 9 L14 -11"/>
    </g></g>
  </g>`;
}

class LoyaltyTrail extends HTMLElement {
  connectedCallback() {
    if (this.svg) return;
    const id = "cedar-trail-"+(++trailInstance);
    const demo = this.hasAttribute("demo");
    this.innerHTML = `
      <div class="trail-art">
        <svg class="cedar-card" viewBox="0 0 800 447" role="group" aria-label="Eight-stamp loyalty trail">
          <defs>
            <radialGradient id="${id}-paper" cx="38%" cy="10%" r="100%"><stop stop-color="#97132a"/><stop offset=".62" stop-color="#78091c"/><stop offset="1" stop-color="#560514"/></radialGradient>
            <filter id="${id}-grain" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency=".58" numOctaves="2" stitchTiles="stitch"/></filter>
          </defs>
          <rect width="800" height="447" fill="url(#${id}-paper)"/>
          <rect class="paper-grain" width="800" height="447" filter="url(#${id}-grain)" opacity=".085"/>
          <svg x="31" y="24" width="114" height="98" viewBox="103 115 199 172" aria-hidden="true"><image href="https://lebeats.uk/assets/logo.png" width="400" height="400"/></svg>
          <text class="card-lettering" x="171" y="107" textLength="588" lengthAdjust="spacingAndGlyphs">LOYALTY CARD</text>
          <g aria-hidden="true" class="route-lines">${trailRoute.slice(1).map(d=>'<path class="route-leg" d="'+d+'"/>').join('')}</g>
          <g aria-hidden="true" class="route-arrows">
            <path d="M171 190l8 6-8 6 M346 190l8 6-8 6 M526 190l8 6-8 6 M735 260l6 8 6-8 M539 325l-8 6 8 6 M359 325l-8 6 8 6 M184 325l-8 6 8 6"/>
          </g>
          <path class="route-ink" aria-hidden="true" pathLength="1"/>
          <g class="stops">${trailStops.map(stampMarkup).join('')}</g>
          <g class="traveller" aria-hidden="true" visibility="hidden"><g><circle r="25"/><text y="9">+1</text></g></g>
          <text class="card-message" x="400" y="421" aria-hidden="true">One stamp per qualifying order.</text>
        </svg>
      </div>
      <div class="trail-caption"><h2 class="trail-count">Opening card…</h2><span class="trail-cycle"></span></div>
      <p class="trail-next"></p>
      <button type="button" class="trail-play secondary" hidden>${demo?'Preview +1 stamp':'Replay last stamp'}</button>
      <p class="trail-selection" role="status" hidden></p>
      <span class="trail-announcement" role="status"></span>
      <div class="trail-rewards"></div>`;
    this.svg=this.querySelector(".cedar-card");
    this.stops=[...this.querySelectorAll(".trail-stop")];
    this.legs=[...this.querySelectorAll(".route-leg")];
    this.token=this.querySelector(".traveller");
    this.ink=this.querySelector(".route-ink");
    this.play=this.querySelector(".trail-play");
    this.motion=matchMedia("(prefers-reduced-motion: reduce)");
    this.stops.forEach((stop,i)=>{
      const select=()=>{
        if (!this.state) return;
        const tip=this.querySelector(".trail-selection");
        tip.textContent=this.describe(i+1);
        tip.hidden=false;
      };
      stop.addEventListener("click",select);
      stop.addEventListener("keydown",event=>{
        if(event.key==="Enter" || event.key===" "){event.preventDefault();select();}
      });
    });
    this.play.addEventListener("click",()=>{
      if (demo) this.sample(this.state.total===8 ? 3 : this.state.total+1);
      else if (this.state.total) this.animateFrom(this.state.total-1);
    });
    if (demo) this.sample(3);
  }
  disconnectedCallback() { this.stopMotion(); }
  stopMotion() {
    cancelAnimationFrame(this.frame);
    this.frame=0;
    if (!this.svg) return;
    this.token.setAttribute("visibility","hidden");
    this.ink.removeAttribute("d");
    this.stops.forEach(stop=>stop.classList.remove("landing"));
    this.play.disabled=false;
  }
  sample(total) {
    const level=cardLevel(total), cycle=Math.ceil(total/8);
    const rewards=[];
    for (let stamp=cycle*8-4;stamp<=total;stamp+=4) rewards.unshift({id:"sample-"+stamp,stamp,usedAt:null});
    this.update({level,total,cycle,orders:total-1,welcome:1,rewards});
  }
  update(state, lastSeen) {
    this.connectedCallback();
    const signature=JSON.stringify(state);
    if(this.signature===signature) return;
    const oldTotal=this.state?.total ?? lastSeen;
    this.signature=signature;
    this.state=state;
    this.querySelector(".trail-selection").hidden=true;
    this.play.hidden=!state.total;
    if (this.hasAttribute("demo")) this.play.textContent=state.total===8 ? "Restart preview" : "Preview +1 stamp";
    if (Number.isInteger(oldTotal) && oldTotal<state.total) {
      // If several orders arrived while the card was closed, play the newest arrival.
      this.animateFrom(state.total-1);
    } else {
      this.stopMotion();
      this.paint(state.total);
      this.renderRewards();
    }
  }
  paint(total) {
    const level=cardLevel(total), cycle=Math.max(1,Math.ceil(total/8));
    this.stops.forEach((stop,i)=>{
      const n=i+1;
      stop.classList.toggle("earned",n<=level);
      stop.classList.toggle("current",n===level);
      stop.setAttribute("aria-label",this.describe(n,level,cycle));
      if(n===level) stop.setAttribute("aria-current","step");
      else stop.removeAttribute("aria-current");
    });
    this.legs.forEach((leg,i)=>leg.classList.toggle("filled",i+2<=level));
    this.querySelector(".trail-count").textContent=level+" of 8 stamps";
    this.querySelector(".trail-cycle").textContent="Card "+cycle;
    const goal=level<4?4:8, left=goal-level;
    const next=left ? left+" more qualifying "+(left===1?"order":"orders")+" for "+(goal===4?"£5 off.":"a free meal.") : "Card complete. The next qualifying order starts a new card.";
    const welcome=this.state.welcome && total===1 ? "Welcome stamp collected. " : "";
    this.querySelector(".trail-next").textContent=welcome+next;
    this.setMessage("One stamp per qualifying order.");
  }
  setMessage(text,emphasis=false) {
    const message=this.querySelector(".card-message");
    message.textContent=text;
    message.classList.toggle("emphasis",emphasis);
  }
  animateFrom(previous) {
    this.stopMotion();
    const {total,level}=this.state;
    const award=level===4?"£5 off":level===8?"Free meal":"";
    const result=award ? award+" unlocked" : (total===1 && this.state.welcome ? "Welcome stamp collected" : "Stamp "+level+" collected");
    const arrive=()=>{
      this.paint(total);
      this.renderRewards();
      this.setMessage(result,true);
      this.querySelector(".trail-announcement").textContent=result+". "+level+" of 8 stamps.";
    };
    if(this.motion.matches){arrive();return;}
    this.paint(level===1 ? 0 : previous);
    this.querySelector(".trail-cycle").textContent="Card "+this.state.cycle;
    this.setMessage(total===1 && this.state.welcome ? "Your first stamp" : "Collecting your stamp…");
    this.play.disabled=true;
    this.ink.setAttribute("d",trailRoute[level-1]);
    this.ink.setAttribute("stroke-dashoffset","1");
    const length=this.ink.getTotalLength();
    const start=performance.now();
    let landed=false;
    const frame=now=>{
      const elapsed=now-start;
      if(this.motion.matches){this.stopMotion();arrive();return;}
      if(elapsed<1120) {
        const t=Math.min(1,Math.max(0,(elapsed-160)/960));
        const eased=t*t*(3-2*t);
        const p=this.ink.getPointAtLength(length*eased);
        const lift=Math.sin(Math.PI*eased)*(level===5?9:36);
        this.token.setAttribute("visibility","visible");
        this.token.setAttribute("opacity",Math.min(1,elapsed/150));
        this.token.setAttribute("transform",`translate(${p.x} ${p.y-lift})`);
        this.ink.setAttribute("stroke-dashoffset",1-eased);
      } else if(!landed) {
        landed=true;
        this.token.setAttribute("visibility","hidden");
        this.ink.removeAttribute("d");
        arrive();
        this.stops[level-1].classList.add("landing");
      }
      if(elapsed<2200) this.frame=requestAnimationFrame(frame);
      else this.stopMotion();
    };
    this.frame=requestAnimationFrame(frame);
  }
  describe(stamp, level=this.state.level, cycle=this.state.cycle) {
    const {welcome} = this.state;
    const earned = stamp <= level;
    const parts = ["Stamp " + stamp, earned ? "collected" : "still to collect"];
    if (earned && stamp === 1 && cycle === 1 && welcome) parts.push("welcome stamp");
    if (stamp === 4 || stamp === 8) {
      const reward = this.state.rewards.find(r => r.stamp === (cycle-1)*8 + stamp);
      parts.push((stamp===4 ? "£5 off" : "Free meal") + (reward ? (reward.usedAt ? " · used" : " · ready to use") : ""));
    }
    return parts.join(" · ");
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
      status.textContent = r.usedAt ? "Used" : this.hasAttribute("demo") ? "Sample reward" : "Ready to use";
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
      } else if (!r.usedAt && !this.hasAttribute("customer") && !this.hasAttribute("demo")) {
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
