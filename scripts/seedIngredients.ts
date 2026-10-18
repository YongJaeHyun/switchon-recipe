// 앱 번들의 기존 재료를 Supabase(ingredient 테이블 + ingredient-images 버킷)로 옮기는 일회성 스크립트
// 실행: npx tsx --require ./scripts/registerAssetRequire.cjs scripts/seedIngredients.ts [--dry-run | --verify]
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  firstWeekIngredients,
  secondWeekIngredients,
  thirdWeekIngredients,
} from '../const/ingredients';

const BUCKET = 'ingredient-images';
const mode = process.argv.includes('--dry-run')
  ? 'dry-run'
  : process.argv.includes('--verify')
    ? 'verify'
    : 'seed';

const ingredients = [...firstWeekIngredients, ...secondWeekIngredients, ...thirdWeekIngredients];

const dryRun = () => {
  const names = ingredients.map((i) => i.name);
  const duplicates = names.filter((name, index) => names.indexOf(name) !== index);
  const missing = ingredients.filter((i) => !existsSync(i.image)).map((i) => i.name);

  console.log(
    `ingredients: ${ingredients.length}, duplicates: ${duplicates.length}, missing images: ${missing.length}`
  );
  if (duplicates.length) console.log('duplicates:', duplicates.join(', '));
  if (missing.length) console.log('missing:', missing.join(', '));
  return duplicates.length === 0 && missing.length === 0;
};

const createSupabase = () => {
  const url = process.env.SUPABASE_URL ?? process.env.EXPO_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('.env에 SUPABASE_URL과 SUPABASE_SERVICE_ROLE_KEY가 필요해요.');
  return createClient(url, key);
};

const seed = async () => {
  const supabase = createSupabase();

  for (const [index, ingredient] of ingredients.entries()) {
    const path = `seed/${basename(ingredient.image)}`;
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, readFileSync(ingredient.image), { contentType: 'image/jpeg', upsert: true });
    if (uploadError) throw new Error(`${ingredient.name} 업로드 실패: ${uploadError.message}`);

    const { error } = await supabase.from('ingredient').upsert(
      {
        name: ingredient.name,
        sub_keywords: ingredient.subKeywords ?? [],
        week: ingredient.week,
        is_carbohydrate: ingredient.isCarbohydrate ?? false,
        image_url: supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl,
        image_source: 'seed',
        source: 'seed',
        sort_order: index,
      },
      { onConflict: 'name' }
    );
    if (error) throw new Error(`${ingredient.name} 저장 실패: ${error.message}`);
  }

  console.log(`seeded ${ingredients.length}`);
};

const verify = async () => {
  const supabase = createSupabase();
  const { data, error } = await supabase
    .from('ingredient')
    .select('name, image_url')
    .eq('source', 'seed');
  if (error) throw error;

  const failed: string[] = [];
  for (const row of data) {
    const res = await fetch(row.image_url, { method: 'HEAD' });
    if (!res.ok) failed.push(`${row.name} (${res.status})`);
  }

  console.log(`verified ${data.length}, failed ${failed.length}`);
  if (failed.length) console.log(failed.join('\n'));
  return data.length === ingredients.length && failed.length === 0;
};

const main = async () => {
  if (mode === 'dry-run') process.exit(dryRun() ? 0 : 1);
  if (mode === 'verify') process.exit((await verify()) ? 0 : 1);
  if (!dryRun()) process.exit(1);
  await seed();
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
