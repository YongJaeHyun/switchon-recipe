import 'dotenv/config';
import { describe, expect, it } from 'vitest';

const TIMEOUT_MS = 30000;
const geminiKey = process.env.GEMINI_API_KEY;

describe.skipIf(!geminiKey)('create recipe image', () => {
  it(
    'should generate recipe image',
    async () => {
      const imageRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-fast-generate-001:predict?key=${geminiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            instances: [
              {
                prompt: `Generate photo of the following foods taken with a macro lens of 100mm. name: 계란프라이`,
                sampleCount: 1,
              },
            ],
          }),
        }
      );

      if (!imageRes.ok) {
        const text = await imageRes.text();
        throw new Error(`Imagen 이미지 요청 실패 (${imageRes.status}): ${text}`);
      }

      const imageJson = await imageRes.json();

      const imageBase64 = imageJson?.predictions?.[0]?.bytesBase64Encoded;

      expect(imageBase64).toBeDefined();
    },
    TIMEOUT_MS
  );
});
