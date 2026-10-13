# Encomendas compartilhadas

O GitHub Pages serve a calculadora estática. Este serviço persiste as encomendas em um banco D1 compartilhado; os dados não dependem do navegador de quem criou o pedido.

O serviço preparado para esta aplicação é `https://forja-encomendas.lannahechee.chatgpt.site`. A página em `docs/orders-config.js` aponta para esse endereço. A versão inicial de revisão é privada; o serviço precisa ser publicado para acesso dos ferreiros antes de usar encomendas pela página pública no GitHub Pages.

## Uso

1. Em **Encomendas**, informe seu nome de personagem.
2. O responsável cria a oficina uma vez e copia **Compartilhar oficina**.
3. Os ferreiros abrem esse link para acessar a mesma lista.
4. Cadastre cliente, itens livres, quantidades, valores e observações. Receitas existentes podem preencher o preço; itens sem receita também são aceitos.
5. Use **Assumir** para registrar quem iniciou a produção. Em **Registrar entrega**, informe quem fez os itens. O pedido guarda o responsável, quem registrou a entrega, data e histórico.

O link autoriza acesso à oficina e é transportado no fragmento da URL. A chave é armazenada no navegador dos participantes; o banco guarda somente seu hash. A API exige a chave em cada leitura ou alteração de encomendas. O nome do ferreiro é informado manualmente para o RP.

Os valores combinados de uma encomenda são registrados como orçamento. Alterar os preços do catálogo recalcula as receitas; encomendas já registradas mantêm os valores acordados até uma edição explícita.

As atualizações usam versões para impedir que duas pessoas sobrescrevam o mesmo pedido. Reabrir uma entrega preserva o histórico. Repetir um envio de criação com o mesmo identificador não duplica a encomenda.

## API

| Operação | Rota |
|---|---|
| Criar oficina | `POST /api/workshops` |
| Verificar acesso | `GET /api/workshops` |
| Listar encomendas | `GET /api/orders` |
| Criar encomenda | `POST /api/orders` |
| Editar, assumir, entregar ou reabrir | `PATCH /api/orders/:id` |

As requisições da oficina usam `X-Workshop-Id` e `Authorization: Bearer <chave>`. As alterações incluem a versão atual. Ações disponíveis: `edit`, `start`, `deliver`, `reopen`.

## Hospedagem alternativa

`worker.mjs` pode ser publicado em Cloudflare Workers com um D1 ligado como `DB`. Crie o banco, copie `wrangler.example.jsonc` para `wrangler.jsonc`, preencha seu ID e aplique `schema.sql` uma única vez. Publique o Worker e ajuste `docs/orders-config.js` para o novo endereço. Novas mudanças de esquema devem usar migrações adicionais.

## Verificação

Na raiz do repositório, com Node 24:

```sh
node --test tests/pricing.test.cjs tests/orders.test.mjs
```

Os testes verificam persistência, itens livres, valores a combinar, entrega, autoria, histórico, concorrência, acesso separado por oficina, validação dos dados e o recálculo de preços.
