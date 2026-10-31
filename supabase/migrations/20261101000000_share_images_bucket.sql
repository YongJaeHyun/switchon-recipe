-- 카톡 공유 이미지 저장소 (공개). 경로: v1/{name}.png (const/kakaoTemplates.ts shareImageUrl)
-- 앱은 공개 주소로 읽기만 한다. 업로드는 운영자가 직접 (쓰기 정책 없음)
insert into storage.buckets (id, name, public)
values ('share-images', 'share-images', true)
on conflict (id) do nothing;
