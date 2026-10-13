# Forja dos Mercadores

Calculadora de preços e livro de encomendas para ferreiros de Skyrim RP. Inclui 71 registros de 9 vendedores, oito receitas iniciais e busca em português e inglês.

## Precificar

Pesquise materiais, ajuste quantidades e informe mão de obra em percentual, custos fixos e lucro sobre o custo. Alterar um preço vinculado atualiza automaticamente todas as receitas dependentes. Um material também pode usar o preço calculado de outra receita.

Para cobrar somente 10–15% de mão de obra, use esse percentual no campo **Mão de obra do ferreiro** e deixe o lucro em zero. O arredondamento eleva o preço ao múltiplo selecionado. Nenhum imposto é acrescentado automaticamente.

Referências atualizadas de Alvor: aço 38, corundum 66, ferro 15 e tiras 5 septims. Lenha usa o valor definido de 5. Carvão é calculado a partir de 3 lenhas + 15% de mão de obra, arredondado para cima: 18 septims.

Receitas, materiais e preços ficam em um catálogo compartilhado por oficina no banco D1. Todos que entram pelo mesmo link podem criar, modificar, duplicar e excluir receitas e editar preços. A tela **Precificar** inicia vazia, inclusive ao trocar de oficina. Use **Abrir** em uma receita salva para carregá-la na calculadora. O catálogo atualiza automaticamente a cada 20 segundos e ao voltar à página; **Atualizar catálogo** permite buscar as mudanças imediatamente. Cada alteração registra nome e data e usa uma versão para impedir que uma edição simultânea sobrescreva outra. Rascunhos em edição são preservados quando há conflito; atualize e reabra o registro antes de tentar novamente.

O primeiro acesso inicializa o catálogo vazio com os registros antigos daquele navegador. Nos demais computadores, **Compartilhar receitas antigas deste navegador** importa apenas registros novos, sem substituir receitas ou preços já existentes. O armazenamento antigo permanece intacto. **Exportar backup** exporta o catálogo atual; **Importar backup** compartilha os registros novos com a oficina. Sem oficina ou sem conexão, a calculadora permite consultar e simular, mas não confirma salvamentos compartilhados.

## Encomendas

Crie a oficina uma vez. O nome do personagem é opcional. Ela permanece na lista **Oficinas criadas**, disponível em qualquer computador. Os jogadores entram pelo botão **Entrar** junto ao nome, sem precisar de link. O link antigo continua funcionando como atalho. A oficina usa um banco compartilhado: todos os participantes veem as mesmas encomendas, independentemente do computador.

Uma encomenda registra cliente, itens livres, quantidades, valores e observações. Itens ainda não cadastrados são aceitos. Selecione uma receita para preencher seu preço ou informe um valor manual; preços em branco ficam **a combinar**.

Os status são **Pendente**, **Em produção**, **Pronta (craftada)** e **Entregue ao cliente**. **Assumir** registra quem começou a produção. Cada item novo pode receber materiais, quantidades, produção por receita, mão de obra, lucro e custos fixos. O sistema calcula seu preço e o total do pedido. A receita fica compartilhada junto do item e pode ser salva também como nova receita no catálogo compartilhado. **Marcar item como feito** registra quem produziu cada item; quando todos estão feitos, a encomenda fica **Pronta (craftada)**. Só então **Entregar ao cliente** registra a entrega, com responsável e data separados da produção. O histórico permanece disponível ao reabrir uma encomenda. Os valores acordados ficam registrados no pedido, mesmo se o catálogo mudar.

Veja [backend/README.md](backend/README.md) para detalhes do serviço compartilhado e hospedagem alternativa. O site está publicado em https://devmiojo.github.io/calculadora-armas-armaduras/ e usa o serviço compartilhado configurado em `docs/orders-config.js`.

## Publicar no GitHub Pages

Em **Settings → Pages**, escolha **Deploy from a branch**, selecione `main` e a pasta `/docs`. A calculadora estática não exige instalação nem build. O serviço de encomendas deve estar publicado no endereço configurado em `docs/orders-config.js`.

## Executar localmente

```sh
python3 -m http.server 8000 --directory docs
```

Abra `http://localhost:8000`. Simulações funcionam localmente; salvamentos e encomendas usam a API configurada e as origens autorizadas no serviço.

## Verificar

Com Node 24:

```sh
node --test tests/pricing.test.cjs tests/orders.test.mjs tests/catalog.test.mjs
```

Os testes verificam os recálculos em cadeia, a persistência de encomendas, itens livres, entregas, histórico, concorrência e separação entre oficinas.

## Exclusões

**Excluir** na lista de oficinas e nas receitas exige uma senha master validada pelo servidor. A senha é configurada como segredo de produção `FORGE_MASTER_PASSWORD`; ela não é publicada no frontend nem lembrada no navegador. Excluir uma oficina exige também seu nome exato e afeta somente o identificador selecionado, mesmo quando existem nomes iguais. A oficina sai da lista e deixa de ser acessível; os registros são preservados no banco. A exclusão de uma receita mantém os materiais e os valores já combinados nas encomendas.

O catálogo de preços também oferece **Excluir** por item/vendedor, protegido pela mesma senha master. A confirmação identifica o nome, vendedor e preço. Receitas dependentes mantêm o último valor do ingrediente como preço próprio; outras ofertas do mesmo item e encomendas já registradas são preservadas.

Exclusões de oficinas, receitas e itens do catálogo não exigem o nome do ferreiro. A senha master continua obrigatória, e exclusões sem nome são registradas como **Administrador (senha master)**. A confirmação do nome da oficina permanece para identificar o alvo correto.

Nenhum salvamento exige nome do ferreiro: receitas, materiais, preços e encomendas podem ser criados e alterados sem preencher esse campo. Produção e entrega também aceitam nome vazio; o histórico registra **Não informado**. Se preenchido, o nome informado continua sendo registrado.
