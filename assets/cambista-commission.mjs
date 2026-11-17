// COPABET — comissão sobre cada bilhete de cambista com pagamento confirmado.
// O número de jogos é a quantidade de seleções no bilhete; nunca o resultado esportivo.
export const COMMISSION_TIERS = Object.freeze([
  Object.freeze({key:"1", label:"1 jogo", min:1, max:1, rate:2.5, basisPoints:250}),
  Object.freeze({key:"2-3", label:"2 a 3 jogos", min:2, max:3, rate:5, basisPoints:500}),
  Object.freeze({key:"4-6", label:"4 a 6 jogos", min:4, max:6, rate:10, basisPoints:1000}),
  Object.freeze({key:"7+", label:"7 ou mais jogos", min:7, max:Infinity, rate:15, basisPoints:1500})
]);

const amountCents = amount => {
  const n = Number(amount);
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : 0;
};
const paid = bet => {
  const payment = String(bet.paymentStatus || "").toLowerCase();
  const status = String(bet.status || "").toLowerCase();
  return payment === "confirmed" ||
    (payment === "" && ["accepted", "won", "lost"].includes(status));
};
const rejected = bet =>
  ["rejected", "cancelled"].includes(String(bet.status || "").toLowerCase()) ||
  ["rejected", "cancelled", "refunded"].includes(String(bet.paymentStatus || "").toLowerCase());

export function commissionTierForGames(count) {
  return Number.isInteger(count) && count > 0
    ? COMMISSION_TIERS.find(tier => count >= tier.min && count <= tier.max) || null
    : null;
}

export function summarizeCambistaBets(rows) {
  const bets = (Array.isArray(rows) ? rows : []).filter(bet =>
    bet && (bet.cambistaIssued === true || String(bet.source || "").startsWith("cambista_")));
  const confirmed = bets.filter(paid);
  const pending = bets.filter(bet => !paid(bet) && !rejected(bet));
  const buckets = COMMISSION_TIERS.map(tier => ({
    key:tier.key, label:tier.label, rate:tier.rate,
    count:0, grossCents:0, commissionCents:0
  }));
  let grossCents = 0;
  let unclassified = 0;
  for (const bet of confirmed) {
    const cents = amountCents(bet.amount);
    grossCents += cents;
    const tier = commissionTierForGames(Array.isArray(bet.picks) ? bet.picks.length : 0);
    if (!tier) { unclassified++; continue; }
    const bucket = buckets.find(item => item.key === tier.key);
    bucket.count++;
    bucket.grossCents += cents;
    // Arredondar a comissão em centavos POR BILHETE, depois somar.
    bucket.commissionCents += Math.round(cents * tier.basisPoints / 10000);
  }
  const tiers = buckets.map(({grossCents, commissionCents, ...rest}) => ({
    ...rest, gross:grossCents / 100, commission:commissionCents / 100
  }));
  return {
    issued:bets.length, done:confirmed.length,
    gross:grossCents / 100,
    pending:pending.reduce((sum, bet) => sum + amountCents(bet.amount), 0) / 100,
    due:tiers.reduce((sum, tier) => sum + Math.round(tier.commission * 100), 0) / 100,
    tiers, unclassified
  };
}
