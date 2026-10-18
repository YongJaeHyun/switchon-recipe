// 서버(process-ingredient-request의 normalizeName)와 같은 규칙: 모든 공백 제거
export const normalizeIngredientName = (name: string) => name.trim().replace(/\s/g, '');
