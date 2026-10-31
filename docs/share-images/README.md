# 카톡 공유 이미지

`const/kakaoTemplates.ts`의 `shareImageUrl`이 가리키는 이미지 (Supabase 공개 버킷 `share-images/v1/`).

다시 만들기: 이 폴더에 `font.ttf`(assets/fonts/PretendardVariable-Regular.ttf)와 `icon.png`(assets/icon.png)를 복사하고
`python3 gen.py`로 HTML을 만든 뒤, 크롬 headless로 800×400 @2x 스크린샷을 찍는다.

```
chrome --headless=new --hide-scrollbars --force-device-scale-factor=2 --window-size=800,400 --screenshot=out.png file://.../name.html
```

이미지를 바꾸면 `v2/`처럼 새 폴더에 올리고 `SHARE_IMAGE_BASE`를 바꾼다 (카톡이 이미지 주소별로 캐시한다).
