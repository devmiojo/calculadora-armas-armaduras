export function calculate(recipe) {
    const materials = recipe.lines.reduce((sum, line) => sum + line.qty * line.price, 0);
    const labour = materials * (recipe.labourPct || 0) / 100;
    const total = materials + labour + recipe.extra;
    const unit = total / recipe.output;
    const raw = unit * (1 + recipe.markup / 100);
    const sale = Math.max(0, recipe.round ? Math.ceil((raw - 1e-9) / recipe.round) * recipe.round : raw);
    const profit = sale - unit;
    return {materials, labour, total, unit, sale, profit, margin: sale ? profit / sale * 100 : 0};
  }

  // Resolve ingredients first so price changes travel through every dependency.
export function recalculate(workshop) {
    const materials = new Map(workshop.materials.map(material => [material.id, material]));
    const recipes = new Map(workshop.recipes.map(recipe => [recipe.id, recipe]));
    const resolvedMaterials = new Set(), resolvedRecipes = new Set(), visiting = new Set();
    function enter(key, name) {
      if (visiting.has(key)) throw Error(`Há um ciclo de preços envolvendo “${name}”. Escolha outra receita ou use preço manual.`);
      visiting.add(key);
    }
    function materialPrice(material) {
      if (resolvedMaterials.has(material.id)) return material.price;
      const key = 'material:' + material.id;
      enter(key, material.name);
      const recipe = recipes.get(material.pricingRecipeId);
      if (recipe) material.price = recipePrice(recipe).sale;
      visiting.delete(key);
      resolvedMaterials.add(material.id);
      return material.price;
    }
    function recipePrice(recipe) {
      if (resolvedRecipes.has(recipe.id)) return calculate(recipe);
      const key = 'recipe:' + recipe.id;
      enter(key, recipe.name);
      for (const line of recipe.lines) {
        const material = materials.get(line.materialId);
        if (material && !line.manualPrice) {
          line.price = materialPrice(material);
          line.name = material.name;
          line.vendor = material.vendor;
        }
      }
      visiting.delete(key);
      resolvedRecipes.add(recipe.id);
      return calculate(recipe);
    }
    workshop.materials.forEach(materialPrice);
    workshop.recipes.forEach(recipePrice);
    return workshop;
  }
