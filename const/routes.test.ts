import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

// 하단 탭 재구성으로 옮긴 화면의 옛 경로가 코드에 남아 있지 않은지 확인한다.
const ROOT = join(__dirname, '..');
const SCAN_DIRS = ['app', 'components', 'hooks', 'utils', 'const'];
const OLD_ROUTES = [
  '/(tabs)/home/recipeCreation',
  '/(tabs)/recipes/recipeCreation',
  '/(tabs)/home/savedRecipes',
  // 탐색은 레시피 탭 안에 있다가 다시 따로 탭이 됐다
  '/(tabs)/recipes/explore',
  '/(tabs)/recipes/search',
];

function collectSourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return collectSourceFiles(path);
    if (!/\.tsx?$/.test(name) || /\.test\.tsx?$/.test(name)) return [];
    return [path];
  });
}

describe('옛 탭 경로', () => {
  const files = SCAN_DIRS.flatMap((dir) => collectSourceFiles(join(ROOT, dir)));

  it('소스 파일을 찾는다', () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const oldRoute of OLD_ROUTES) {
    it(`${oldRoute} 경로를 쓰지 않는다`, () => {
      const found = files.flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .flatMap((line, i) =>
            line.includes(oldRoute) ? [`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`] : []
          )
      );
      expect(found).toEqual([]);
    });
  }
});
