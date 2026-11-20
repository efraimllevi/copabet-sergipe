"use strict";
const admin = require("firebase-admin");
const PROJECT_ID = "indexxx-94ed1";
const ADMIN_UID = "rjWeKGZpkMVrW8UynAKCwjZXklM2";

function reply(statusCode, message, data = {}) {
 return {statusCode,headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store"},body:JSON.stringify({success:statusCode>=200&&statusCode<300,message,...data})};
}
function firebase() {
 if(admin.apps.length) return admin;
 const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
 if(!raw || typeof raw!=="string") throw Error("CONFIG_MISSING");
 let cert;
 try {cert=JSON.parse(raw.trim().replace(/^\uFEFF/,""));if(typeof cert==="string")cert=JSON.parse(cert);}
 catch (_) {throw Error("CONFIG_INVALID_JSON");}
 if(!cert || cert.project_id!==PROJECT_ID || typeof cert.client_email!=="string" || typeof cert.private_key!=="string")throw Error("CONFIG_INVALID");
 const key=cert.private_key.replace(/\\n/g,"\n");
 if(!key.startsWith("-----BEGIN PRIVATE KEY-----")||!key.trimEnd().endsWith("-----END PRIVATE KEY-----"))throw Error("CONFIG_INVALID");
 admin.initializeApp({credential:admin.credential.cert({...cert,private_key:key}),projectId:PROJECT_ID});
 return admin;
}
exports.handler=async event=>{
 if(event.httpMethod!=="POST")return reply(405,"Método não permitido.");
 const header=event.headers?.authorization||event.headers?.Authorization||"";
 if(!/^Bearer\s+\S+$/i.test(header))return reply(401,"Sessão administrativa necessária.");
 let sdk;
 try{sdk=firebase();}
 catch(error){console.error("Consulta cambistas: configuração Firebase:",error.message);return reply(503,"A credencial Firebase da Netlify está indisponível.");}
 try{
  const token=await sdk.auth().verifyIdToken(header.replace(/^Bearer\s+/i,""),true);
  if(token.uid!==ADMIN_UID||token.firebase?.sign_in_provider==="anonymous")return reply(403,"Acesso reservado ao administrador.");
  const user=await sdk.auth().getUser(token.uid);
  if(user.disabled)return reply(403,"Conta administrativa desativada.");
 }catch(error){console.error("Consulta cambistas: autenticação:",error.code||"invalid");return reply(401,"Sessão administrativa inválida ou expirada.");}
 try{
  const docs=await sdk.firestore().collection("cambistas").get();
  const cambistas=docs.docs.map(d=>{
   const x=d.data()||{};
   return {uid:d.id,name:String(x.name||x.nome||"Sem nome"),email:String(x.email||"").toLowerCase(),active:x.active===true};
  });
  return reply(200,"Cambistas consultados.",{cambistas});
 }catch(error){
  console.error("Consulta cambistas: falha de leitura:",error.code||error.message);
  return reply(500,"O servidor não conseguiu consultar os cambistas no Firestore.");
 }
};
