# Forja dos Mercadores

Calculadora de preços para ferreiros de Skyrim RP. Site estático em português, com 71 preços de 9 vendedores e cinco receitas iniciais de equipamentos de aço.

## Usar

Pesquise um material, adicione as quantidades, ajuste os preços, informe mão de obra e defina o percentual sobre o custo. Salve receitas por categoria e consulte o catálogo de fornecedores.

As receitas e os preços personalizados ficam no navegador de cada ferreiro. Use **Exportar backup** e **Importar backup** para transferir registros. Não existe banco de dados compartilhado nesta versão.

## Publicar no GitHub Pages

Em **Settings → Pages**, escolha **Deploy from a branch**, selecione a branch que contém estes arquivos e a pasta **/docs**, e salve. O site não exige instalação ou etapa de build.

## Executar localmente

```sh
python3 -m http.server 8000 --directory docs
```

Abra `http://localhost:8000`.

## Arquivos

- `docs/index.html`: interface.
- `docs/style.css`: estilos e adaptação para celular.
- `docs/data.js`: catálogo inicial.
- `docs/app.js`: cálculos, receitas, categorias e backups.

## Precificação

O campo de lucro aplica um acréscimo sobre o custo, e o arredondamento eleva o preço ao múltiplo selecionado. Para cobrar apenas 10–15% de mão de obra sobre os materiais, deixe os custos extras em zero e use 10 ou 15 no campo percentual. Nenhum imposto é acrescentado automaticamente.
