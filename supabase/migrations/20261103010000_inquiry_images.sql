-- 문의사항 사진 첨부 (최대 3장).
-- 앱이 inquiry-images 버킷의 {uid}/... 경로에 올리고, 경로를 inquiry.image_paths로 넣는다.
-- inquiry_notify 트리거가 row_to_json(NEW)를 보내므로 notify-inquiry는 새 열을 그대로 받는다.
-- 옛 앱은 이 열을 보내지 않으므로 기본값 '{}'로 들어간다.

alter table public.inquiry
  add column image_paths text[] not null default '{}';

alter table public.inquiry
  add constraint inquiry_image_paths_max_3 check (cardinality(image_paths) <= 3);

-- 문의 사진 저장소 (private). 경로: {uid}/{랜덤}.jpg. 5MB, JPEG·PNG·WebP만
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'inquiry-images',
  'inquiry-images',
  false,
  5 * 1024 * 1024,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "문의 사진은 본인 폴더에만 올리기"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'inquiry-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "문의 사진은 본인 폴더만 조회"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'inquiry-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
