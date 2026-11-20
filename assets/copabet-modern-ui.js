/* COPABET • navegação móvel e painel de bilhete.
 * Não cria, altera ou envia apostas: reutiliza os controles existentes.
 */
(() => {
  "use strict";
  function init(){
    // O painel ADM e os bilhetes de cambista não dependem da navegação móvel.
    import("/assets/copabet-daily-tickets.mjs?v=2").catch(error=>console.error("Painel diário COPABET indisponível:",error));
    const pub = document.getElementById("publicView");
    const slip = document.getElementById("floatingBetSlip");
    const toggle = document.getElementById("cbSlipToggle");
    const gate = document.getElementById("cbEntryGate");
    const filters = document.getElementById("cbSportFilters");
    if (!pub || !slip || !toggle || !filters) return;
    if (document.getElementById("cbModernMobileNav")) return;

    const mobile = () => window.matchMedia("(max-width:699px)").matches;
    const scrollMode = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const visible = id => {
      const el = document.getElementById(id);
      return el && !el.classList.contains("hidden");
    };
    const publicActive = () => !pub.classList.contains("hidden")
      && (!gate || gate.classList.contains("cb-entry-dismissed"))
      && !visible("adminLogin")
      && !visible("paymentModal");

    const icons = {
      home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/><path d="M9 21v-8h6v8"/></svg>',
      games: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="m12 7 4 3-1.5 4.5h-5L8 10zM12 7V3m4 7 4-2M8 10 4 8m5.5 6.5L7 19m7.5-4.5L17 19"/></svg>',
      live: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="2.2"/><path d="M7.2 7.2a6.8 6.8 0 0 0 0 9.6m9.6-9.6a6.8 6.8 0 0 1 0 9.6M4.2 4.2a11 11 0 0 0 0 15.6m15.6-15.6a11 11 0 0 1 0 15.6"/></svg>',
      ticket: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 3h16v5a3 3 0 0 0 0 6v7H4v-7a3 3 0 0 0 0-6z"/><path d="M9 8h6m-6 4h6m-6 4h4"/></svg>'
    };
    const entries = [
      ["home", "Início"],
      ["games", "Jogos"],
      ["live", "Ao vivo"],
      ["ticket", "Bilhete"]
    ];
    const nav = document.createElement("nav");
    nav.id = "cbModernMobileNav";
    nav.className = "cb-mobile-nav";
    nav.setAttribute("aria-label", "Navegação da COPABET no celular");
    for (const [action, label] of entries){
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.cbSection = action;
      btn.innerHTML = icons[action] + "<span>" + label + "</span>";
      btn.setAttribute("aria-label", action === "ticket" ? "Abrir meu bilhete de apostas" : label);
      nav.append(btn);
    }

    const scrim = document.createElement("button");
    scrim.type = "button";
    scrim.hidden = true;
    scrim.className = "cb-mobile-scrim";
    scrim.setAttribute("aria-label", "Fechar o bilhete de apostas");
    document.body.append(scrim, nav);
    const buttonFor = section => nav.querySelector('[data-cb-section="' + section + '"]');
    const ticketButton = buttonFor("ticket");
    const ticketBadge = document.createElement("span");
    ticketBadge.className = "cb-nav-ticket-count";
    ticketBadge.hidden = true;
    ticketButton.append(ticketBadge);
    const slipCounter = document.getElementById("cbSlipCount");
    function updateTicketCount(){
      const count = Math.max(0,Number((slipCounter?.textContent || "").match(/\d+/)?.[0] || 0));
      ticketBadge.hidden = count === 0;
      ticketBadge.textContent = count > 99 ? "99+" : String(count);
      ticketButton.setAttribute("aria-label", count > 0
        ? "Abrir meu bilhete com " + count + (count === 1 ? " jogo" : " jogos")
        : "Abrir meu bilhete de apostas");
    }
    if (slipCounter) new MutationObserver(updateTicketCount).observe(slipCounter,{childList:true,characterData:true,subtree:true});
    updateTicketCount();
    let activeSection = "games", priorSection = "games";

    function mark(section){
      activeSection = section;
      nav.querySelectorAll("button[data-cb-section]").forEach(btn=>{
        const on = btn.dataset.cbSection === section;
        btn.classList.toggle("is-active", on);
        if (on) btn.setAttribute("aria-current", "page");
        else btn.removeAttribute("aria-current");
      });
    }

    function closeSlip(restoreFocus=false){
      document.body.classList.remove("cb-modern-slip-open");
      scrim.hidden = true;
      toggle.setAttribute("aria-expanded", "false");
      if (activeSection === "ticket") mark(priorSection);
      if (restoreFocus && mobile() && publicActive()) buttonFor("ticket")?.focus({preventScroll:true});
    }

    function openSlip(){
      if (!mobile() || !publicActive()) return;
      slip.classList.remove("is-dismissed", "is-collapsed");
      document.getElementById("cbSlipReopen")?.classList.remove("is-visible");
      document.body.classList.add("cb-modern-slip-open");
      scrim.hidden = false;
      toggle.setAttribute("aria-expanded", "true");
      if (activeSection !== "ticket") priorSection = activeSection;
      mark("ticket");
      slip.scrollTop = 0;
      toggle.focus({preventScroll:true});
    }

    function showGames(mode){
      closeSlip();
      const target = filters.querySelector('[data-filter="' + mode + '"]');
      target?.click();
      const panel = document.getElementById("sportsapiPanel");
      if (panel) panel.scrollIntoView({behavior:scrollMode(),block:"start"});
      mark(mode === "live" ? "live" : "games");
    }

    nav.addEventListener("click", event=>{
      const btn = event.target.closest("button[data-cb-section]");
      if (!btn || !publicActive()) return;
      const action = btn.dataset.cbSection;
      if (action === "ticket"){openSlip();return;}
      if (action === "home"){
        closeSlip();
        window.scrollTo({top:0,behavior:scrollMode()});
        mark("home");
        return;
      }
      showGames(action === "live" ? "live" : "all");
    });

    // Captura somente no celular: no desktop segue o botão X já existente.
    toggle.addEventListener("click", event=>{
      if (!mobile() || !document.body.classList.contains("cb-modern-slip-open")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      closeSlip(true);
    }, true);

    scrim.addEventListener("click", ()=>closeSlip(true));
    document.addEventListener("keydown",event=>{
      if (event.key === "Escape" && document.body.classList.contains("cb-modern-slip-open")){
        event.preventDefault();
        closeSlip(true);
      }
    });
    filters.addEventListener("click",event=>{
      const option = event.target.closest("button[data-filter]");
      if (!option || !mobile()) return;
      if (option.dataset.filter === "live") mark("live");
      else if (activeSection !== "home") mark("games");
    });

    const closeOnModal = () => {
      if (!mobile() || !publicActive()) closeSlip();
    };
    for (const id of ["paymentModal","adminLogin","publicView","cbEntryGate"]){
      const el = document.getElementById(id);
      if (el) new MutationObserver(closeOnModal).observe(el,{attributes:true,attributeFilter:["class"]});
    }
    window.addEventListener("resize",()=>{
      if (!mobile()) closeSlip();
    },{passive:true});
    mark("games");
    document.body.classList.add("cb-modern-ready");

  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded",init,{once:true});
  else init();
})();
