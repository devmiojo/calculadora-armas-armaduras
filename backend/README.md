# Encomendas compartilhadas

O GitHub Pages serve a calculadora estática. Este serviço persiste o catálogo de materiais, preços, receitas e as encomendas em um banco D1 compartilhado; os dados não dependem do navegador de quem criou o pedido.

O serviço preparado para esta aplicação é `https://forja-encomendas.lannahechee.chatgpt.site`. A página em `docs/orders-config.js` aponta para esse endereço. A versão inicial de revisão é privada; o serviço precisa ser publicado para acesso dos ferreiros antes de usar encomendas pela página pública no GitHub Pages.

## Uso

1. Em **Encomendas**, informe seu nome de personagem.
2. O responsável cria a oficina uma vez; ela aparece em **Oficinas criadas**.
3. Os ferreiros abrem esse link para acessar a mesma lista.
4. Cadastre cliente, itens livres, quantidades, valores e observações. Receitas existentes podem preencher o preço; itens sem receita também são aceitos.
5. O ferreiro pode usar **Definir materiais e calcular** em cada item livre: busca ingredientes no catálogo ou informa materiais livres, quantidades e preços. A mão de obra e o orçamento são calculados automaticamente.
6. **Marcar item como feito** registra quem craftou aquele item; ferreiros diferentes podem fazer itens diferentes. Quando todos estão feitos, o pedido fica **Pronto (craftado)**, ainda sem entrega.
7. Use **Entregar ao cliente** depois de pronto. Quem produziu permanece registrado e a entrega recebe responsável e data próprios.

As oficinas são abertas aos visitantes do site e listadas pelo servidor. **Entrar** emite uma chave de acesso para a oficina escolhida; a tabela `workshop_access` guarda somente o hash dessa chave. Links anteriores continuam válidos como atalhos e são transportados no fragmento da URL. A chave é armazenada no navegador dos participantes; o banco guarda somente seu hash. A API exige a chave em cada leitura ou alteração de encomendas. O nome do ferreiro é informado manualmente para o RP.

Os valores combinados de uma encomenda são registrados como orçamento. Alterar os preços do catálogo recalcula as receitas; encomendas já registradas mantêm os valores acordados até uma edição explícita.

As atualizações usam versões para impedir que duas pessoas sobrescrevam o mesmo pedido. Reabrir uma entrega preserva o histórico. Repetir um envio de criação com o mesmo identificador não duplica a encomenda.

## API

| Operação | Rota |
|---|---|
| Consultar catálogo | `GET /api/catalog` |
| Inicializar catálogo uma vez | `POST /api/catalog` |
| Alterar catálogo com versão | `PATCH /api/catalog` |
| Listar oficinas | `GET /api/workshops` sem chave |
| Entrar pelo nome | `POST /api/workshops/:id/join` |
| Criar oficina | `POST /api/workshops` |
| Verificar acesso | `GET /api/workshops` |
| Listar encomendas | `GET /api/orders` |
| Criar encomenda | `POST /api/orders` |
| Editar, assumir, entregar ou reabrir | `PATCH /api/orders/:id` |

As requisições da oficina usam `X-Workshop-Id` e `Authorization: Bearer <chave>`. As alterações incluem a versão atual. Ações disponíveis: `edit`, `start`, `edit_item`, `make_item`, `complete`, `deliver`, `reopen_item`, `reopen`. `edit_item` salva a receita no item e recalcula o orçamento no servidor. `make_item` registra a produção de um item; `complete` conclui todos os pendentes. `deliver` somente é permitido quando o pedido está pronto.

## Hospedagem alternativa

`worker.mjs` pode ser publicado em Cloudflare Workers com um D1 ligado como `DB`. Crie o banco, copie `wrangler.example.jsonc` para `wrangler.jsonc`, preencha seu ID e aplique `schema.sql` uma única vez. Publique o Worker e ajuste `docs/orders-config.js` para o novo endereço. Novas mudanças de esquema devem usar migrações adicionais.

## Verificação

Na raiz do repositório, com Node 24:

```sh
node --test tests/pricing.test.cjs tests/orders.test.mjs
```

Os testes verificam persistência, itens livres, valores a combinar, entrega, autoria, histórico, concorrência, acesso separado por oficina, validação dos dados e o recálculo de preços.

## Catálogo compartilhado

A tabela `catalogs` guarda um documento por oficina, versão, autor e data da última alteração. A API valida materiais e receitas e recalcula a cadeia de preços no servidor. A inicialização é idempotente e não substitui um catálogo existente. Alterações exigem a versão atual e usam UPDATE condicional; conflitos retornam 409 sem sobrescrever dados. Orçamentos já acordados nas encomendas preservam seu histórico, mesmo quando o catálogo muda. A migração incremental no Site cria somente a nova tabela.

Para atualizar um serviço alternativo que já usa `schema.sql`, aplique somente `migrations/0001_shared_catalog.sql` à base existente antes de publicar esta API. Não recrie as tabelas de encomendas.

Para atualizar um serviço alternativo existente, aplique `migrations/0002_workshop_directory.sql`. A migração acrescenta `workshop_access` e preserva oficinas, encomendas e catálogos existentes. A listagem expõe somente identificador, nome e data; nunca retorna chaves ou hashes. A entrada pela lista é aberta aos visitantes, conforme o fluxo do produto.

## Senha master e exclusões

Configure `FORGE_MASTER_PASSWORD` como segredo do Worker (em Sites, segredo do ambiente de produção; em hospedagem alternativa, `wrangler secret put FORGE_MASTER_PASSWORD`). Nunca inclua o valor no repositório ou no frontend. `DELETE /api/workshops/:id` exige chave da oficina, `confirmationName` e `masterPassword`. `actor` é opcional; sem nome, a exclusão fica registrada como `Administrador (senha master)`. A exclusão registra `deleted_at` e `deleted_by`, oculta a oficina e bloqueia seus acessos, preservando os dados. `PATCH /api/catalog` também exige `masterPassword` sempre que remove identificadores de receitas ou materiais; alteração comum continua sem senha. Sem segredo configurado, exclusões são recusadas. Aplique `migrations/0003_master_deletion.sql` para atualizar um serviço alternativo existente.

Remoções de receitas ou materiais em `PATCH /api/catalog` também aceitam `actor` ausente após validar a senha master. Alterações comuns ainda exigem autoria, mesmo quando a requisição inclui uma senha.
