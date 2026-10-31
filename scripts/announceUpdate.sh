# 프로덕션 출시가 확인된 뒤 실행: DB version.latest_version을 지금 앱 버전으로 바꿔
# 이전 major 사용자에게 스토어 업데이트 안내를 띄운다.
node ./scripts/updateVersion.js
