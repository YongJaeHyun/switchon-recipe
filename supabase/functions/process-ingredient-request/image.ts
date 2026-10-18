import type { CandidateIngredient, ImageSource } from './types.ts';

const MAX_PIXABAY_CANDIDATES = 5;
const MIN_ENGLISH_HITS = 3;
const MAX_GENERATIONS = 2;

export interface PixabayHit {
  id: number;
  largeImageURL: string;
  webformatURL: string;
  tags: string;
}

interface ImageData {
  bytes: Uint8Array;
  mimeType: string;
}

export interface FoundImage extends ImageData {
  source: ImageSource;
}

export interface ImageDeps {
  search(query: string, lang: 'en' | 'ko'): Promise<PixabayHit[]>;
  download(url: string): Promise<ImageData>;
  verify(image: ImageData, ingredientName: string): Promise<{ matches: boolean; reason: string }>;
  generate(ingredientName: string, imageQueryEn: string): Promise<ImageData>;
}

const searchCandidates = async (candidate: CandidateIngredient, deps: ImageDeps) => {
  const hits = [...(await deps.search(candidate.imageQueryEn, 'en'))];
  if (hits.length < MIN_ENGLISH_HITS) hits.push(...(await deps.search(candidate.name, 'ko')));

  const unique = hits.filter((hit, index) => hits.findIndex((h) => h.id === hit.id) === index);
  return unique.slice(0, MAX_PIXABAY_CANDIDATES);
};

const verifySafely = async (image: ImageData, name: string, deps: ImageDeps) => {
  try {
    return (await deps.verify(image, name)).matches;
  } catch (error) {
    console.error(`[image] 검증 실패 (${name}):`, error);
    return false;
  }
};

export const findIngredientImage = async (
  candidate: CandidateIngredient,
  deps: ImageDeps
): Promise<FoundImage | null> => {
  for (const hit of await searchCandidates(candidate, deps)) {
    try {
      const image = await deps.download(hit.largeImageURL);
      if (await verifySafely(image, candidate.name, deps)) return { ...image, source: 'pixabay' };
    } catch (error) {
      console.error(`[image] Pixabay 이미지 다운로드 실패 (${hit.id}):`, error);
    }
  }

  for (let i = 0; i < MAX_GENERATIONS; i++) {
    try {
      const image = await deps.generate(candidate.name, candidate.imageQueryEn);
      if (await verifySafely(image, candidate.name, deps)) return { ...image, source: 'generated' };
    } catch (error) {
      console.error(`[image] 이미지 생성 실패 (${candidate.name}):`, error);
    }
  }

  return null;
};

const toBase64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
};

const fromBase64 = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));

const geminiUrl = (model: string, method: string, apiKey: string) =>
  `https://generativelanguage.googleapis.com/v1beta/models/${model}:${method}?key=${apiKey}`;

const postJson = async (url: string, body: unknown, label: string) => {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${label} 실패 (${res.status}): ${await res.text()}`);
  return res.json();
};

const verifyPrompt = (name: string) => `이 사진이 음식 재료 "${name}"을(를) 명확하게 보여주는지 판단하세요.
다음 중 하나라도 해당하면 matches는 false입니다.
- "${name}"이(가) 사진의 주인공이 아니거나 다른 재료가 주로 보임
- 재료가 아니라 조리된 완성 요리 사진임
- 텍스트, 로고, 워터마크가 주로 보임
- "${name}"과(와) 비슷하지만 다른 재료임
reason은 한국어 한 문장으로 쓰세요.`;

const generatePrompt = (name: string, queryEn: string) =>
  `A realistic food photo of a single raw ingredient: ${queryEn} (Korean name: ${name}). ` +
  'Uncooked, whole ingredient as the clear main subject, centered, simple bright plain background, ' +
  'soft natural light, square composition, no text, no logo, no other foods.';

export const createImageDeps = ({
  pixabayKey,
  geminiKey,
}: {
  pixabayKey: string;
  geminiKey: string;
}): ImageDeps => ({
  search: async (query, lang) => {
    const params = new URLSearchParams({
      key: pixabayKey,
      q: query,
      image_type: 'photo',
      safesearch: 'true',
      per_page: '10',
      lang,
    });
    const res = await fetch(`https://pixabay.com/api/?${params}`);
    if (!res.ok) throw new Error(`Pixabay 검색 실패 (${res.status}): ${await res.text()}`);
    return ((await res.json()).hits ?? []) as PixabayHit[];
  },

  download: async (url) => {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`이미지 다운로드 실패 (${res.status})`);
    return {
      bytes: new Uint8Array(await res.arrayBuffer()),
      mimeType: res.headers.get('content-type') ?? 'image/jpeg',
    };
  },

  verify: async (image, name) => {
    const json = await postJson(
      geminiUrl('gemini-2.5-flash', 'generateContent', geminiKey),
      {
        contents: [
          {
            role: 'user',
            parts: [
              { inline_data: { mime_type: image.mimeType, data: toBase64(image.bytes) } },
              { text: verifyPrompt(name) },
            ],
          },
        ],
        generationConfig: {
          temperature: 0,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: { matches: { type: 'BOOLEAN' }, reason: { type: 'STRING' } },
            required: ['matches', 'reason'],
          },
        },
      },
      'Gemini 이미지 검증'
    );
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '{}';
    const { matches, reason } = JSON.parse(text);
    return { matches: matches === true, reason: String(reason ?? '') };
  },

  generate: async (name, queryEn) => {
    const json = await postJson(
      geminiUrl('imagen-4.0-fast-generate-001', 'predict', geminiKey),
      {
        instances: [{ prompt: generatePrompt(name, queryEn) }],
        parameters: { sampleCount: 1, aspectRatio: '1:1' },
      },
      'Imagen 이미지 생성'
    );
    const base64 = json?.predictions?.[0]?.bytesBase64Encoded;
    if (!base64) throw new Error('Imagen 이미지 생성 결과 없음');
    return { bytes: fromBase64(base64), mimeType: 'image/png' };
  },
});
