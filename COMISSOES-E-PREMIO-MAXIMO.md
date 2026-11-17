# COPABET — comissões e limite máximo de prêmio

## Comissão de cambistas
A comissão é calculada **por bilhete**, somente sobre o valor efetivamente recebido e com pagamento confirmado, atribuído ao UID do cambista emissor:
- 1 jogo: 2,5% do valor bruto.
- 2 ou 3 jogos: 5,0% do valor bruto.
- 4 a 6 jogos: 10,0% do valor bruto.
- 7 ou mais jogos: 15,0% do valor bruto.

A quantidade de jogos é `picks.length`; o resultado esportivo (vencedor/perdedor) não muda a comissão. A comissão de cada bilhete é arredondada em centavos e os totais são somados. Bilhetes ainda sem pagamento confirmado não contam. O histórico também é recalculado com a tabela atual, sem regravar as apostas. Bilhetes antigos sem seleção válida aparecem no bruto, mas são sinalizados sem comissão.

O painel **Pesquisar Cambistas** mostra bruto e comissão por faixa, além de permitir exportação CSV. Cada cambista visualiza seu próprio demonstrativo em **Minhas vendas e comissão**. A comissão fixa anterior deixa de ser utilizada, inclusive para cadastros existentes.

## Prêmio máximo: R$ 10.000,00 por bilhete
O limite é no **prêmio/retorno potencial de cada bilhete**, não no valor apostado nem em um limite diário.
- Exatamente R$ 10.000,00: permitido.
- Acima de R$ 10.000,00: bloqueado.
- Vale para emissão pública, administrador e cambista.
- A verificação é aplicada antes da gravação no navegador e, por segurança, deve ser reforçada pelas regras do Firestore.

## Passo obrigatório no Firebase
O arquivo `firestore.rules` deste repositório foi alterado, mas **um deploy da Netlify não publica regras do Firebase automaticamente**. Após revisar as regras já em vigor, publique a versão atualizada no console do projeto Firebase `indexxx-94ed1` em **Firestore Database > Regras > Publicar**. Até essa publicação, a validação de R$ 10 mil não está garantida no servidor.

Não substitua regras de produção às cegas: concilie outras alterações existentes no console e preserve permissões necessárias.

## Testes
Execute `node --test tests/cambista-commission.test.mjs` com Node.js moderno.

Valide no ambiente de testes um bilhete com prêmio exatamente R$ 10.000,00 e outro com R$ 10.000,01, para as três formas de emissão. Confirme também a rejeição de gravação direta acima de R$ 10 mil pelo Firestore. Essas mudanças não alteram nem cancelam bilhetes já emitidos, inclusive os com valores superiores ao teto.
