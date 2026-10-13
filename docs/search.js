'use strict';

// Shared search vocabulary; saved names and prices keep their original values.
window.ITEM_SEARCH = (() => {
  const normalize = value => String(value ?? '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
  const names = [
    ['Pão', 'Bread'],
    ['Hidromel nórdico', 'Nord Mead', 'Hidromel'],
    ['Sopa de batata', 'Potato Soup'],
    ['Arrombamento', 'Lockpick', 'Gazua', 'Ganzua'],
    ['Carvão', 'Charcoal Stick', 'Carvão vegetal', 'Charcoal'],
    ['Couro', 'Leather'],
    ['Lenha', 'Firewood', 'Wood'],
    ['Tiras de Couro', 'Leather Strips', 'Tira de couro'],
    ['Tocha', 'Torch'],
    ['Barra de Aço', 'Steel Ingot', 'Lingote de aço'],
    ['Barra de Corundum', 'Corundum Ingot', 'Lingote de corundum', 'Barra de coríndon', 'Lingote de coríndon'],
    ['Lingote de Ferro', 'Iron Ingot', 'Barra de ferro'],
    ['Cerveja', 'Ale'],
    ['Ensopado de maçã e repolho', 'Apple Cabbage Stew', 'Sopa de maçã e repolho'],
    ['Arco de Caça', 'Hunting Bow'],
    ['Armadura de Ferro', 'Iron Armor', 'Iron Armour'],
    ['Botas de Ferro', 'Iron Boots'],
    ['Machado de batalha de ferro', 'Iron Battleaxe', 'Machado de guerra de duas mãos de ferro'],
    ['Adaga de ferro', 'Iron Dagger'],
    ['Espada grande de ferro', 'Iron Greatsword', 'Espadão de ferro', 'Espada de duas mãos de ferro'],
    ['Elmo de ferro', 'Iron Helmet', 'Capacete de ferro'],
    ['Maça de ferro', 'Iron Mace'],
    ['Escudo de ferro', 'Iron Shield'],
    ['Espada de ferro', 'Iron Sword'],
    ['Machado de guerra de ferro', 'Iron War Axe', 'Machado de uma mão de ferro'],
    ['Manoplas de Ferro', 'Iron Gauntlets', 'Luvas de ferro'],
    ['Minério de Corundum', 'Corundum Ore', 'Minério de coríndon'],
    ['Minério de Ferro', 'Iron Ore'],
    ['Minério de Ouro', 'Gold Ore'],
    ['Minério de Prata', 'Silver Ore'],
    ['Anuad infantil', "A Children's Anuad", 'Anuad para crianças'],
    ['Guia de Whiterun para cavalheiros', "A Gentleman's Guide to Whiterun"],
    ['Guia de Skyrim para exploradores', "An Explorer's Guide to Skyrim"],
    ['Picareta', 'Pickaxe'],
    ['A empregada argoniana lasciva, v1', 'The Lusty Argonian Maid, v1', 'A donzela argoniana, v1'],
    ['A verdadeira Barenziah, v1', 'The Real Barenziah, v1'],
    ['Machado de lenhador', "Woodcutter's Axe"],
    ['Amoras das Neves', 'Snowberries', 'Amora das neves'],
    ['Asa de Borboleta Azul', 'Blue Butterfly Wing'],
    ['Flor da Montanha Azul', 'Blue Mountain Flower'],
    ['Lavanda', 'Lavender'],
    ['Poção de Cura', 'Potion of Healing', 'Poção de vida', 'Health Potion'],
    ['Poção de Cura de Doenças', 'Potion of Cure Disease'],
    ['Poção de Cura Menor', 'Potion of Minor Healing', 'Poção menor de cura', 'Minor Health Potion'],
    ['Poção de Magicka', 'Potion of Magicka', 'Poção de mana'],
    ['Poção de Resistência à Magia', 'Potion of Resist Magic', 'Magic Resistance Potion'],
    ['Poção de Resistência ao Choque', 'Potion of Resist Shock', 'Shock Resistance Potion'],
    ['Poção de Resistência ao Fogo', 'Potion of Resist Fire', 'Fire Resistance Potion'],
    ['Poção de Resistência ao Frio', 'Potion of Resist Frost', 'Frost Resistance Potion'],
    ['Poção Menor de Magicka', 'Potion of Minor Magicka', 'Poção de magicka menor', 'Poção menor de mana'],
    ['Poção Menor de Vigor', 'Potion of Minor Stamina', 'Poção menor de stamina'],
    ['Raiz de Nirn', 'Nirnroot'],
    ['Trigo', 'Wheat'],
    ['Maçã verde', 'Green Apple'],
    ['Alho-poró grelhado', 'Grilled Leeks', 'Alho poró assado'],
    ['Armadura de aço', 'Steel Armor', 'Steel Armour'],
    ['Botas de aço', 'Steel Cuffed Boots', 'Steel Boots', 'Botas de aço com punhos'],
    ['Elmo de aço com chifres', 'Steel Horned Helmet', 'Capacete de aço com chifres'],
    ['Manoplas nórdicas de aço', 'Steel Nordic Gauntlets', 'Luvas nórdicas de aço'],
    ['Machado de batalha de aço', 'Steel Battleaxe', 'Machado de guerra de duas mãos de aço'],
    ['Espada grande de aço', 'Steel Greatsword', 'Espadão de aço', 'Espada de duas mãos de aço'],
    ['Martelo de guerra de aço', 'Steel Warhammer', 'Martelo de aço']
  ];
  const groups = new Map();
  for (const group of names) for (const name of group) groups.set(normalize(name), group);
  const termGroups = [
    ['aço', 'steel'], ['ferro', 'iron'], ['couro', 'leather'], ['carvão', 'charcoal'],
    ['barra', 'lingote', 'ingot'], ['minério', 'ore'], ['tiras', 'strips'],
    ['espada', 'sword'], ['espadão', 'greatsword'], ['machado', 'axe'],
    ['martelo', 'warhammer', 'hammer'], ['armadura', 'armor', 'armour'],
    ['elmo', 'capacete', 'helmet'], ['manoplas', 'gauntlets'], ['botas', 'boots'],
    ['escudo', 'shield'], ['adaga', 'dagger'], ['poção', 'potion'],
    ['lenha', 'firewood'], ['picareta', 'pickaxe'], ['tocha', 'torch'],
    ['pão', 'bread'], ['lavanda', 'lavender'], ['trigo', 'wheat']
  ];
  const terms = new Map();
  for (const group of termGroups) {
    const normalized = group.map(normalize);
    for (const term of normalized) terms.set(term, normalized);
  }
  const stopWords = new Set(['a', 'as', 'o', 'os', 'de', 'do', 'da', 'dos', 'das', 'e', 'of', 'the']);
  function aliasesFor(name) { return groups.get(normalize(name)) || [String(name ?? '')]; }
  function alternateName(name) {
    const group = groups.get(normalize(name));
    if (!group) return '';
    return normalize(name) === normalize(group[0]) ? group[1] : group[0];
  }
  function matches(item, query, fields = []) {
    const q = normalize(query);
    if (!q) return true;
    const labels = [...aliasesFor(item.name), item.name, ...(Array.isArray(item.aliases) ? item.aliases : [])];
    const haystack = normalize([...labels, ...fields.map(field => item[field] || '')].join(' '));
    const tokens = q.split(' ').filter(token => !stopWords.has(token));
    return tokens.length ? tokens.every(token => (terms.get(token) || [token]).some(term => haystack.includes(term))) : haystack.includes(q);
  }
  return {normalize, aliasesFor, alternateName, matches};
})();
