import 'dotenv/config';
import semver from 'semver';
import { APP_VERSION } from './const/const.js';

const APP_MAJOR_VERSION = `v${semver.major(APP_VERSION)}`;

const appEnv = process.env.APP_ENV || 'production';

// AdMob 안드로이드 앱 ID: 개발은 Google 테스트 앱 ID.
// 운영 앱 ID와 const/ads.ts의 운영 보상형 광고 단위 ID는 반드시 함께 바꾼다.
const ADMOB_TEST_ANDROID_APP_ID = 'ca-app-pub-3940256099942544~3347511713';
const ADMOB_PRODUCTION_ANDROID_APP_ID = 'ca-app-pub-3149926343798483~2482822909';
const admobAndroidAppId =
  appEnv === 'development' ? ADMOB_TEST_ANDROID_APP_ID : ADMOB_PRODUCTION_ANDROID_APP_ID;

export default {
  expo: {
    name: appEnv === 'development' ? '스위치온 레시피 개발용' : '스위치온 레시피',
    slug: 'switchon-recipe',
    version: APP_VERSION,
    runtimeVersion: APP_MAJOR_VERSION,
    scheme: 'switchon-recipe',
    githubUrl: 'https://github.com/YongJaeHyun/switchon-recipe',
    experiments: {
      typedRoutes: true,
    },
    web: {
      bundler: 'metro',
    },
    plugins: [
      [
        '@react-native-kakao/core',
        {
          nativeAppKey: process.env.EXPO_PUBLIC_KAKAO_API_KEY ?? '',
          android: {
            forwardKakaoLinkIntentFilterToMainActivity: true,
            authCodeHandlerActivity: true,
          },
        },
      ],
      [
        'expo-build-properties',
        {
          android: {
            extraMavenRepos: ['https://devrepo.kakao.com/nexus/content/groups/public/'],
          },
        },
      ],
      [
        'expo-font',
        {
          fonts: [
            './assets/fonts/PretendardVariable-Regular.ttf',
            'node_modules/@expo-google-fonts/roboto/500Medium/Roboto_500Medium.ttf',
          ],
        },
      ],
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/splash.png',
          resizeMode: 'cover',
          backgroundColor: '#ffffff',
          imageWidth: 190,
          android: {
            adaptiveIcon: {
              foregroundImage: './assets/adaptive-icon.png',
              backgroundColor: '#ffffff',
            },
          },
        },
      ],
      'expo-font',
      'expo-build-properties',
      'expo-notifications',
      'expo-iap',
      // 냉장고 사진으로 재료 고르기(추후 OTA로 배포)용 네이티브 모듈
      [
        'expo-image-picker',
        {
          photosPermission: '냉장고 사진으로 재료를 고르기 위해 사진·카메라 접근이 필요해요.',
          cameraPermission: '냉장고 사진으로 재료를 고르기 위해 사진·카메라 접근이 필요해요.',
          // 사진만 쓰므로 동영상 녹화용 마이크(RECORD_AUDIO) 권한은 막는다
          microphonePermission: false,
        },
      ],
      ['react-native-google-mobile-ads', { androidAppId: admobAndroidAppId }],
    ],
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    splash: {
      image: './assets/splash.png',
      resizeMode: 'contain',
      backgroundColor: '#ffffff',
    },
    assets: ['./assets/fonts/'],
    assetBundlePatterns: ['**/*'],
    android: {
      package:
        appEnv === 'development'
          ? 'com.dltjrrbs2020.switchonrecipe.dev'
          : 'com.dltjrrbs2020.switchonrecipe',
      adaptiveIcon: {
        foregroundImage: './assets/icon.png',
        backgroundColor: '#ffffff',
      },
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON,
      edgeToEdgeEnabled: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '6e4add71-7b1c-405b-845c-0cc15fa653e7',
      },
    },
    owner: 'dltjrrbs2020',
    updates: {
      url: 'https://u.expo.dev/6e4add71-7b1c-405b-845c-0cc15fa653e7',
    },
  },
};
