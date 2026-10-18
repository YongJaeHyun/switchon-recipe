// seedIngredients.ts 전용: const/assets.ts의 require('...jpg')가 파일 경로를 반환하도록 함
for (const ext of ['.jpg', '.jpeg', '.png', '.webp']) {
  require.extensions[ext] = (module, filename) => {
    module.exports = filename;
  };
}
