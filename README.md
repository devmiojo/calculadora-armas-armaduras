# Forja dos Mercadores

Calculadora de preços e livro de encomendas para ferreiros de Skyrim RP. Inclui 71 registros de 9 vendedores, oito receitas iniciais e busca em português e inglês.

## Precificar

Pesquise materiais, ajuste quantidades e informe mão de obra em percentual, custos fixos e lucro sobre o custo. Alterar um preço vinculado atualiza automaticamente todas as receitas dependentes. Um material também pode usar o preço calculado de outra receita.

Para cobrar somente 10–15% de mão de obra, use esse percentual no campo **Mão de obra do ferreiro** e deixe o lucro em zero. O arredondamento eleva o preço ao múltiplo selecionado. Nenhum imposto é acrescentado automaticamente.

Referências atualizadas de Alvor: aço 38, corundum 66, ferro 15 e tiras 5 septims. Lenha usa o valor definido de 5. Carvão é calculado a partir de 3 lenhas + 15% de mão de obra, arredondado para cima: 18 septims.

Receitas, materiais e preços ficam em um catálogo compartilhado por oficina no banco D1. Todos que entram pelo mesmo link podem criar, modificar, duplicar e excluir receitas e editar preços. O catálogo atualiza automaticamente a cada 20 segundos e ao voltar à página; **Atualizar catálogo** permite buscar as mudanças imediatamente. Cada alteração registra nome e data e usa uma versão para impedir que uma edição simultânea sobrescreva outra. Rascunhos em edição são preservados quando há conflito; atualize e reabra o registro antes de tentar novamente.

O primeiro acesso inicializa o catálogo vazio com os registros antigos daquele navegador. Nos demais computadores, **Compartilhar receitas antigas deste navegador** importa apenas registros novos, sem substituir receitas ou preços já existentes. O armazenamento antigo permanece intacto. **Exportar backup** exporta o catálogo atual; **Importar backup** compartilha os registros novos com a oficina. Sem oficina ou sem conexão, a calculadora permite consultar e simular, mas não confirma salvamentos compartilhados.

## Encomendas

Informe seu nome de personagem, crie a oficina uma vez e compartilhe seu link com os ferreiros. A oficina usa um banco compartilhado: todos os participantes veem as mesmas encomendas, independentemente do computador.

Uma encomenda registra cliente, itens livres, quantidades, valores e observações. Itens ainda não cadastrados são aceitos. Selecione uma receita para preencher seu preço ou informe um valor manual; preços em branco ficam **a combinar**.

Os status são **Pendente**, **Em produção**, **Pronta (craftada)** e **Entregue ao cliente**. **Assumir** registra quem começou a produção. Cada item novo pode receber materiais, quantidades, produção por receita, mão de obra, lucro e custos fixos. O sistema calcula seu preço e o total do pedido. A receita fica compartilhada junto do item e pode ser salva também como nova receita no catálogo compartilhado. **Marcar item como feito** registra quem produziu cada item; quando todos estão feitos, a encomenda fica **Pronta (craftada)**. Só então **Entregar ao cliente** registra a entrega, com responsável e data separados da produção. O histórico permanece disponível ao reabrir uma encomenda. Os valores acordados ficam registrados no pedido, mesmo se o catálogo mudar.

Veja [backend/README.md](backend/README.md) para detalhes do serviço compartilhado e hospedagem alternativa. O serviço inicial de revisão é privado; precisa ser liberado para os ferreiros junto da publicação no GitHub Pages.

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
