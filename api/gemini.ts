import { GeminiResponse, Recipe } from 'types/gemini';
import gemini from '../lib/axiosInstance';

export const fetchGemini = async (message: string): Promise<Recipe> => {
  const res = await gemini.post<GeminiResponse>('/models/gemini-2.5-flash:generateContent', {
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          recipeName: { type: 'STRING' },
          cookingTime: { type: 'STRING' },
          nutrition: {
            type: 'OBJECT',
            properties: {
              carbohydrates: { type: 'STRING' },
              protein: { type: 'STRING' },
              fat: { type: 'STRING' },
              fiber: { type: 'STRING' },
              sugar: { type: 'STRING' },
            },
          },
          ingredients: {
            type: 'ARRAY',
            items: { type: 'STRING' },
          },
        },
      },
    },
    system_instruction: {
      parts: [
        {
          text: '너는 요리 레시피를 생성하는 데 특화된 AI 어시스턴트야. 사용자가 요리 레시피를 요청하면, 그에 맞는 레시피를 생성해줘. 응답은 항상 한국어로 해야해.',
        },
      ],
    },
    contents: [
      {
        parts: [
          {
            text: message,
          },
        ],
      },
    ],
  });

  return JSON.parse(res.data.candidates[0].content.parts[0].text);
};
