# COPABET — Modernização visual responsiva (novembro de 2026)

## O que mudou
- Cabeçalho e banner mais compactos com textos objetivos.
- Introdução da área pública e filtros por competição com rolagem horizontal no celular.
- Cards de partidas com hierarquia visual melhorada; cotações em três colunas e botões com alvo de toque ampliado.
- Bilhete público no celular em formato de painel sobreposto, acessível pelo botão **Bilhete** do menu inferior.
- Navegação móvel com quatro opções: **Início**, **Jogos**, **Ao vivo**, **Bilhete**.
- O botão do bilhete exibe a quantidade de jogos selecionados. Fechar o painel não remove palpites.
- A navegação e o painel são ocultados quando o usuário entra nos fluxos de administrador ou pagamento.
- Foram incluídos foco visível e suporte à preferência por menos movimento.

## O que foi preservado
Não foram alterados os contratos de Firebase, Netlify Functions, APIs esportivas, registro de apostas, as comissões dos cambistas ou o limite de prêmio de R$ 10.000,00.

Os estilos novos ficam em `assets/copabet-modern-ui.css` e a navegação móvel em `assets/copabet-modern-ui.js`. Ambos são carregados pelo `index.html`. O `netlify.toml` já copia a pasta `assets` no deploy.

## Roteiro de verificação antes do deploy
1. Abra em celular com largura próxima a 375px e escolha **Sou apostador**.
2. Confira banner, cabeçalho, filtros horizontais, jogos e menu inferior.
3. Use **Jogos** e **Ao vivo**; confirme que cada filtro ativa a lista correspondente.
4. Selecione partidas e abra **Bilhete**; valide o contador e os valores calculados.
5. Feche o bilhete pelo X, abra novamente e confirme que as seleções continuam.
6. Abra e feche o modal de pagamento e confirme que o bilhete não cobre a confirmação.
7. No desktop, confira que o bilhete continua na lateral.
8. Faça smoke tests do painel ADM, login do cambista, comissões e limite de prêmio.

A integração dos arquivos foi testada por inspeção e simulação dos eventos de navegação. Ainda é necessária uma revisão visual nos dispositivos de produção.
