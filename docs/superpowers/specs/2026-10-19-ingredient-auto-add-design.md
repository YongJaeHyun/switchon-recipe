# 재료 요청 자동 추가 설계

- 작성일: 2026-10-19
- 상태: 초안 (승인 대기)

## 1. 배경과 목적

유저가 앱의 "찾으시는 재료가 없나요?"로 재료를 요청하면, 지금은 Slack 웹훅으로 알림만 오고 나머지는 전부 수작업이다.

1. 스위치온 다이어트에 맞는 재료인지, 몇 주차인지 인터넷/나무위키(금지 품목 등)로 직접 확인
2. Pixabay에서 어울리는 무료 이미지를 직접 찾아 다운로드
3. 이미지 파일, `const/assets.ts`, `const/ingredients.ts`, `const/notices.ts`(`newIngredients`)를 빠짐없이 수정 후 배포

운영자가 가장 귀찮아하는 건 **2(이미지 찾기)** 와 **3(여러 파일을 빠짐없이 수정)** 이다.

**목표 상태:** 재료 요청이 들어오면 사람 손을 거치지 않고, 적합한 재료는 앱에 자동으로 들어가 있다. 운영자는 결과를 Slack으로 받아보고, 잘못된 게 있으면 Supabase 대시보드에서 직접 고친다.

## 2. 목표 / 비목표 / 안티 목표

### 목표
- 요청 → 적합성/주차 판단 → 이미지 선정·검증 → 반영 → Slack 보고까지 완전 자동
- 앱 업데이트 없이 새 재료가 즉시 반영됨
- 판단 근거가 Slack 메시지에 남아 운영자가 사후 검토할 수 있음

### 비목표
- 별도 관리자 화면
- 기존 재료를 자동으로 수정·이름 변경·삭제하는 것

### 안티 목표 (기술적으로 동작해도 이렇게 되면 실패)
1. **이미지가 재료명과 맞지 않음.** 맞는 이미지를 못 찾으면 이상한 이미지로 넣느니 추가하지 않는다.
2. **이미 있는 재료와 사실상 중복.** (아래 4.3 규칙)
3. **실제로 그 스위치온 주차에 먹을 수 없는 재료가 들어감.**

## 3. 결정된 큰 방향

- **재료 데이터와 이미지를 앱 번들에서 Supabase(DB + Storage)로 옮긴다.** 운영자가 OTA/코드 자동 커밋 방식 대신 이 방식을 선택했다. 처음 한 번은 기존 재료 이전과 앱 업데이트 1회 배포가 필요하다는 점을 알고 동의했다.
- **AI는 Gemini를 쓴다.** 레시피 생성(`supabase/functions/create-recipe-by-gemini`)에 이미 쓰고 있다. (내 결정)
- **이미지는 Pixabay 우선, 없으면 AI 생성(Gemini 이미지 모델. Imagen 4가 API에서 제거되어 `gemini-3.1-flash-lite-image`로 변경, 장당 $0.0336)**. 운영자가 Pixabay를 고집하지 않는다고 했다. 실사 사진이 기존 이미지와 잘 어울리지만 한국 재료는 사진이 없는 경우가 많아서, 생성 이미지를 대안으로 둔다. Imagen은 `create-recipe-by-gemini`에서 같은 `GEMINI_API_KEY`로 이미 쓰고 있다. Unsplash와 Pexels는 원본 링크 사용이나 앱 내 출처 표시를 요구해서 뺐다. (내 결정)
- **결과 알림은 운영자 Slack으로만** 보낸다. 코드 패턴은 `notify-inquiry`를 따르되, 웹훅은 **새 시크릿 `INGREDIENT_SLACK_WEBHOOK_URL`** 을 쓴다. 기존 `SLACK_WEBHOOK_URL`은 문의 채널용이라 건드리지 않는다. 값은 지금 앱의 `EXPO_PUBLIC_SLACK_WEBHOOK_URL`과 같은 URL로 시작해, 재료 요청이 오던 채널에 그대로 보고가 온다. (내 결정)

## 4. 동작

### 4.1 전체 흐름

```
앱: 재료 요청 제출
  → ingredient_request 테이블에 insert (status = pending)
  → DB Webhook이 Edge Function `process-ingredient-request` 호출
      1. 중복/유사 검사 (4.3)
      2. 적합성·주차 판단 (4.4)
      3. 추가할 재료별 이미지 검색 → 검증 → 업로드 (4.5)
      4. ingredient 테이블에 insert
      5. ingredient_request 상태/결과 기록
      6. 운영자에게 Slack 보고 (4.6)
앱: 재료 목록을 DB에서 읽으므로 다음 조회부터 새 재료가 보임
```

