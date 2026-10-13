const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({window: {}});
vm.runInContext(fs.readFileSync(path.join(__dirname, '../docs/pricing.js'), 'utf8'), context);
const pricing = context.window.FORGE_PRICING;

function workshop() {
  // Synthetic recipes verify chained pricing without prescribing game recipes.
  return {
    materials: [
      {id: 'wood', name: 'Lenha', vendor: 'Oficina', price: 5},
      {id: 'coal', name: 'Carvão', vendor: 'Oficina', price: 18, pricingRecipeId: 'charcoal'},
      {id: 'ore', name: 'Minério', vendor: 'Oficina', price: 2},
      {id: 'metal', name: 'Metal', vendor: 'Oficina', price: 0, pricingRecipeId: 'smelt'},
      {id: 'strips', name: 'Tiras', vendor: 'Oficina', price: 5}
    ],
    recipes: [
      {id: 'weapon', name: 'Arma', output: 1, labourPct: 15, extra: 2, markup: 0, round: 1,
        lines: [{materialId: 'metal', qty: 2, price: 0}, {materialId: 'strips', qty: 1, price: 5}]},
      {id: 'smelt', name: 'Fundição', output: 2, labourPct: 10, extra: 1, markup: 20, round: 1,
        lines: [{materialId: 'coal', qty: 2, price: 18}, {materialId: 'ore', qty: 1, price: 2}]},
      {id: 'charcoal', name: 'Carvão', output: 1, labourPct: 15, extra: 0, markup: 0, round: 1,
        lines: [{materialId: 'wood', qty: 3, price: 5}]}
    ]
  };
}

test('material changes cascade through recipes, labour, outputs, markup and rounding', () => {
  const s = workshop();
  pricing.recalculate(s);
  assert.equal(s.materials.find(m => m.id === 'coal').price, 18);
  assert.equal(s.materials.find(m => m.id === 'metal').price, 26);
  assert.equal(pricing.calculate(s.recipes[0]).sale, 68);
  s.materials[0].price = 6;
  pricing.recalculate(s);
  assert.equal(s.materials.find(m => m.id === 'coal').price, 21);
  assert.equal(s.materials.find(m => m.id === 'metal').price, 30);
  assert.equal(pricing.calculate(s.recipes[0]).sale, 77);
  assert.equal(s.materials.find(m => m.id === 'ore').price, 2);
});

test('changing a production recipe updates derived prices', () => {
  const s = workshop();
  s.recipes[2].lines[0].qty = 4;
  pricing.recalculate(s);
  assert.equal(s.materials.find(m => m.id === 'coal').price, 23);
  assert.equal(s.recipes[1].lines[0].price, 23);
});

test('manual prices and legacy fixed fees keep their meaning', () => {
  const s = workshop();
  s.recipes[0].lines[0].manualPrice = true;
  s.recipes[0].lines[0].price = 99;
  delete s.recipes[0].labourPct;
  s.recipes[0].extra = 7;
  pricing.recalculate(s);
  assert.equal(s.recipes[0].lines[0].price, 99);
  assert.equal(pricing.calculate(s.recipes[0]).labour, 0);
  assert.equal(pricing.calculate(s.recipes[0]).total, 210);
  delete s.materials[1].pricingRecipeId;
  s.materials[1].price = 12;
  s.materials[0].price = 20;
  pricing.recalculate(s);
  assert.equal(s.materials[1].price, 12);
  assert.equal(s.recipes[1].lines[0].price, 12);
});

test('circular price references are rejected', () => {
  const s = workshop();
  s.recipes[2].lines[0].materialId = 'metal';
  assert.throws(() => pricing.recalculate(s), /ciclo de preços/);
});

test('recalculation is stable on reload and works with zero costs', () => {
  const s = workshop();
  s.materials[0].price = 0;
  pricing.recalculate(s);
  assert.equal(s.materials[1].price, 0);
  const saved = JSON.stringify(s);
  pricing.recalculate(s);
  assert.equal(JSON.stringify(s), saved);
});
