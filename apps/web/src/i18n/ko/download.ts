// src/i18n/ko/download.ts — 한국어 다운로드 페이지 사전. 계약은
// en/download.ts 참조. APK 파일명, 패키지명, URL, 스토어 이름, 버전 문자열은
// 번역하지 않음.
import type en from '../en/download'

const download: typeof en = {
  metaTitle: '앱 다운로드',
  metaDescription:
    'Root My Android 다운로드 — 대표 클라이언트, 직접 APK. Apple App Store와 Google Play는 곧 출시. Rootz 및 Guardian Angel 프리뷰 APK도 계속 이용할 수 있습니다.',
  h1: '앱 다운로드',
  tagline:
    '직접 APK 다운로드 — 대표 클라이언트는 롤링 빌드로 제공되며, 아래에서 v1.0.0 프리뷰 앱을 계속 이용할 수 있습니다.',
  heroCta: '최신 빌드 다운로드',
  heroInstall: '설치 방법',
  heroArtAlt:
    'Root My Android SU 슈퍼히어로 — 빨간 망토를 두른 초록 안드로이드 로봇이 빛나는 노란 다이아몬드를 들고 있고, 주위에 세 개의 앱 타일이 떠 있습니다',
  trustAndroid: 'Android 7.0+',
  trustSigned: '서명된 APK',
  trustFree: '무료 스캔 코어, 계정 불필요',
  featuredEyebrow: '대표 클라이언트',
  featuredStatus: 'master의 롤링 빌드 — CI 실행마다 새로운 APK',
  featuredArtAlt:
    'Root My Android SU 슈퍼히어로 — 빨간 망토와 노란 SU 가슴 방패를 두른 초록 안드로이드 로봇',
  appStoreName: 'Apple App Store',
  playStoreName: 'Google Play',
  comingSoon: '곧 출시',
  appsH2: '세 개의 앱, 하나의 다운로드 페이지',
  appsNote: '모든 APK는 직접 설치됩니다 — 스토어 계정이 필요하지 않습니다.',
  downloadCta: '다운로드',
  packageLabel: '패키지',
  featuredBadge: '최신 빌드',
  rootzBadge: '롤링 프리뷰',
  guardianBadge: 'v1.0.0 프리뷰',
  featuredPoint1: 'ADB를 통한 읽기 전용 기기 스캔',
  featuredPoint2: '계정으로 암호화된 백업',
  featuredPoint3: '페어링된 Guardian 기기와 도구',
  rootzPoint1: '무선 ADB 페어링 및 셸',
  rootzPoint2: '비루팅 폰의 릴레이 데몬',
  rootzPoint3: '터미널 편집기와 로그 분석(Pro)',
  guardianPoint1: '사용 통계와 광고 차단',
  guardianPoint2: '메시지 및 통화 기록 모니터링',
  guardianPoint3: '계정당 최대 5대 기기',
  rootzH2: 'Rootz',
  rootzArtAlt: 'Su 대령 — 흰 수염과 둥근 안경, 차콜색 로브를 입고 노란 SU 다이아몬드가 달린 지팡이를 든 나이 든 초록 안드로이드 로봇',
  guardianH2: 'Guardian Angel',
  guardianArtAlt: 'Guardian Angel — 얇은 금색 후광을 쓴 초록 안드로이드 로봇',
  startH2: '어떤 빌드를 선택할지 모르시겠나요?',
  startP: '브라우저에서 무료 스캔으로 시작하세요 — 설치도 계정도 필요 없습니다.',
  startCta: '무료 스캔 열기',
  installH2: '설치',
  installStep1: 'Android 기기에서 APK를 다운로드하세요.',
  installStep2Before: '열고 Android가 묻을 때 브라우저에 대해 ',
  installStep2Strong: '알 수 없는 앱 설치',
  installStep2After: '를 허용하세요.',
  installStep3Before: '',
  installStep3Strong: '설치',
  installStep3After: '를 탭하세요.',
  verifyH3: '다운로드한 파일 확인',
  verifyP:
    '모든 APK는 서명되어 있습니다. 대표 빌드는 현재 업로드 키를, v1.0.0 프리뷰는 이전 프리뷰 키를 사용합니다.',
  verifyCurrent: '현재 업로드 키(SHA-256)',
  verifyLegacy: 'v1.0.0 프리뷰 키(SHA-256)',
  verifyNote: 'apksigner 또는 파일 관리자로 서명 인증서를 위 지문과 비교하세요.',
  requiresBefore: 'Android 7.0(API 24) 이상이 필요합니다. 각 APK의 서명을 위 지문과 비교하거나 다음을 확인하세요: ',
  requiresLink: '릴리스 노트',
  requiresAfter: '.',
  previewNote:
    '이것은 프리뷰 빌드입니다 — 제품 기능이 출시되고 있습니다. 무료 버전은 기본 스캔 및 문서를 포함합니다.',
  sideloadTitle: '사이드로드하기 전에',
  sideloadApp: '다운로드 중',
  sideloadStep1: '‘계속해서 다운로드’를 누르세요 — APK가 다운로드 폴더에 저장됩니다.',
  sideloadStep2: 'Android에서 출처 불명 앱을 묻습니다: 브라우저의 설치를 허용하세요(1회만).',
  sideloadStep3: '알림이나 다운로드 앱에서 APK를 열고 ‘설치’를 누르세요.',
  sideloadNote:
    '대표 APK는 현재 업로드 키로, v1.0.0 프리뷰는 이전 프리뷰 키로 서명되었습니다. Android는 서명이 바뀐 업데이트를 거부합니다 — 이전 앱을 먼저 제거하세요.',
  sideloadContinue: '계속해서 다운로드',
  sideloadCancel: '취소',
}

export default download