- 앱은 더 이상 Slack 웹훅을 직접 호출하지 않는다. `EXPO_PUBLIC_SLACK_WEBHOOK_URL`을 앱에서 제거한다. 지금은 앱 번들에서 웹훅 주소를 뽑아낼 수 있는 상태다.
- 트리거 방식(DB Webhook vs 앱에서 Edge Function 직접 호출)은 빌더가 정한다. 기존 `notify-inquiry`가 쓰는 방식을 따르는 것을 기본으로 한다.

### 4.2 데이터 모델 (초안, 세부는 빌더 재량)

**`ingredient`**: 현재 `types/recipe.ts`의 `Ingredient`에 대응
| 컬럼 | 설명 |
|---|---|
| `id` | PK |
| `name` | 재료명, unique |
| `sub_keywords` | text[]. 검색용 별칭 (예: 시오콘부 → 염장다시마) |
| `week` | 1 / 2 / 3 (3 = "3주차 +") |
| `is_carbohydrate` | 탄수화물 여부. 무탄수 레시피에서 제외되는 기준 |
| `image_url` | Storage 공개 URL |
| `is_active` | 운영자가 대시보드에서 숨길 때 false로 바꿈. 삭제 대신 사용 |
| `source` | `seed`(기존 이전분) / `auto`(자동 추가) / `manual`(운영자가 대시보드에서 직접 추가) |
| `request_id` | 어떤 요청으로 추가됐는지 (auto만) |
| `ai_reason` | 판단 근거 요약 |
| `created_at` | 공지(`newIngredients`) 계산에 사용 |

**`ingredient_request`**: 요청 기록. 감사 로그와 중복 실행 방지용
| 컬럼 | 설명 |
|---|---|
| `id`, `uid`, `name`, `created_at` | |
| `status` | `pending` / `added` / `rejected` / `duplicate` / `failed` |
| `result` | jsonb. AI 판단 원문, 추가된 재료 목록, 오류 내용 등 |

**Storage 버킷 `ingredient-images`** (public). 이미지는 기존과 비슷한 크기의 JPEG로 리사이즈해서 저장한다(`imagescript`가 이미 쓰이고 있음).

RLS: 유저는 `ingredient` 읽기만(활성 재료), `ingredient_request`는 본인 것 insert만 가능하다. 쓰기는 Edge Function(service role)만 한다.

### 4.3 중복·유사 규칙

운영자와 합의한 규칙이다.

| 경우 | 예 | 처리 |
|---|---|---|
| 같은 재료, 표기만 다름 | 치아씨드 ↔ 치아시드 | 추가 안 함 (`duplicate`) |
| 이미 더 구체적인 재료가 있는데 포괄적인 재료 요청 | 소고기 있음 → "고기" 요청 | 추가 안 함 (`duplicate`) |
| 포괄적인 재료가 있는데 더 구체적인 재료 요청 | 닭고기 있음 → "닭다리살" 요청 | **기존 "닭고기"는 그대로 두고** 구체적인 재료를 추가 |
| 위 경우에 다이어트에 흔히 쓰는 다른 부위도 없음 | 닭가슴살·닭안심 등이 없다면 | **함께 추가** |

- 요청 하나로 여러 재료가 추가될 수 있다. 함께 추가되는 재료도 각각 4.4 판단과 4.5 이미지 검증을 똑같이 통과해야 한다. (내 결정)
- **일부만 통과한 경우에는 재료별로 처리한다.** 통과한 재료만 추가하고 실패한 재료는 Slack에 사유를 남긴다. 하나라도 추가되면 요청 상태는 `added`, 하나도 추가되지 않으면 `failed`다. 요청한 재료가 실패하고 함께 추가할 재료만 통과해도, 함께 추가할 재료는 독립적으로 검증됐으므로 추가한다. (내 결정)
- 기존 재료의 이름이나 데이터는 절대 바꾸지 않는다.
- 비교 대상은 비활성(`is_active = false`) 재료까지 포함한다. 운영자가 숨긴 재료를 다시 넣지 않기 위해서다. (내 결정)
- 정확히 일치하거나 `sub_keywords`에 있는 경우는 AI 호출 전에 코드로 거른다. 나머지는 전체 재료 목록을 AI에게 함께 주고 판단하게 한다.

