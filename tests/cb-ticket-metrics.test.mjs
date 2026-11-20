import test from "node:test";
import assert from "node:assert/strict";
import {dayKey,summarizeDay,isCancelled,isConfirmed} from "../assets/cb-ticket-metrics.mjs";
const dt="2026-11-20T15:00:00.000Z"; // 12:00 de Maceió
const row=(amount,options={})=>({createdAt:{seconds:Date.parse(dt)/1000},amount,status:"pending",paymentStatus:"confirmed",...options});
test("dia local é calculado no fuso de Maceió",()=>{
  assert.equal(dayKey({seconds:Date.parse("2026-11-21T02:30:00.000Z")/1000}),"2026-11-20");
  assert.equal(dayKey({seconds:Date.parse("2026-11-21T03:30:00.000Z")/1000}),"2026-11-21");
});
test("total de bilhetes emitidos, valor bruto, cancelamentos e recebido",()=>{
  const items=[
    row(100),row(40,{paymentStatus:"pending_confirmation"}),
    row(50,{status:"cancelled",paymentStatus:"refund_pending"}),
    row(70,{createdAt:{seconds:Date.parse("2026-11-19T15:00:00.000Z")/1000}})
  ];
  const r=summarizeDay(items,"2026-11-20");
  assert.equal(r.issued,3);
  assert.equal(r.active,2);
  assert.equal(r.cancelled,1);
  assert.equal(r.confirmed,1);
  assert.equal(r.pending,1);
  assert.equal(r.gross,190);
  assert.equal(r.validGross,140);
  assert.equal(r.received,100);
  assert.equal(r.refundPending,50);
});
test("cancelamento prevalece mesmo com confirmação antiga",()=>{
  assert.equal(isCancelled(row(100,{status:"cancelled",paymentStatus:"confirmed"})),true);
  assert.equal(isConfirmed(row(100,{status:"cancelled",paymentStatus:"confirmed"})),false);
});
