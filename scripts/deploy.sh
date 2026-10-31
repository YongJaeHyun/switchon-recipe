# 스토어 빌드 후 Google Play alpha 트랙에 제출만 한다.
# 업데이트 안내(version.latest_version)는 Play Console에서 프로덕션 출시를 확인한 뒤
# scripts/announceUpdate.sh로 따로 켠다 (스토어에 없는데 안내가 뜨는 것을 막기 위해).
if eas build --platform android --profile production --auto-submit; then
  echo "✅ Build Success"
  echo "👉 Play Console에서 프로덕션 출시 후 ./scripts/announceUpdate.sh 를 실행하세요"
else
  echo "❌ Build failed"
fi