### 4.4 적합성·주차 판단

운영자가 지금 하는 방식(인터넷 검색 + 나무위키 금지 품목 등)을 자동화한다.

- **기준 문서**: 스위치온 주차별 허용/금지 품목과 탄수화물 분류 규칙을 정리한 문서를 Edge Function과 함께 둔다(예: `supabase/functions/process-ingredient-request/rules.md`). AI는 이 문서와 Gemini의 Google Search grounding 결과를 함께 보고 판단한다.
  - 빌더가 나무위키와 공식 자료를 바탕으로 초안을 작성한다. 현재 `const/ingredients.ts`의 주차 배정도 기준 사례로 반영한다.
  - **배포 전에 운영자가 한 번 검토한다.**
- **AI 출력 (구조화 JSON)**: `decision`(add / reject / duplicate), `reason`(한국어 근거), 그리고 add인 경우 재료별로 `name`, `week`, `isCarbohydrate`, `subKeywords`, 이미지 검색용 영어 키워드.
- **재료명 정규화**: 앱에 보일 이름은 기존 재료와 같은 스타일로 정한다. (예: 띄어쓰기 없이, 일반적인 한국어 명칭)
- **확신이 낮으면 거절한다.** 안티 목표 3 때문에, 애매하면 넣지 않는 쪽으로 판단한다. 운영자는 Slack에서 거절 사유를 보고 필요하면 직접 추가할 수 있다. (내 결정)
- 음식이 아니거나 장난성/부적절한 입력도 거절한다.

### 4.5 이미지 선정과 검증

1. Pixabay API로 영어 키워드를 검색한다(사진만, safesearch). 결과가 부족하면 한국어 키워드로도 검색한다.
2. 상위 후보 몇 장을 Gemini(비전)로 하나씩 검증한다. 질문은 "이 사진이 '<재료명>'을 명확하게 보여주는가? 다른 재료가 주가 되거나, 요리된 완성 요리이거나, 텍스트/워터마크 위주가 아닌가?"이다.
3. 처음으로 통과한 후보를 쓴다.
4. **Pixabay 후보가 모두 탈락하면 Gemini 이미지 모델(`gemini-3.1-flash-lite-image`)로 생성한다.** 기존 재료 사진과 어울리도록 실사풍으로 만든다: 재료 하나만, 조리 전 상태, 단순한 배경, 자연광, 텍스트 없음. 생성 이미지도 2번 검증을 똑같이 통과해야 한다. 생성은 최대 2번 시도한다(수치는 빌더 재량).
5. 고른 이미지는 정사각형에 가깝게 크롭하고 리사이즈해서 업로드한다. 기존 재료 카드가 `objectFit: cover`로 보인다.
6. **생성 이미지까지 통과하지 못하면 그 재료는 추가하지 않는다.** 요청 상태는 `failed`, Slack에 "맞는 이미지 없음"으로 보고한다. (안티 목표 1)
7. `ingredient` 테이블에 `image_source`(`pixabay` / `generated` / `seed` / `manual`)를 기록하고, Slack 보고에도 표시한다. 운영자가 생성 이미지를 골라서 확인할 수 있게 하기 위해서다.

후보 수, 크기, 프롬프트 문구는 빌더 재량이다.

### 4.6 Slack 보고

운영자 채널 하나로 모든 결과를 보낸다.

- **추가됨**: 요청명, 추가된 재료(이름/주차/탄수화물 여부), 이미지 URL(미리보기)과 출처(Pixabay/생성), 판단 근거, 함께 추가된 재료가 있으면 그 이유
- **거절/중복**: 요청명, 사유, 중복이면 겹친 기존 재료명
- **실패**: 요청명, 실패 단계와 오류 내용 (Gemini/Pixabay 오류, 이미지 없음 등)

### 4.6.1 요청한 유저에게 결과 푸시 (2026-10-20 운영자 요청으로 추가)

- 처리가 끝나면 `notifications`에 한 줄을 넣고, 기존 `push` 함수가 발송한다. 채널은 `INGREDIENT`다.
- 추가됨: 추가된 재료 이름을 알리고 레시피 제작 화면으로 연결한다 (모두 비탄수화물이면 무탄수 화면, 아니면 저탄수 화면).
- 거절: 이유 한 줄을 함께 보낸다. 중복: 겹치는 기존 재료 이름, 없으면 "이미 검토된 재료"라고 보낸다.
- 처리 실패: 보내지 않는다 (운영자 재처리 후 결과를 보냄).
- 앱은 재료 요청을 제출할 때 푸시 권한을 요청한다.

