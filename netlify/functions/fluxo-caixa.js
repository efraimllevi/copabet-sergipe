"use strict";
const admin = require("firebase-admin");

const PROJECT_ID = "indexxx-94ed1";
const ADMIN_UID = "rjWeKGZpkMVrW8UynAKCwjZXklM2";
const COLLECTION = "fluxoCaixa";
function reply(statusCode, message, data) {
 return {statusCode, headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},body:JSON.stringify({success:statusCode>=200&&statusCode<300,message,...(data||{})})};
}
function firebase() {
 if(admin.apps.length)return admin;
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(typeof raw!=="string"||!raw.trim())throw Error("CONFIG_MISSING");
 let cert;
 try {
  cert=JSON.parse(raw.trim().replace(/^\uFEFF/,""));
  if(typeof cert==="string")cert=JSON.parse(cert);
 }catch(_){throw Error("CONFIG_INVALID_JSON")}
 if(!cert||cert.project_id!==PROJECT_ID||typeof cert.private_key!=="string"||typeof cert.client_email!=="string")throw Error("CONFIG_INVALID");
 const key=cert.private_key.replace(/\\n/g,"\n");
 if(!key.startsWith("-----BEGIN PRIVATE KEY-----")||!key.trimEnd().endsWith("-----END PRIVATE KEY-----"))throw Error("CONFIG_INVALID");
 admin.initializeApp({credential:admin.credential.cert({...cert,private_key:key}),projectId:PROJECT_ID});
 return admin;
}
const validDay=s=>typeof s==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s+"T12:00:00Z"))&&new Date(s+"T12:00:00Z").toISOString().slice(0,10)===s;
const clean=(s,max)=>typeof s==="string"?s.trim().slice(0,max):"";

exports.handler=async(event)=>{
 if(event.httpMethod!=="POST")return reply(405,"Método não permitido.");
 const header=event.headers?.authorization||event.headers?.Authorization||"";
 if(!/^Bearer\s+\S+$/i.test(header))return reply(401,"Entre como administrador.");
 let firebaseAdmin;
 try{firebaseAdmin=firebase()}catch(e){console.error("COPABET caixa: Firebase indisponível",e.message);return reply(503,"Credencial do Firebase indisponível na Netlify.");}
 let token;
 try{
  token=await firebaseAdmin.auth().verifyIdToken(header.replace(/^Bearer\s+/i,""),true);
  if(token.uid!==ADMIN_UID||token.firebase?.sign_in_provider==="anonymous")return reply(403,"Somente o administrador pode acessar o fluxo de caixa.");
  const u=await firebaseAdmin.auth().getUser(token.uid);
  if(u.disabled)return reply(403,"Conta administrativa desativada.");
 }catch(_){return reply(401,"Sessão inválida. Faça login novamente.");}
 let body;
 try{
  if(!event.body||event.body.length>6000)return reply(400,"Requisição inválida.");
  const raw=event.isBase64Encoded?Buffer.from(event.body,"base64").toString("utf8"):event.body;
  body=JSON.parse(raw);
 }catch(_){return reply(400,"Dados inválidos.");}
 const db=firebaseAdmin.firestore();
 if(body?.action==="list"){
  try{
   const ledger=db.collection(COLLECTION);
   // Agregações no Firestore: o caixa total considera TODO o histórico,
   // inclusive lançamentos fora do período ou das 1.500 linhas exibidas.
   const summaryQuery=type=>ledger.where("type","==",type).aggregate({
    totalCents:firebaseAdmin.firestore.AggregateField.sum("amountCents"),
    recordsCount:firebaseAdmin.firestore.AggregateField.count()
   }).get();
   const [snap,incomingSnap,outgoingSnap]=await Promise.all([
    ledger.orderBy("date","desc").limit(1501).get(),
    summaryQuery("entrada"),summaryQuery("saida")
   ]);
   const records=snap.docs.slice(0,1500).map(d=>{
    const v=d.data();
    return{id:d.id,type:v.type,amountCents:v.amountCents,date:v.date,category:v.category,description:v.description,method:v.method,reference:v.reference||"",createdBy:v.createdBy,createdAt:v.createdAt?.toDate?.()?.toISOString?.()||null};
   });
   const inData=incomingSnap.data(),outData=outgoingSnap.data();
   const incoming=Math.round(Number(inData.totalCents)||0);
   const outgoing=Math.round(Number(outData.totalCents)||0);
   const lifetime={
    incoming,outgoing,balance:incoming-outgoing,
    count:Number(inData.recordsCount||0)+Number(outData.recordsCount||0)
   };
   return reply(200,"Lançamentos consultados.",{records,limited:snap.size>1500,lifetime});
  }catch(e){console.error("COPABET caixa leitura:",e.code||e.message);return reply(500,"Não foi possível consultar os lançamentos.");}
 }
 if(body?.action==="create"){
  const v=body.record||{};
  const type=v.type,date=v.date,category=clean(v.category,45),description=clean(v.description,160),method=clean(v.method,30),reference=clean(v.reference,100);
  const amount=Number(v.amount);
  const cents=Math.round(amount*100);
  const knownCategories=["Vendas","Repasse de cambista","Capital inicial","Outras entradas","Pagamento de prêmio","Comissão","Fornecedor","Despesas operacionais","Taxas","Outras saídas"];
  const knownMethods=["Dinheiro","PIX","Transferência","Cartão","Outro"];
  if(!["entrada","saida"].includes(type)||!validDay(date)||!knownCategories.includes(category)||!knownMethods.includes(method)||
     typeof v.description!=="string"||!description||description.length>160||
     !Number.isFinite(amount)||amount<=0||!Number.isSafeInteger(cents)||cents<=0||cents>999999999999){
    return reply(400,"Informe tipo, valor positivo, categoria, descrição, data e forma de pagamento válidos.");
  }
  // Evita lançamento duplicado causado por repetição automática de um POST.
  const requestId=clean(body.requestId,80);
  if(!/^[0-9a-zA-Z_-]{12,80}$/.test(requestId))return reply(400,"Identificador de lançamento inválido.");
  const ref=db.collection(COLLECTION).doc("manual_"+token.uid+"_"+requestId);
  try{
   const outcome=await db.runTransaction(async tx=>{
    const previous=await tx.get(ref);
    if(previous.exists)return{duplicated:true,id:ref.id};
    tx.create(ref,{type,amountCents:cents,date,category,description,method,reference,origin:"manual",createdBy:token.uid,createdAt:firebaseAdmin.firestore.FieldValue.serverTimestamp()});
    return{duplicated:false,id:ref.id};
   });
   return reply(200,outcome.duplicated?"Lançamento já registrado.":"Lançamento registrado com sucesso.",{id:outcome.id,duplicated:outcome.duplicated});
  }catch(e){console.error("COPABET caixa lançamento:",e.code||e.message);return reply(500,"Não foi possível salvar o lançamento.");}
 }
 return reply(400,"Operação não reconhecida.");
};
