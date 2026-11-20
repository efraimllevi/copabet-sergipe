/* COPABET — histórico diário e cancelamento auditável para ADM e cambistas. */
import {getApps,getApp} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {getAuth,onAuthStateChanged} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import {getFirestore,collection,getDocs,query,where} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import {summarizeDay,dayKey,isCancelled,isConfirmed,asDate} from "/assets/cb-ticket-metrics.mjs?v=1";
const ADMIN_UID="rjWeKGZpkMVrW8UynAKCwjZXklM2",ZONE="America/Maceio";
const app=getApps().length?getApp():null,auth=app?getAuth(app):null,db=app?getFirestore(app):null;
const $=id=>document.getElementById(id);
const money=n=>new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL"}).format(Number(n)||0);
const authRole=()=>{
  const user=auth?.currentUser;
  if(!user||user.isAnonymous)return "";
  if(user.uid===ADMIN_UID && !$("adminView")?.classList.contains("hidden"))return "admin";
  if(window.copabetCambistaSession?.uid===user.uid &&
    !$("cambistaView")?.classList.contains("hidden"))return "cambista";
  return "";
};
const el=(tag,cls,text)=>{
  const node=document.createElement(tag);
  if(cls)node.className=cls;
  if(text!=null)node.textContent=String(text);
  return node;
};
const append=(parent,tag,cls,text)=>{
  const node=el(tag,cls,text);parent.append(node);return node;
};
function style(){
  if($("cbDailyCss"))return;
  const s=el("style");s.id="cbDailyCss";
  s.textContent=`
    .cb-daily-wrap{margin:18px 0;padding:18px;border:1px solid #343434;border-radius:14px;background:#101115;color:#f8f8f8}
    .cb-daily-title{margin:0 0 6px;font-size:20px}
    .cb-daily-filters{display:flex;flex-wrap:wrap;align-items:end;gap:10px;margin:12px 0}
    .cb-daily-filters label{display:flex;flex-direction:column;gap:5px;font-size:13px}
    .cb-daily-filters input{min-height:40px;color:#fff;background:#17191d;border:1px solid #555;border-radius:7px;padding:7px}
    .cb-daily-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px;margin:12px 0}
    .cb-daily-stat{background:#1d1e23;border:1px solid #383a40;padding:12px;border-radius:10px;display:flex;flex-direction:column;gap:6px}
    .cb-daily-stat small{font-size:12px;color:#b6b6b6}
    .cb-daily-stat strong{font-size:18px;font-variant-numeric:tabular-nums}
    .cb-daily-scroller{overflow-x:auto}
    .cb-daily-table{width:100%;min-width:700px;border-collapse:collapse;font-size:13px}
    .cb-daily-table th,.cb-daily-table td{padding:9px;border-bottom:1px solid #383a40;text-align:left;vertical-align:top}
    .cb-daily-table th{color:#ffd400}
    .cb-daily-cancel{border:1px solid #e7a45b;color:#fff;background:#79351d;border-radius:7px;padding:9px;cursor:pointer}
    .cb-daily-cancel:disabled{opacity:.6;cursor:not-allowed}
    .cb-daily-note{font-size:12px;color:#b7b7b7}
    @media(max-width:699px){.cb-daily-wrap{padding:12px}.cb-daily-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.cb-daily-title{font-size:18px}}
  `;
  document.head.append(s);
}
function createPanel(role){
  const host=role==="admin"?$("adminView")?.querySelector(".card"):$("cbCambistaPersonalReport");
  if(!host)return null;
  const wrap=append(host,"section","cb-daily-wrap");
  wrap.id=role==="admin"?"cbDailyAdmin":"cbDailyCambista";
  const title=append(wrap,"h3","cb-daily-title",role==="admin"?"Resumo diário de bilhetes":"Meus bilhetes do dia");
  title.tabIndex=-1;
  append(wrap,"p","cb-daily-note","O valor emitido registra a criação do bilhete. O confirmado considera apenas pagamentos confirmados de bilhetes não cancelados.");
  const filters=append(wrap,"div","cb-daily-filters");
  const label=append(filters,"label",null,"Data de emissão");
  const input=append(label,"input");input.type="date";input.value=dayKey(new Date(),ZONE);
  const refresh=append(filters,"button","secondary","ATUALIZAR");refresh.type="button";
  const stats=append(wrap,"div","cb-daily-stats");
  const status=append(wrap,"p","cb-daily-note","Escolha a data para consultar bilhetes.");status.setAttribute("role","status");
  const scroller=append(wrap,"div","cb-daily-scroller");
  const table=append(scroller,"table","cb-daily-table");
  const thead=append(table,"thead"),head=append(thead,"tr");
  for(const name of ["Bilhete / horário","Emissor / cliente","Jogos","Valor","Pagamento / situação","Ação"])append(head,"th",null,name);
  const tbody=append(table,"tbody");
  return {wrap,title,input,refresh,stats,status,tbody,role,requestId:0};
}
function tile(host,label,value){
  const card=append(host,"div","cb-daily-stat");
  append(card,"small",null,label);
  append(card,"strong",null,value);
}
function describe(bet){
  if(isCancelled(bet)){
    if(bet.paymentStatus==="refund_pending")return "Cancelado · reembolso pendente";
    return "Cancelado";
  }
  if(isConfirmed(bet))return "Pagamento confirmado";
  return "Pagamento pendente";
}
function formatDate(stamp){
  const date=asDate(stamp);
  return date&&Number.isFinite(date.valueOf())
    ?date.toLocaleString("pt-BR",{timeZone:ZONE,day:"2-digit",month:"2-digit",hour:"2-digit",minute:"2-digit"})
    :"Sem data";
}
function canOfferCancellation(bet){
  return String(bet.status||"").toLowerCase()==="pending" && !isCancelled(bet);
}
async function cancelTicket(panel,bet,button){
  const role=authRole();
  if(!role||role!==panel.role)return;
  const ok=confirm("Cancelar o bilhete "+bet.id+"? A comissão será retirada, e o histórico será mantido. Pagamentos já recebidos exigem reembolso separado.");
  if(!ok)return;
  const reason=prompt("Informe o motivo do cancelamento (mínimo de 5 caracteres):","Cliente desistiu da aposta");
  if(reason==null)return;
  if(reason.trim().length<5||reason.trim().length>200){alert("Informe um motivo entre 5 e 200 caracteres.");return;}
  const user=auth.currentUser,uid=user.uid;
  button.disabled=true;button.textContent="CANCELANDO...";
  try{
    const token=await user.getIdToken(true);
    const response=await fetch("/.netlify/functions/cancelar-bilhete",{
      method:"POST",cache:"no-store",
      headers:{"Content-Type":"application/json","Authorization":"Bearer "+token},
      body:JSON.stringify({betId:bet.id,reason:reason.trim()})
    });
    const data=await response.json().catch(()=>null);
    if(!response.ok||!data?.success)throw Error(data?.message||"Servidor indisponível (HTTP "+response.status+").");
    if(auth?.currentUser?.uid!==uid)return;
    window.dispatchEvent(new Event("copabet:ticket-cancelled"));
    window.dispatchEvent(new Event("copabet:payment-confirmed"));
    alert(data.message);
    await load(panel);
  }catch(error){alert("Não foi possível cancelar: "+String(error?.message||error));}
  finally{button.disabled=false;button.textContent="CANCELAR";}
}
async function load(panel){
  const role=authRole();
  if(role!==panel.role)return;
  const user=auth.currentUser,uid=user.uid,requestId=++panel.requestId;
  panel.refresh.disabled=true;panel.status.textContent="Consultando bilhetes do Firestore...";
  panel.stats.replaceChildren();panel.tbody.replaceChildren();
  try{
    const ref=collection(db,"bets");
    const docs=await getDocs(role==="admin"?ref:query(ref,where("uid","==",uid)));
    if(requestId!==panel.requestId || authRole()!==role || auth.currentUser?.uid!==uid)return;
    const all=docs.docs.map(d=>({id:d.id,...d.data()}));
    const allowed=role==="admin"?all:all.filter(b=>b.cambistaIssued===true&&b.issuedByUid===uid&&b.uid===uid);
    const report=summarizeDay(allowed,panel.input.value,ZONE);
    tile(panel.stats,"Bilhetes gerados",report.issued);
    tile(panel.stats,"Bilhetes válidos",report.active);
    tile(panel.stats,"Bilhetes cancelados",report.cancelled);
    tile(panel.stats,"Bruto emitido",money(report.gross));
    tile(panel.stats,"Bruto válido",money(report.validGross));
    tile(panel.stats,"Bilhetes pagos",report.confirmed);
    tile(panel.stats,"Pagamento confirmado",money(report.received));
    tile(panel.stats,"Comissões geradas",money(report.commission));
    tile(panel.stats,"Aguardando confirmação",report.pending);
    if(report.refundPending>0)tile(panel.stats,"Reembolso pendente",money(report.refundPending));
    const items=report.tickets.slice().sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
    panel.status.textContent=items.length+" bilhete(s) emitido(s) em "+panel.input.value.split("-").reverse().join("/")+
      ". Cancelamentos não são apagados. Consulte a data desejada.";
    if(items.length===0){
      const tr=append(panel.tbody,"tr");const td=append(tr,"td",null,"Nenhum bilhete encontrado nesta data.");
      td.colSpan=6;return;
    }
    for(const bet of items.slice(0,300)){
      const tr=append(panel.tbody,"tr");
      append(tr,"td",null,bet.id+" · "+formatDate(bet.createdAt));
      append(tr,"td",null,String(bet.issuedByName||bet.issuedByUid||"Site")+" / "+String(bet.bettorName||"Cliente"));
      append(tr,"td",null,Array.isArray(bet.picks)?bet.picks.length:"—");
      append(tr,"td",null,money(bet.amount));
      append(tr,"td",null,describe(bet));
      const action=append(tr,"td");
      if(canOfferCancellation(bet)){
        const btn=append(action,"button","cb-daily-cancel","CANCELAR");
        btn.type="button";btn.addEventListener("click",()=>cancelTicket(panel,bet,btn));
      }else append(action,"span","cb-daily-note","Indisponível");
    }
    if(items.length>300)panel.status.textContent+=" Exibindo os 300 mais recentes; indicadores consideram todos os bilhetes da data.";
  }catch(error){panel.status.textContent="Falha ao consultar bilhetes: "+String(error?.code||error?.message||error);}
  finally{panel.refresh.disabled=false;}
}
function initialize(){
  if(!auth||!db||!$("adminView")||!$("cambistaView"))return;
  style();
  const adminPanel=createPanel("admin"),agentPanel=createPanel("cambista");
  const tabbar=$("adminView").querySelector(".admin-tabbar");
  if(!tabbar||!adminPanel||!agentPanel)return;
  // Área administrativa é uma aba, preservando a navegação atual.
  adminPanel.wrap.classList.add("admin-pane","hidden");
  const tab=append(tabbar,"button","admin-tab","Resumo diário");
  tab.type="button";tab.dataset.adminTab=adminPanel.wrap.id;
  tab.setAttribute("aria-controls",adminPanel.wrap.id);
  tab.setAttribute("aria-pressed","false");
  tab.addEventListener("click",()=>{
    if(authRole()!=="admin")return;
    tabbar.querySelectorAll("[data-admin-tab]").forEach(b=>{
      const selected=b===tab;b.classList.toggle("active",selected);b.setAttribute("aria-pressed",String(selected));
    });
    $("adminView").querySelectorAll(".admin-pane").forEach(p=>p.classList.toggle("hidden",p!==adminPanel.wrap));
    load(adminPanel);
  });
  adminPanel.refresh.addEventListener("click",()=>load(adminPanel));
  agentPanel.refresh.addEventListener("click",()=>load(agentPanel));
  adminPanel.input.addEventListener("change",()=>load(adminPanel));
  agentPanel.input.addEventListener("change",()=>load(agentPanel));
  // Atualizar somente o painel visível/selecionado ao receber eventos.
  const update=()=>{
    if(authRole()==="cambista")load(agentPanel);
    if(authRole()==="admin"&&!adminPanel.wrap.classList.contains("hidden"))load(adminPanel);
  };
  window.addEventListener("copabet:cambista-opened",update);
  window.addEventListener("copabet:ticket-issued",update);
  window.addEventListener("copabet:ticket-cancelled",update);
  window.addEventListener("copabet:payment-confirmed",update);
  onAuthStateChanged(auth,user=>{
    if(!user){adminPanel.stats.replaceChildren();adminPanel.tbody.replaceChildren();agentPanel.stats.replaceChildren();agentPanel.tbody.replaceChildren();}
  });
  const agentView=$("cambistaView");
  new MutationObserver(()=>{
    if(authRole()==="cambista"&&!agentView.classList.contains("hidden"))load(agentPanel);
  }).observe(agentView,{attributes:true,attributeFilter:["class"]});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",initialize,{once:true});
else initialize();