### 4.6.2 Slack 롤백 / 다시 추가 버튼 (2026-10-20 운영자 요청으로 추가)

- 자동 추가 보고에 재료마다 [롤백] 버튼(확인 창 포함). 누르면 그 재료만 `is_active = false`(숨김), 메시지에 누가 언제 롤백했는지 남기고 버튼을 없앤다.
- 숨긴 재료를 다시 요청하면 AI에 다시 맡기지 않고 `rejected`로 처리한다. 유저에게는 "검토 결과 추가되지 않았어요", 운영자에게는 "🙈 숨긴 재료 재요청"과 [다시 추가] 버튼을 보낸다.
- 버튼은 Slack 앱 Interactivity → Edge Function `slack-ingredient-action`(verify_jwt = false, Slack 서명 검증, 5분 넘은 요청 거절)으로 처리한다.

### 4.7 남용 방지

- 앱의 기존 검증(빈 값, 미완성 한글, 최대 10자, 이미 있는 재료)은 유지한다. "이미 있는 재료" 검사는 DB 목록 기준으로 바꾼다.
- 같은 유저의 하루 요청 수를 제한한다(예: 5건). (내 결정, 수치는 빌더 재량)
- 같은 이름의 요청이 `pending`이거나 결과가 `added`/`duplicate`/`rejected`이면 AI를 다시 호출하지 않는다. `failed`(일시적 오류, 이미지 없음)는 다시 요청이 오면 재처리한다. (내 결정)
- **재처리 경로**: 운영자가 대시보드에서 요청의 `status`를 `pending`으로 바꾸면 다시 처리된다. 예를 들어 `rules.md`를 고친 뒤 예전 거절 건을 다시 돌릴 때 쓴다. 그래서 트리거는 insert뿐 아니라 `status`가 `pending`으로 바뀌는 update에도 반응해야 한다. (내 결정)

## 5. 앱 쪽 변경

### 5.1 재료 목록 읽기
- 현재 `const/ingredients.ts`, `const/zeroIngredients.ts`의 정적 배열을 쓰는 곳을 DB 조회(React Query) 결과로 바꾼다.
  - `app/(tabs)/home/recipeCreation/low.tsx`, `zero.tsx`
  - `components/recipeCreation/SelectedIngredient.tsx`, `IngredientRequest.tsx`
  - `components/common/WeekCompletePopup.tsx`
  - `app/index.tsx`의 `Asset.loadAsync(ingredientImages)` 프리로드 → `expo-image`의 prefetch/디스크 캐시로 대체
- 주차별 목록, 탄수화물 목록, 무탄수 목록 같은 파생 목록은 지금 로직(`week`, `isCarbohydrate` 기준)을 그대로 써서 클라이언트에서 계산한다.
- 오프라인이거나 로딩에 실패했을 때는 마지막으로 받은 목록을 쓰고, 없으면 재시도 UI를 보여준다. 구체적인 캐시 방식은 빌더 재량이다(`@react-native-async-storage/async-storage` 사용 가능).

### 5.2 저장된 선택 재료 호환
`selected_ingredient` 테이블에는 유저가 고른 재료가 **`image` 필드(번들 asset 번호)를 포함한 JSON**으로 저장돼 있다. 이전 후에는 이 `image`가 무의미해진다.
- 읽을 때 **이름으로 DB 재료와 다시 매칭**해서 `image_url` 등을 채운다. 더 이상 없거나 비활성인 재료는 빠진다.
- 저장할 때는 이름(필요하면 id)만 저장하도록 바꾸는 것을 권장한다. 최종 형태는 빌더 재량이다.

### 5.3 재료 요청 UI
- 제출하면 Slack 대신 `ingredient_request`에 insert한다.
- 안내 문구 "🕒 검토에는 최대 2일 정도 걸려요."와 "검토 후, 스위치온 다이어트에 적합한 재료라면 추가돼요."를 자동 처리에 맞게 바꾼다. 예: "잠시 후, 스위치온 다이어트에 적합한 재료라면 자동으로 추가돼요." 정확한 문구는 빌더 재량이다.

