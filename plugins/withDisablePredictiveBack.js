const { withAndroidManifest } = require('expo/config-plugins');

// Android 16(API 36) 타겟에서는 예측 뒤로 가기가 기본으로 켜져 onBackPressed가 호출되지 않는다.
// RN 0.79는 OnBackInvokedCallback을 등록하지 않아 뒤로 가기 시 화면이 아니라 앱이 닫히므로 끈다.
module.exports = function withDisablePredictiveBack(config) {
  return withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    if (application) application.$['android:enableOnBackInvokedCallback'] = 'false';
    return config;
  });
};
