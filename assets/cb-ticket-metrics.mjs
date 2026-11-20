// Métricas diárias por data de emissão. Não confundir bilhetes gerados com dinheiro recebido.
export const CANCELLED_STATUSES = Object.freeze(["cancelled","canceled","rejected"]);
const cents=x=>Number.isFinite(Number(x))&&Number(x)>0?Math.round(Number(x)*100):0;
export const isCancelled=bet=>CANCELLED_STATUSES.includes(String(bet?.status||"").toLowerCase()) ||
  ["cancelled","canceled","refunded","refund_pending","rejected"].includes(String(bet?.paymentStatus||"").toLowerCase());
export const isConfirmed=bet=>!isCancelled(bet) && (
  String(bet?.paymentStatus||"").toLowerCase()==="confirmed" ||
  (!bet?.paymentStatus && ["accepted","won","lost"].includes(String(bet?.status||"").toLowerCase())));
export function asDate(stamp){
  if(stamp instanceof Date)return stamp;
  if(typeof stamp?.toDate==="function")return stamp.toDate();
  if(typeof stamp?.seconds==="number")return new Date(stamp.seconds*1000);
  if(typeof stamp==="string")return new Date(stamp);
  return null;
}
export function dayKey(stamp,timeZone="America/Maceio"){
  const d=asDate(stamp);
  if(!d || !Number.isFinite(d.valueOf()))return "";
  const parts=new Intl.DateTimeFormat("en-US",{timeZone,year:"numeric",month:"2-digit",day:"2-digit"}).formatToParts(d);
  const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
  return p.year+"-"+p.month+"-"+p.day;
}
export function summarizeDay(rows,date,timeZone="America/Maceio"){
  const tickets=(Array.isArray(rows)?rows:[]).filter(b=>dayKey(b.createdAt,timeZone)===date);
  let gross=0,validGross=0,received=0,cancelledGross=0,refundPending=0;
  let active=0,confirmed=0,cancelled=0,pending=0;
  for(const bet of tickets){
    const amount=cents(bet.amount);gross+=amount;
    if(isCancelled(bet)){
      cancelled++;cancelledGross+=amount;
      if(bet.paymentStatus==="refund_pending")refundPending+=amount;
    } else{
      active++;validGross+=amount;
      if(isConfirmed(bet)){confirmed++;received+=amount;} else pending++;
    }
  }
  const inReais=x=>x/100;
  return {issued:tickets.length,active,confirmed,pending,cancelled,
    gross:inReais(gross),validGross:inReais(validGross),received:inReais(received),
    cancelledGross:inReais(cancelledGross),refundPending:inReais(refundPending),
    tickets};
}