### 5.4 공지 (`newIngredients`)
- 지금은 `const/ingredients.ts`의 `newIngredients = { month, week, names }`를 손으로 고친다.
- 앞으로는 `source`가 `auto` 또는 `manual`이고 활성인 재료 중 가장 최근 `created_at`이 속한 "N월 N째 주"를 구하고, 그 주에 추가된 재료 이름들로 `latestNotices`의 재료 줄을 만든다. 주 계산 방식은 지금의 `seosusa(week)` 표기와 맞춘다.
- `allNotices`의 버전별 히스토리는 지금처럼 정적으로 둔다.

### 5.5 정리
- 이전이 끝나면 `assets/images/ingredients/`(약 18MB, 149개)와 `const/assets.ts`의 재료 항목, 정적 재료 배열을 제거한다. 앱 용량도 줄어든다.

## 6. 기존 데이터 이전 (1회)

- `const/ingredients.ts`를 읽어 각 재료의 이미지를 Storage에 올리고 `ingredient` 행을 만드는 일회성 스크립트를 `scripts/`에 둔다. 값은 `source = 'seed'`이고, `name`/`week`/`isCarbohydrate`/`subKeywords`를 그대로 옮긴다.
- 이전 결과를 검증한다: 개수가 같은지, 모든 이미지 URL이 열리는지.

## 7. 배포와 호환

- 앱 변경은 **스토어 빌드 1회**로 배포한다(`main` push → `eas-build-submit.yml`). 에셋 제거와 네이티브 의존성 여부를 보면 OTA로도 충분할 수 있다. 판단은 빌더 재량이다.
- 구버전 앱은 번들된 목록만 보므로 새 재료가 보이지 않는다. 앱에 업데이트 유도 기능(`useAutoUpdate`, 버전 체크)이 있으니 그걸로 충분하다고 본다. (내 판단)
- **구버전 앱의 재료 요청**: 구버전은 계속 Slack 웹훅으로 직접 보낸다. 웹훅을 바로 폐기하면 구버전 요청이 유실된다. 대부분 업데이트할 때까지 기존 웹훅을 유지하고, 그 뒤에 교체(rotate)한다. (내 결정)
- 배포 순서: DB/Storage/이전 스크립트 → Edge Function(+ 시크릿 `GEMINI_API_KEY`, `PIXABAY_API_KEY`, `SLACK_WEBHOOK_URL`) → 앱. `scripts/deployEdgeFunctions.sh`에 새 함수를 추가한다.

## 8. 검증

- **판단 품질 회귀 세트**: 정답이 확실한 사례 목록으로 Edge Function을 테스트한다(`supabase/functions/tests/integrations/`의 기존 방식). 예:
  - 기존 재료와 같은 표기/다른 표기 → duplicate
  - "고기"(소고기·돼지고기 존재) → duplicate
  - 포괄 재료만 있는 상태에서 구체 부위 요청 → 구체 부위 add (+ 흔한 부위 동반)
  - 라면, 케이크, 소주 등 명백한 금지 품목 → reject
  - 기존 `const/ingredients.ts`에서 무작위로 몇 개를 뺀 뒤 요청 → 원래 주차/탄수화물 여부와 일치
  - 음식이 아닌 입력 → reject
- **이미지 검증**: 위 add 사례에서 선택된 이미지를 사람이 한 번 훑어본다(배포 전 1회). Pixabay에 사진이 없을 만한 한국 재료(예: 꽈리고추, 시오콘부)를 일부러 넣어서 생성 이미지 결과도 확인한다.
- 앱: 재료 목록 표시, 무탄수/저탄수 필터, 검색(`subKeywords` 포함), 저장된 선택 재료 복원, 요청 제출이 이전 전과 똑같이 동작하는지 확인한다.

## 9. 사전 준비 (운영자가 해야 할 것)

- 수동 추가 시에는 이미지를 직접 Storage에 올리고 행을 `source = 'manual'`로 넣는다. 수동 추가를 돕는 별도 스크립트는 이번 범위에서 뺀다. (내 결정)

- Pixabay API 키 발급
- `rules.md` 초안 검토
- Supabase 시크릿 등록

## 10. 빌더 재량으로 남긴 것

트리거 방식, 테이블/컬럼 세부, 이미지 후보 수·크기·검증/생성 프롬프트·생성 재시도 횟수, 앱 캐시 방식, 선택 재료 저장 형태, 요청 제한 수치, 안내 문구, OTA vs 스토어 빌드.
