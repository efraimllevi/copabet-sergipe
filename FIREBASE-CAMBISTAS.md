# COPABET — correção do acesso do cambista no Firebase

Estas instruções se aplicam ao projeto Firebase `indexxx-94ed1` utilizado pelo `index.html`.

## 1. Firestore Database > Rules

**ATENÇÃO:** não substitua todas as regras atuais por este trecho; isso bloquearia outras áreas da COPABET. Dentro do `service cloud.firestore { match /databases/{database}/documents { ... } }` já existente, adicione ou ajuste o bloco de `/cambistas/{cambistaUid}`:

```javascript
match /cambistas/{cambistaUid} {
  // Somente o titular consulta o próprio cadastro;
  // o administrador pode consultar todos os cambistas.
  allow get: if request.auth != null &&
    (request.auth.uid == cambistaUid ||
     request.auth.uid == "rjWeKGZpkMVrW8UynAKCwjZXklM2");

  // Proíbe que um cambista liste todos os cadastros.
  allow list: if request.auth != null &&
    request.auth.uid == "rjWeKGZpkMVrW8UynAKCwjZXklM2";

  // Cambistas não podem criar contas privilegiadas nem
  // ativar ou alterar a função/identidade por conta própria.
  allow create, update, delete: if request.auth != null &&
    request.auth.uid == "rjWeKGZpkMVrW8UynAKCwjZXklM2";
}
```

Se já houver um `match /cambistas/{...}`, **edite o bloco existente** em vez de duplicá-lo. Confirme também que não existe uma regra genérica permissiva (por exemplo, `allow read, write: if true`), pois condições em `match` sobrepostos se combinam por **OU**.

Clique em **Publish/Publicar** nas regras do Cloud Firestore. Publicar o site no Netlify ou enviar um arquivo ao GitHub **não publica** essas regras no Firebase.

## 2. Cadastro autorizado do cambista

No Firebase Console:
1. **Authentication > Users:** confirme a conta de e-mail/senha e copie o **UID** dela.
2. **Firestore Database > Data:** abra/crie a coleção `cambistas`.
3. Crie o documento cujo **ID é exatamente o UID** do Authentication.
4. Cadastre os campos:
   - `name`: string com o nome (mínimo de 2 caracteres);
   - `role`: string `cambista`;
   - `active`: boolean `true`.
5. Faça login no site escolhendo a função **Cambista**.

Se a conta não estiver no Authentication, ative **Sign-in method > Email/Password** e crie o usuário. Se a conta existir mas não tiver o documento com esses campos, o site continuará recusando o acesso de propósito.

## 3. Emissão de bilhetes

A tela do cambista grava bilhetes em `bets` com `cambistaIssued: true`, `source: "cambista_manual"` e `issuedByUid` igual ao UID autenticado. A regra acima resolve especificamente **a consulta do cadastro para entrar**. Se, depois do login, surgir `permission-denied` ao **registrar** um bilhete, será necessário revisar a regra **existente** de `bets` sem expor os bilhetes de outros clientes.

**Segurança:** permissões de leitura do cadastro não bastam para validar apostas com dinheiro real. Odds, limites, elegibilidade dos jogos e valores de pagamento precisam de validação confiável no servidor, não apenas no JavaScript do navegador.

## 4. Diagnóstico

- `permission-denied` na consulta de `cambistas/{UID}`: regra de leitura não publicada ou bloqueada.
- `Cambista não cadastrado ou desativado`: documento inexistente, `active` diferente de `true`, `role` diferente de `cambista` ou nome inválido.
- `auth/invalid-credential`: e-mail/senha incorretos.
- `auth/unauthorized-domain`: adicione o domínio do Netlify em **Authentication > Settings > Authorized domains**.

**O arquivo `index.html` do GitHub já distingue falha de permissão de falha de conexão durante o login do cambista.**
