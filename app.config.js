import 'dotenv/config';

module.exports = {
  expo: {
    name: '스위치온 레시피',
    slug: 'switchon-recipe',
    version: '1.0.0',
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
          fonts: ['node_modules/@expo-google-fonts/roboto/500Medium/Roboto_500Medium.ttf'],
        },
      ],
      'expo-router',
      [
        'expo-splash-screen',
        {
          image: './assets/splash.png',
          resizeMode: 'cover',
          backgroundColor: '#fff',
          imageWidth: 190,
          android: {
            adaptiveIcon: {
              foregroundImage: './assets/adaptive-icon.png',
              backgroundColor: '#fff',
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
    assetBundlePatterns: ['**/*'],
    ios: {
      supportsTablet: true,
    },
    android: {
      package: 'com.dltjrrbs2020.switchonrecipe',
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
    runtimeVersion: {
      policy: 'appVersion',
    },
    updates: {
      url: 'https://u.expo.dev/6e4add71-7b1c-405b-845c-0cc15fa653e7',
    },
  },
};
