export type Week = 1 | 2 | 3;
export type RequestStatus = 'pending' | 'added' | 'rejected' | 'duplicate' | 'failed';
export type ImageSource = 'pixabay' | 'generated';

export interface ExistingIngredient {
  id?: number;
  name: string;
  subKeywords: string[];
  week: Week;
  isCarbohydrate: boolean;
  isActive: boolean;
}

export interface CandidateIngredient {
  name: string;
  week: Week;
  isCarbohydrate: boolean;
  subKeywords: string[];
  imageQueryEn: string;
  reason: string;
}

export type Judgement =
  | { decision: 'add'; reason: string; ingredients: CandidateIngredient[] }
  | { decision: 'reject'; reason: string }
  | { decision: 'duplicate'; reason: string; matchedName: string };

export interface IngredientOutcome {
  candidate: CandidateIngredient;
  status: 'added' | 'failed';
  imageUrl?: string;
  imageSource?: ImageSource;
  ingredientId?: number;
  error?: string;
}

export interface ProcessReport {
  requestName: string;
  status: Exclude<RequestStatus, 'pending'>;
  reason: string;
  matchedName?: string;
  // 운영자가 숨긴(롤백한) 재료를 다시 요청한 경우
  hiddenIngredient?: { id: number; name: string };
  outcomes: IngredientOutcome[];
  error?: string;
}

export interface RequestRecord {
  id: number;
  uid?: string;
  name: string;
  normalized_name: string;
  status: RequestStatus;
  created_at: string;
}

export interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  record: RequestRecord | null;
  old_record: RequestRecord | null;
}
