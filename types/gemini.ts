export interface GeminiResponse {
  candidates: Candidates[];
}

interface Candidates {
  content: Parts;
  finishReason: string;
  index: number;
}

interface Parts {
  parts: Part[];
}
interface Part {
  text: string;
}
