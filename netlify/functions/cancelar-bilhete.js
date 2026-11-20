"use strict";
// Cancelamento auditável: somente ADM ou cambista emissor; Firestore Admin SDK.
const admin = require("firebase-admin");
const PROJECT_ID = "indexxx-94ed1";
const ADMIN_UID = "rjWeKGZpkMVrW8UynAKCwjZXklM2";
function reply(statusCode, message, extra={}) {
  return {statusCode,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},
    body:JSON.stringify({success:statusCode>=200&&statusCode<300,message,...extra})};
}
function firebaseAdmin() {
  if(admin.apps.length)return admin;
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw)throw Error("CONFIG_MISSING");
  let credentials=JSON.parse(String(raw).trim().replace(/^\uFEFF/,""));
  if(typeof credentials==="string")credentials=JSON.parse(credentials);
  if(credentials?.project_id!==PROJECT_ID || !credentials.private_key || !credentials.client_email)throw Error("CONFIG_INVALID");
  admin.initializeApp({credential:admin.credential.cert({...credentials,private_key:credentials.private_key.replace(/\\n/g,"\n")}),projectId:PROJECT_ID});
  return admin;
}
function startMs(input){
  if(input==null || input==="")return NaN;
  if(typeof input==="number")return input<100000000000?input*1000:input;
  if(typeof input==="string" && /^\d+$/.test(input))return startMs(Number(input));
  if(typeof input==="string")return Date.parse(input);
  if(typeof input?.toMillis==="function")return input.toMillis();
  return NaN;
}
exports.handler=async(event)=>{
  if(event.httpMethod!=="POST")return reply(405,"Método não permitido.");
  const authorization=event.headers?.authorization || event.headers?.Authorization || "";
  if(!/^Bearer\s+\S+$/i.test(authorization))return reply(401,"É necessário entrar na conta.");
  let firebase;
  try{firebase=firebaseAdmin();}catch(error){console.error("COPABET cancelamento: configuração inválida",error.message);return reply(503,"Serviço de cancelamento indisponível.");}
  let session;
  try{
    session=await firebase.auth().verifyIdToken(authorization.replace(/^Bearer\s+/i,""),true);
    if(session.firebase?.sign_in_provider==="anonymous")return reply(403,"Acesso não autorizado.");
    const user=await firebase.auth().getUser(session.uid);
    if(user.disabled)return reply(403,"Conta desativada.");
  }catch(_){return reply(401,"Sessão inválida ou expirada.");}
  let payload;
  try{
    if(!event.body || event.body.length>4096)return reply(400,"Dados inválidos.");
    payload=JSON.parse(event.isBase64Encoded?Buffer.from(event.body,"base64").toString("utf8"):event.body);
  }catch(_){return reply(400,"Dados inválidos.");}
  const betId=typeof payload?.betId==="string"?payload.betId.trim():"";
  const reason=typeof payload?.reason==="string"?payload.reason.trim():"";
  if(!/^[a-zA-Z0-9_-]{1,128}$/.test(betId))return reply(400,"Identificador do bilhete inválido.");
  if(reason.length<5 || reason.length>200)return reply(400,"Informe um motivo entre 5 e 200 caracteres.");
  const uid=session.uid,isAdmin=uid===ADMIN_UID,db=firebase.firestore(),betRef=db.collection("bets").doc(betId);
  try{
    const result=await db.runTransaction(async tx=>{
      // Todas as leituras são feitas antes de qualquer escrita.
      const agentRef=isAdmin?null:db.collection("cambistas").doc(uid);
      const agent=agentRef?await tx.get(agentRef):null;
      const betSnap=await tx.get(betRef);
      if(!isAdmin && (!agent?.exists || agent.data().active!==true || agent.data().role!=="cambista"))
        return {status:403,message:"Conta de cambista sem permissão para cancelar."};
      if(!betSnap.exists)return {status:404,message:"Bilhete não encontrado."};
      const bet=betSnap.data();
      if(!isAdmin && !(bet.cambistaIssued===true && bet.issuedByUid===uid && bet.uid===uid))
        return {status:403,message:"Você só pode cancelar bilhetes emitidos pela sua conta."};
      if(["cancelled","canceled"].includes(String(bet.status||"").toLowerCase()))
        return {status:409,message:"Este bilhete já foi cancelado."};
      if(bet.status!=="pending")
        return {status:409,message:"Bilhete encerrado ou apurado não pode ser cancelado."};
      const picks=Array.isArray(bet.picks)?bet.picks:[];
      const starts=picks.map(p=>startMs(p?.startTime));
      if(!starts.length || starts.some(s=>!Number.isFinite(s) || s<=Date.now()))
        return {status:409,message:"Cancelamento indisponível: jogo iniciado ou horário não verificável. Procure o administrador."};
      const payment=String(bet.paymentStatus||"").toLowerCase();
      if(!["pending_confirmation","pending","confirmed",""].includes(payment))
        return {status:409,message:"Situação financeira deste bilhete não permite cancelamento."};
      const received=payment==="confirmed";
      tx.update(betRef,{
        status:"cancelled",paymentStatus:received?"refund_pending":"cancelled",
        refundStatus:received?"pending":"not_required",
        cancelledAt:firebase.firestore.FieldValue.serverTimestamp(),
        cancelledByUid:uid,cancelledByRole:isAdmin?"admin":"cambista",
        cancellationReason:reason,
        cancellationOriginalPaymentStatus:bet.paymentStatus||"pending_confirmation"
      });
      return {status:200,message:received
        ?"Bilhete cancelado e comissão retirada. Pagamento recebido: reembolso pendente de processamento."
        :"Bilhete cancelado. Ele não conta nas vendas válidas nem na comissão.",betId,refundPending:received};
    });
    return reply(result.status,result.message,{betId:result.betId||null,refundPending:!!result.refundPending});
  }catch(error){console.error("COPABET cancelamento falhou",error.code||error.message);return reply(500,"Não foi possível cancelar o bilhete no Firebase.");}
};
