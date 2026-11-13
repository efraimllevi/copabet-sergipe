"use strict";
const admin = require("firebase-admin");

const PROJECT_ID = "indexxx-94ed1";
const ADMIN_UID = "rjWeKGZpkMVrW8UynAKCwjZXklM2";

function reply(statusCode, message, extra = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({ success: statusCode >= 200 && statusCode < 300, message, ...extra }),
  };
}

function firebaseAdmin() {
  if (admin.apps.length) return admin;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (!raw || typeof raw !== "string") throw new Error("CONFIG_MISSING");
  let credentials;
  try {
    credentials = JSON.parse(raw.trim().replace(/^\uFEFF/, ""));
    if (typeof credentials === "string") credentials = JSON.parse(credentials);
  } catch (_) {
    throw new Error("CONFIG_INVALID_JSON");
  }
  if (!credentials || typeof credentials !== "object" || credentials.project_id !== PROJECT_ID) {
    throw new Error("CONFIG_PROJECT_MISMATCH");
  }
  if (typeof credentials.private_key !== "string" || typeof credentials.client_email !== "string") {
    throw new Error("CONFIG_FIELDS_MISSING");
  }
  const privateKey = credentials.private_key.replace(/\\n/g, "\n");
  if (!privateKey.startsWith("-----BEGIN PRIVATE KEY-----") ||
      !privateKey.trimEnd().endsWith("-----END PRIVATE KEY-----")) {
    throw new Error("CONFIG_KEY_INVALID");
  }
  admin.initializeApp({
    credential: admin.credential.cert({ ...credentials, private_key: privateKey }),
    projectId: PROJECT_ID,
  });
  return admin;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, "Método não permitido.");
  const authorization = event.headers?.authorization || event.headers?.Authorization || "";
  if (!/^Bearer\s+\S+$/i.test(authorization)) return reply(401, "Entre como administrador ou cambista.");

  let firebase;
  try {
    firebase = firebaseAdmin();
  } catch (error) {
    console.error("COPABET confirmação: credencial Firebase indisponível", error.message);
    return reply(503, "Configuração do Firebase indisponível para confirmar pagamentos.");
  }

  let session;
  try {
    session = await firebase.auth().verifyIdToken(authorization.replace(/^Bearer\s+/i, ""), true);
    if (session.firebase?.sign_in_provider === "anonymous") return reply(403, "Acesso não autorizado.");
    const account = await firebase.auth().getUser(session.uid);
    if (account.disabled) return reply(403, "Conta desativada.");
  } catch (error) {
    return reply(401, "Sessão inválida ou expirada. Entre novamente.");
  }

  let payload;
  try {
    if (!event.body || event.body.length > 2048) return reply(400, "Dados do bilhete inválidos.");
    const data = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    payload = JSON.parse(data);
  } catch (_) {
    return reply(400, "Dados do bilhete inválidos.");
  }
  const betId = typeof payload?.betId === "string" ? payload.betId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(betId)) return reply(400, "Identificador do bilhete inválido.");

  const uid = session.uid;
  const isAdmin = uid === ADMIN_UID;
  const database = firebase.firestore();
  const betRef = database.collection("bets").doc(betId);
  try {
    const outcome = await database.runTransaction(async (transaction) => {
      // Todas as leituras precedem a atualização, para evitar confirmação em duplicidade.
      const cambistaRef = isAdmin ? null : database.collection("cambistas").doc(uid);
      const cambistaSnap = cambistaRef ? await transaction.get(cambistaRef) : null;
      const betSnap = await transaction.get(betRef);

      if (!isAdmin &&
          (!cambistaSnap?.exists ||
           cambistaSnap.data().active !== true ||
           cambistaSnap.data().role !== "cambista")) {
        return { status: 403, message: "Cambista sem autorização para confirmar pagamentos." };
      }
      if (!betSnap.exists) return { status: 404, message: "Bilhete não encontrado." };
      const bet = betSnap.data();
      const isOwner = bet.uid === uid &&
                      bet.issuedByUid === uid &&
                      bet.cambistaIssued === true;
      if (!isAdmin && !isOwner) {
        return { status: 403, message: "O cambista só pode confirmar os próprios bilhetes." };
      }
      if (bet.paymentStatus === "confirmed") {
        return { status: 409, message: "O pagamento deste bilhete já foi confirmado." };
      }
      if (bet.status !== "pending" ||
          (bet.paymentStatus && bet.paymentStatus !== "pending_confirmation")) {
        return { status: 409, message: "Este bilhete não está aguardando confirmação de pagamento." };
      }

      // A aposta continua PENDENTE de resultado; apenas o pagamento é confirmado.
      transaction.update(betRef, {
        paymentStatus: "confirmed",
        paymentReviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
        paymentReviewedBy: uid,
        paymentReviewedByRole: isAdmin ? "admin" : "cambista",
      });
      return { status: 200, message: "Pagamento confirmado. Valor incluído no bruto e na comissão.", betId };
    });
    return reply(outcome.status, outcome.message, outcome.betId ? { betId: outcome.betId } : {});
  } catch (error) {
    console.error("Falha ao confirmar pagamento COPABET:", error.code || error.message);
    return reply(500, "Não foi possível confirmar o pagamento no Firebase.");
  }
};
