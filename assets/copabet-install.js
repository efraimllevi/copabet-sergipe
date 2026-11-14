/* Instalacao da COPABET no Android e iOS, sem alterar logins ou apostas. */
(() => {
  "use strict";

  if ("serviceWorker" in navigator && location.protocol === "https:") {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" })
        .catch(error => console.warn("COPABET: instalacao offline indisponivel", error));
    });
  }

  let pendingInstall = null;
  let installButton = null;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const mobile = ios || /Android/i.test(navigator.userAgent);
  const alreadyInstalled = () => window.matchMedia("(display-mode: standalone)").matches
    || navigator.standalone === true;

  function showInstallButton() {
    if (installButton && mobile && !alreadyInstalled()) installButton.hidden = false;
  }

  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    pendingInstall = event;
    showInstallButton();
  });

  window.addEventListener("appinstalled", () => {
    pendingInstall = null;
    if (installButton) installButton.hidden = true;
  });

  document.addEventListener("DOMContentLoaded", () => {
    if (!mobile || alreadyInstalled()) return;
    const header = document.querySelector(".header-content");
    if (!header) return;

    installButton = document.createElement("button");
    installButton.type = "button";
    installButton.textContent = "📲 INSTALAR COPABET";
    installButton.setAttribute("aria-label", "Instalar COPABET no celular");
    installButton.style.cssText =
      "background:#ffd400;color:#050505;border:0;border-radius:10px;" +
      "font:700 13px/1.2 Arial,sans-serif;padding:12px 15px;" +
      "min-height:44px;max-width:100%;cursor:pointer;white-space:normal;" +
      "box-shadow:0 3px 16px rgba(0,0,0,.3)";

    installButton.addEventListener("click", async () => {
      if (pendingInstall) {
        const prompt = pendingInstall;
        pendingInstall = null;
        try {
          await prompt.prompt();
          const choice = await prompt.userChoice;
          if (choice?.outcome === "accepted") installButton.hidden = true;
        } catch (error) {
          console.warn("COPABET: prompt de instalacao indisponivel", error);
        }
        return;
      }
      if (ios) {
        alert("Para instalar a COPABET: abra no Safari, toque em Compartilhar e escolha Adicionar à Tela de Início.");
      } else {
        alert("Para instalar a COPABET: abra o menu do navegador (⋮) e escolha Instalar aplicativo ou Adicionar à tela inicial.");
      }
    });

    header.appendChild(installButton);
  });
})();
