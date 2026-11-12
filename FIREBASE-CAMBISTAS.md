# COPABET — acesso dos cambistas (guia; NÃO é um segundo arquivo de regras)

**As regras do Firebase são únicas.** Copie e publique o conteúdo completo de [`firestore.rules`](./firestore.rules) em **Firebase Console > Firestore Database > Regras**. Esse arquivo já reúne as regras do restante da COPABET (usuários, bilhetes, jogos, pagamentos, configurações) e dos cambistas. Não cole trechos deste guia por cima das regras atuais e não crie dois blocos `match /cambistas`.

## Cadastro automático pelo painel administrativo

O cadastro no site usa duas etapas:

1. Cria o e-mail e a senha no **Firebase Authentication** (pela API do Firebase Authentication, usando uma sessão secundária para não desconectar o administrador).
2. Grava o documento em **Cloud Firestore > `cambistas/{UID}`** com nome, e-mail, `role: "cambista"`, `active: true` e `commissionPercent`.

O UID do documento Firestore deve ser exatamente o UID do Authentication. A senha **não** é armazenada no Firestore. Para o cambista entrar, escolha o perfil **Cambista** no login.

## Configuração inicial

Em **Firebase Console > Authentication > Sign-in method**, habilite **Email/Password**, se ainda não estiver habilitado. É necessário fazer isso uma vez; **nenhuma regra do Firestore cria contas no Authentication**. Se for exibido `auth/email-already-in-use`, confirme se aquele e-mail já existe em Authentication antes de criar uma segunda conta.

Se o Firebase negar a gravação do perfil (`permission-denied`), confira se as regras de `firestore.rules` estão publicadas e se o usuário administrador autenticado tem o UID esperado pela função `isAdmin()`. Atualizar GitHub ou Netlify **não** publica as regras do Firebase.

## Segurança e relatórios

O cambista pode consultar somente o próprio perfil. Somente o administrador pode listar perfis, definir porcentagens ou ativar/desativar cambistas. A regra de `bets` permite ao administrador consultar todos os bilhetes e ao titular consultar os próprios. A comissão exibida é um cálculo sobre bilhetes com pagamento confirmado, não uma comprovação financeira independente.

Para apostas com dinheiro real, o cadastro e a autorização no navegador não substituem validação de odds, limites, pagamentos e resultados em servidor confiável. Também é recomendável validar no backend a criação de bilhetes de cambistas.

## Diagnóstico

- `auth/operation-not-allowed`: ativar Email/Password em Authentication.
- `auth/invalid-credential`: conta inexistente ou credenciais incorretas, conforme política atual de erros.
- `auth/email-already-in-use`: o e-mail já foi registrado no Authentication.
- `permission-denied`: verificar as regras publicadas e a identidade autenticada.
- Sem cadastro em `cambistas`: consultar o documento com ID igual ao UID criado em Authentication.

**Fonte única para colar no Firebase: [`firestore.rules`](./firestore.rules).**
