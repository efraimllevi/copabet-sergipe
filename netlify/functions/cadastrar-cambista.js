"use strict";
const admin = require("firebase-admin");

// O servidor valida o token emitido pelo Firebase. Nunca confie em um "role"
// enviado no formulário. Este UID corresponde ao administrador do COPABET.
const PROJECT_ID = "indexxx-94ed1";
const ADMIN_UID = "rjWeKGZpkMVrW8UynAKCwjZXklM2";

function reply(statusCode, message, extra = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
    body: JSON.stringify({
      success: statusCode >= 200 && statusCode < 300,
      message,
      ...extra,
    }),
  };
}

function configError(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

function getFirebaseAdmin() {
  if (admin.apps.length) return admin;

  // Somente o servidor pode ler a variável; nunca registrar o valor.
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (typeof raw !== "string" || !raw.trim()) {
    throw configError("CONFIG_MISSING");
  }
  let credentials;
  try {
    credentials = JSON.parse(raw.trim().replace(/^\uFEFF/, ""));
    if (typeof credentials === "string") credentials = JSON.parse(credentials);
  } catch (_) {
    throw configError("CONFIG_INVALID_JSON");
  }
  if (!credentials || typeof credentials !== "object" || Array.isArray(credentials)) {
    throw configError("CONFIG_INVALID_JSON");
  }
  if (credentials.project_id !== PROJECT_ID) {
    throw configError("CONFIG_PROJECT_MISMATCH");
  }
  if (
    typeof credentials.client_email !== "string" ||
    !credentials.client_email.trim() ||
    typeof credentials.private_key !== "string"
  ) {
    throw configError("CONFIG_FIELDS_MISSING");
  }
  const privateKey = credentials.private_key.replace(/\\n/g, "\n");
  if (
    !privateKey.startsWith("-----BEGIN PRIVATE KEY-----") ||
    !privateKey.trimEnd().endsWith("-----END PRIVATE KEY-----")
  ) {
    throw configError("CONFIG_KEY_INVALID");
  }
  try {
    admin.initializeApp({
      credential: admin.credential.cert({ ...credentials, private_key: privateKey }),
      projectId: PROJECT_ID,
    });
  } catch (_) {
    throw configError("CONFIG_KEY_INVALID");
  }
  return admin;
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return reply(405, "Método não permitido.");

  const header = event.headers?.authorization || event.headers?.Authorization || "";
  if (!/^Bearer\s+\S+$/i.test(header)) {
    return reply(401, "Entre no painel administrativo para cadastrar cambistas.");
  }

  let firebase;
  try {
    firebase = getFirebaseAdmin();
  } catch (error) {
    const messages = {
      CONFIG_MISSING: "A variável FIREBASE_SERVICE_ACCOUNT_JSON não está disponível para esta função na Netlify.",
      CONFIG_INVALID_JSON: "O valor da credencial na Netlify não é JSON válido. Use o arquivo .json original completo, não uma tabela ou texto formatado.",
      CONFIG_PROJECT_MISMATCH: "A credencial configurada é de outro projeto Firebase; use a conta de serviço do COPABET.",
      CONFIG_FIELDS_MISSING: "O JSON da credencial está incompleto: faltam campos obrigatórios.",
      CONFIG_KEY_INVALID: "A chave privada do Firebase está inválida ou incompleta. Gere uma chave nova e configure o JSON original na Netlify.",
    };
    const code = Object.prototype.hasOwnProperty.call(messages, error.code) ? error.code : "CONFIG_INIT_ERROR";
    console.error("COPABET Firebase Admin:", code);
    return reply(503, messages[code] || "Não foi possível iniciar a conexão com o Firebase. Verifique os registros da função na Netlify.", { code });
  }

  let session;
  try {
    session = await firebase.auth().verifyIdToken(
      header.replace(/^Bearer\s+/i, ""), true,
    );
  } catch (error) {
    return reply(401, "Sua sessão expirou. Faça login novamente como administrador.");
  }

  // Token assinado pelo Firebase + UID exato autorizado. Nunca confie no HTML.
  if (
    session.uid !== ADMIN_UID ||
    session.firebase?.sign_in_provider === "anonymous"
  ) {
    return reply(403, "Somente o administrador pode cadastrar cambistas.");
  }

  try {
    const adminAccount = await firebase.auth().getUser(session.uid);
    if (adminAccount.disabled) return reply(403, "Conta administrativa desativada.");
  } catch (error) {
    return reply(403, "Conta administrativa não pôde ser validada.");
  }

  let data;
  try {
    if (!event.body || event.body.length > 4096) {
      return reply(413, "Dados do cadastro ausentes ou muito grandes.");
    }
    const body = event.isBase64Encoded
      ? Buffer.from(event.body, "base64").toString("utf8")
      : event.body;
    data = JSON.parse(body);
  } catch (error) {
    return reply(400, "Dados inválidos. Envie um formulário válido.");
  }

  const nome = typeof data.nome === "string" ? data.nome.trim() : "";
  const email = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  const senha = typeof data.senha === "string" ? data.senha : "";
  const rate = data.commissionPercent;

  if (
    nome.length < 2 || nome.length > 100 ||
    email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    senha.length < 8 || senha.length > 128 ||
    typeof rate !== "number" || !Number.isFinite(rate) ||
    rate < 0 || rate > 100
  ) {
    return reply(400, "Informe nome, e-mail, senha de 8 a 128 caracteres e comissão entre 0% e 100%.");
  }

  let created;
  try {
    created = await firebase.auth().createUser({
      email,
      password: senha,
      displayName: nome,
      disabled: false,
    });
  } catch (error) {
    if (error.code === "auth/email-already-exists") {
      return reply(409, "Esse e-mail já existe no Firebase Authentication. Recupere ou vincule a conta existente; não repita o cadastro.");
    }
    if (["auth/invalid-password", "auth/invalid-email"].includes(error.code)) {
      return reply(400, "O Firebase recusou o e-mail ou a senha fornecidos.");
    }
    console.error("Falha Authentication:", error.code || error.message);
    return reply(502, "Não foi possível criar o login no Firebase.");
  }

  try {
    // O login de cambista existente consulta /cambistas/{uid}.
    // Senhas nunca devem ser salvas no Firestore.
    await firebase.firestore().collection("cambistas").doc(created.uid).set({
      uid: created.uid,
      name: nome,
      email,
      role: "cambista",
      active: true,
      commissionPercent: rate,
      createdBy: session.uid,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
    });
  } catch (error) {
    console.error("Falha Firestore:", error.code || error.message);
    try {
      await firebase.auth().deleteUser(created.uid);
    } catch (cleanupError) {
      console.error("Não foi possível reverter Authentication:", created.uid, cleanupError.code || cleanupError.message);
      return reply(502, "A conta foi criada, mas o perfil falhou. Não repita o cadastro; solicite suporte informando o UID: " + created.uid);
    }
    return reply(502, "Falha ao salvar o perfil. A criação da conta foi revertida.");
  }

  return reply(201, "Cambista cadastrado e liberado para login!", { uid: created.uid });
};
