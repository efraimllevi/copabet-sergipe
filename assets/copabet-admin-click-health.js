/* COPABET — diagnóstico de cliques do ADM independente dos módulos Firebase.
 * Não acessa dados, não altera permissões e não intercepta ações financeiras. */
(function () {
 "use strict";
 const targets=[
  ["cbCambistaRefresh","cbCambistaListingStatus","A atualização de cambistas"],
  ["cbCambistaCsv","cbCambistaListingStatus","A exportação de cambistas"],
  ["cbRankingRefresh","cbRankingStatus","A classificação de cambistas"],
  ["cbCashRefresh","cbCashStatus","A atualização do fluxo de caixa"],
  ["cbCashCsv","cbCashStatus","A exportação do fluxo de caixa"],
  ["adminTicketRefresh","adminTicketStatus","A atualização de jogos para bilhetes"]
 ];
 function attach(){
  for(const [buttonId,statusId,label] of targets){
   const button=document.getElementById(buttonId);
   const status=document.getElementById(statusId);
   if(!button||!status)continue;
   button.addEventListener("click",()=>{
    const marker="Comando recebido. Iniciando "+label.toLowerCase()+"...";
    status.textContent=marker;
    window.setTimeout(()=>{
     // Se o módulo correto tratou o clique, ele já substituiu esta mensagem.
     if(status.textContent===marker){
      status.textContent=label+" não iniciou. O navegador não executou o módulo responsável. Verifique os erros de carregamento e a conexão com Firebase.";
     }
    },1500);
   },{capture:true});
  }
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",attach,{once:true});
 else attach();
})();