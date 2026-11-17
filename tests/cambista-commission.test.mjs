import test from "node:test";
import assert from "node:assert/strict";
import {COMMISSION_TIERS, commissionTierForGames, summarizeCambistaBets} from "../assets/cambista-commission.mjs";

const ticket = (games, amount=100, overrides={}) => ({
  cambistaIssued:true, issuedByUid:"cambista-a", amount,
  picks:Array.from({length:games}, (_, i)=>({id:String(i)})),
  status:"pending", paymentStatus:"confirmed", ...overrides
});

test("quatro faixas e seus limites", () => {
  const cases=[[1,2.5],[2,5],[3,5],[4,10],[6,10],[7,15],[14,15]];
  for(const [games,rate] of cases){
    assert.equal(commissionTierForGames(games).rate,rate);
    assert.equal(summarizeCambistaBets([ticket(games)]).due,rate);
  }
  assert.equal(commissionTierForGames(0),null);
  assert.equal(COMMISSION_TIERS.length,4);
});

test("soma comissões individuais por bilhete e permite perdas esportivas", () => {
  const result=summarizeCambistaBets([
    ticket(1,100),ticket(3,200),ticket(5,300),
    ticket(7,400,{status:"lost"}),ticket(2,100,{status:"won"})
  ]);
  assert.equal(result.issued,5);
  assert.equal(result.done,5);
  assert.equal(result.gross,1100);
  assert.equal(result.due,107.5);
  assert.deepEqual(result.tiers.map(t=>t.commission),[2.5,15,30,60]);
});

test("não comissiona valor sem confirmação nem bilhete administrativo", () => {
  const result=summarizeCambistaBets([
    ticket(7,100,{paymentStatus:"pending_confirmation"}),
    ticket(7,100,{paymentStatus:"rejected"}),
    ticket(7,100,{paymentStatus:"refunded"}),
    ticket(7,100,{cambistaIssued:false,source:"admin_print"}),
    ticket(1,100,{paymentStatus:"confirmed"})
  ]);
  assert.equal(result.done,1);
  assert.equal(result.due,2.5);
  assert.equal(result.pending,100);
});

test("conserva bilhetes legados pagos e arredonda por bilhete", () => {
  const result=summarizeCambistaBets([
    ticket(1,0.2), ticket(1,0.2), // 0,005 -> R$ 0,01 cada
    ticket(2,20,{paymentStatus:"",status:"accepted"})
  ]);
  assert.equal(result.due,1.02);
  assert.equal(result.gross,20.4);
});

test("bilhete confirmado sem seleções entra no bruto, sem inventar percentual", () => {
  const result=summarizeCambistaBets([ticket(0,75)]);
  assert.equal(result.gross,75);
  assert.equal(result.due,0);
  assert.equal(result.unclassified,1);
});
