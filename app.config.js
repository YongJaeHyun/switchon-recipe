import 'dotenv/config';
import semver from 'semver';

const APP_VERSION = '2.0.0';
const APP_MAJOR_VERSION = `v${semver.major(APP_VERSION)}`;

const appEnv = process.env.APP_ENV || 'production';

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
