"use strict";

// Endpoint público para verificação simples de disponibilidade da Netlify.
// Não revela credenciais, informações de usuários ou dados financeiros.
// Responder 200 aqui não garante que Firebase e consultas de jogos estejam saudáveis.
exports.handler = async (event) => {
  if (event.httpMethod !== "GET" && event.httpMethod !== "HEAD") {
    return {
      statusCode: 405,
      headers: { "Allow": "GET, HEAD", "Cache-Control": "no-store" },
      body: "",
    };
  }

  const headers = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  return {
    statusCode: 200,
    headers,
    body: event.httpMethod === "HEAD"
      ? ""
      : JSON.stringify({ success: true, service: "copabet-netlify", status: "ok" }),
  };
};
