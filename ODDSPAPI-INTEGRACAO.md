# Integração OddsPapi — COPABET

O novo importador trabalha em paralelo ao importador legado da SportsAPI, sem modificar os bilhetes, logins ou registros financeiros existentes.

- API: OddsPapi v4
- Sport ID: 10 (football)
- Torneios procurados por nome: Brasileirão Série A, UEFA Champions League e UEFA Nations League.
- Endpoints: /v4/tournaments, /v4/participants, /v4/markets, /v4/odds-by-tournaments.
- Casa de referência: pinnacle. O plano da OddsPapi deve disponibilizá-la.
- Salvamento: coleção Firestore `jogos`, IDs prefixados com `oddspapi_`.
- Odds: `odds` em formato 1X2 compatível com a vitrine atual; `marketCatalog` com opções de outros mercados efetivamente fornecidos.

## Para ativar

Em GitHub > Settings > Secrets and variables > Actions, criar o segredo `ODDSPAPI_API_KEY` com a chave obtida na OddsPapi. O segredo `FIREBASE_SERVICE_ACCOUNT` precisa continuar configurado. **Nunca escrever a chave no código ou em mensagens de log.**

Em GitHub > Actions > Atualizar jogos OddsPapi COPABET > Run workflow, executar pela primeira vez e conferir os registros. Após isso, o workflow solicita novas cotações uma vez por dia, às 11h17 UTC (08h17 em Brasília, quando o horário local for UTC-3). Os limites do plano e a precisão devem ser conferidos no painel OddsPapi.

## Mercados adicionais

A `marketCatalog` preserva IDs, períodos e preços ativos, incluindo mercados que não são 1X2. **Não habilitar apostas nesses mercados antes de adaptar a emissão, a validação e a apuração dos bilhetes.** Hoje o motor existente foi feito para 1X2, e ligar seleções novas sem liquidação correta poderia pagar um bilhete indevidamente.

Revisar também a origem dos placares e políticas de mercado (prorrogação, pênaltis, cartões, handicap asiático e cancelamentos). O importador não fabrica linhas indisponíveis e não assume que um mercado foi liberado pelo plano.

## Segurança

A chave anterior foi compartilhada em conversa e deve ser rotacionada no painel OddsPapi antes de uso em produção.

## Cota de requisições

A OddsPapi anuncia 250 requisições/mês no plano gratuito. Cada execução faz pelo menos quatro chamadas faturáveis (torneios, participantes, mercados e odds por torneio agrupadas em lotes de no máximo três). A sincronização diária consome cerca de 120 requisições em 30 dias, sem contar erros ou eventuais chamadas extras. Para atualização a cada minutos, é necessário plano adequado e monitoramento da cota via `GET /v4/account`.
