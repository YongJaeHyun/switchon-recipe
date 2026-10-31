# Gemini 실제 사용량과 비용

출시 뒤 실제 데이터로 패스 가격·원가를 다시 보려고 Gemini 호출마다 `ai_usage`에 한 행을 남긴다
(마이그레이션 `20261101050000_pass_recipe_cap_and_ai_usage.sql`, 코드 `supabase/functions/_shared/aiUsage.ts`).

- 한 행 = Gemini 호출 한 번. `uid`(cron·백필은 null), `feature`, `model`, `input_tokens`, `output_tokens`(텍스트 출력만),
  `thinking_tokens`, `image_tokens`, `image_count`(응답 이미지 장수), `ok`, `status`
- 실패 응답도 `ok = false`, 0토큰으로 남는다. 재시도 중간 응답과 응답 없이 끝난 호출(시간 초과)은 남지 않는다
- 기록은 백그라운드로 하고 실패해도 유저 요청에는 영향이 없다 (엣지 함수 로그에 `[aiUsage]`)
- service role만 쓰고 읽는다. SQL 편집기에서 본다

## feature

| feature                                                            | 어디서                                        |
| ------------------------------------------------------------------ | --------------------------------------------- |
| `recipe_text`                                                      | 레시피 텍스트 (재료로 만들기·이름으로 만들기) |
| `recipe_image`                                                     | 레시피 대표 이미지                            |
| `recipe_name_check`                                                | 이름으로 만들기: 이름 판정                    |
| `food_check`                                                       | 먹어도 될까 판정                              |
| `inbody_read`                                                      | 인바디 결과지 읽기                            |
| `weekly_report`                                                    | 주간 리포트 (cron·패스 구매 뒤 보충)          |
| `report_on_demand`                                                 | 주간 리포트 직접 만들기·다시 만들기           |
| `recipe_tags` / `recipe_servings`                                  | 기존 레시피 태깅·인분 추정 백필               |
| `ingredient_judge` / `ingredient_image_check` / `ingredient_image` | 재료 요청 판단·사진 검증·이미지 생성          |

## 원화 비용

`ai_usage_cost(시작일, 끝일, 환율 = 1400)`이 KST 날짜·기능·모델별 호출 수와 비용을 돌려준다 (양끝 날짜 포함).
단가 (2026-11 공식 가격, USD):

| 모델                        | 입력 / 1M | 출력 / 1M             | 이미지           |
| --------------------------- | --------- | --------------------- | ---------------- |
| gemini-2.5-flash            | 0.30      | 2.50 (생각 토큰 포함) |                  |
| gemini-2.5-flash-lite       | 0.10      | 0.40                  |                  |
| gemini-3.1-flash-lite-image | 0.25      | 1.50 (텍스트)         | 0.0336 / 장 (1K) |

표에 없는 모델은 `usd`·`krw`가 비어 나온다 (함수의 `price` 값에 단가를 더한다).
구글 검색 그라운딩(`ingredient_judge`) 요금은 넣지 않았다.

```sql
-- 날짜·기능별
select * from public.ai_usage_cost('2026-11-01', '2026-11-30');

-- 환율을 바꿔서
select * from public.ai_usage_cost('2026-11-01', '2026-11-30', 1450);

-- 기능별 합계와 호출 1번당 평균
select feature,
       sum(calls) as calls,
       sum(krw) as krw,
       round(sum(krw) / nullif(sum(calls - failed), 0), 1) as krw_per_ok_call
from public.ai_usage_cost('2026-11-01', '2026-11-30')
group by feature
order by krw desc nulls last;

-- 레시피 1개 원가 (텍스트 + 이미지, 성공 호출 기준)
select round(sum(krw) filter (where feature in ('recipe_text', 'recipe_image'))
             / nullif(sum(calls - failed) filter (where feature = 'recipe_image'), 0), 1) as krw_per_recipe
from public.ai_usage_cost('2026-11-01', '2026-11-30');

-- 유저별 이번 달 비용 상위 (패스 1장 순수익 ≈ 3,790원과 비교)
select u.uid, count(*) as calls,
       round(sum(u.input_tokens * p.in_per_m / 1e6
                 + (u.output_tokens + u.thinking_tokens) * p.out_per_m / 1e6
                 + u.image_count * p.per_image) * 1400, 0) as krw
from public.ai_usage u
join (values ('gemini-2.5-flash', 0.30, 2.50, 0),
             ('gemini-2.5-flash-lite', 0.10, 0.40, 0),
             ('gemini-3.1-flash-lite-image', 0.25, 1.50, 0.0336))
  as p (model, in_per_m, out_per_m, per_image) on p.model = u.model
where u.uid is not null
  and u.created_at >= '2026-11-01 00:00+09' and u.created_at < '2026-12-01 00:00+09'
group by u.uid
order by krw desc
limit 20;
```
