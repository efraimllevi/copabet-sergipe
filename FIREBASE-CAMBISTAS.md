# COPABET — Cadastro de cambistas pela Netlify (Firebase Spark)

Este projeto mantém **Firebase Authentication e Firestore no plano Spark**, usando **Netlify Functions** como backend para criar contas de cambistas. Não usa Cloud Functions do Firebase.

## Como funciona

1. O administrador entra no COPABET com o usuário autorizado.
2. No formulário **Cadastrar Cambista**, informa nome, e-mail, senha e comissão.
3. O navegador envia o ID token do administrador e os dados à rota HTTPS \`/.netlify/functions/cadastrar-cambista\`.
4. A função da Netlify verifica o **ID token assinado pelo Firebase**, a identidade administrativa e os dados.
5. O servidor cria o usuário no Firebase Authentication e grava \`cambistas/{UID}\` no Firestore.
6. O cambista usa as credenciais criadas na aba **Cambista**.

A senha não é gravada no Firestore e a sessão do administrador não é substituída.

## Instalação inicial (obrigatória)

### A. Configure o segredo somente na Netlify

No Firebase Console, abra o projeto **indexxx-94ed1**:
**Configurações do projeto > Contas de serviço > Firebase Admin SDK > Gerar nova chave privada**.

**NÃO envie esse arquivo JSON para o GitHub, Netlify como arquivo público, WhatsApp ou chat.**

No painel do **site existente** na Netlify, vá a **Site configuration > Environment variables** e crie a variável:

- **Nome:** \`FIREBASE_SERVICE_ACCOUNT_JSON\`
- **Valor:** conteúdo completo do JSON baixado, inclusive chaves e quebras de linha.
- **Escopo:** Functions, incluindo produção (e previews, se quiser testar previews).

Configure como variável secreta/sensível se essa opção estiver disponível. A função recusa iniciar se a credencial faltar ou se pertencer a outro projeto.

### B. Publique o projeto e a função na Netlify

Este repositório contém \`netlify.toml\`, \`package.json\`, \`netlify/functions/cadastrar-cambista.js\` e \`index.html\`.

**Se conectar o GitHub ao seu site existente na Netlify:** configure o branch de produção, publicação no diretório \`.\` e diretório de funções \`netlify/functions\` (configurações do \`netlify.toml\`). A Netlify executa o deploy automaticamente após mesclar a alteração no branch conectado.

**Se continuar fazendo envio manual de pasta/ZIP:** arrastar apenas \`index.html\` ou um ZIP para o painel de upload não configura corretamente esta função. Use a **Netlify CLI** para publicar o código e as funções, vinculando ao **site existente**:

\`\`\`bash
npm install
npm install -g netlify-cli
netlify login
netlify link
netlify deploy
# Após testar a prévia:
netlify deploy --prod
\`\`\`

Na etapa \`netlify link\`, vincule ao site atual do COPABET, não crie outro. Execute os comandos na pasta do projeto.

### C. Regras do Firestore

As regras de acesso da coleção \`cambistas\` já estão no arquivo \`firestore.rules\` do repositório e permitem ao próprio cambista ler seu perfil e ao admin gerir os perfis. **Atualizar GitHub ou Netlify não publica essas regras.** Confira o que está publicado em **Firebase Console > Firestore Database > Regras**, compare com suas regras atuais e só então publique mudanças. Não substitua regras atuais sem conferir as de jogos, bilhetes e pagamentos.

A função usa o Admin SDK no servidor. **As regras do Firestore não criam contas de login**.

## Segurança e recuperação

- **Nunca** inclua \`FIREBASE_SERVICE_ACCOUNT_JSON\` em \`index.html\`, \`.env\` público, arquivos enviados ao GitHub ou \`netlify.toml\`.
- Somente token válido do administrador específico consegue criar cambistas. Informar \`role=admin\` no navegador não autoriza ninguém.
- E-mail já existente no Authentication retorna erro de conflito. Não apague ou recrie contas de cambistas antigos sem analisar a correspondência de UID e dados.
- Se gravar o perfil falhar, o backend tenta excluir o login criado para evitar conta órfã. Em caso de falha de reversão, não repita o cadastro; consulte os logs.
- Valores financeiros, apostas e permissões devem ser validados pelo servidor. Esta alteração trata o **cadastro do cambista**, não faz auditoria completa das regras de apostas/pagamentos.
- Planos gratuitos têm cotas e limites. A função e o login devem ser testados em produção depois do deploy.

## Teste

Depois de publicar a Netlify Function **com a credencial configurada**:

1. Acesse o COPABET na Netlify, entre como administrador e cadastre um cambista com e-mail ainda não utilizado.
2. Confirme a mensagem de sucesso e a existência do registro em \`cambistas/{UID}\`.
3. Encerre a sessão e acesse a opção **Cambista** com o e-mail e a senha criados.

Se o cadastro informar que a Netlify não está configurada, revise a variável e os logs da função. Se a rota \`/.netlify/functions/cadastrar-cambista\` retornar 404, a função não foi publicada nesse site.
