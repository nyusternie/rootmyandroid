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
  featuredEyebrow: '대표 클라이언트',
  featuredTitle: 'Root My Android',
  featuredDescAfter: ' — 클라이언트: 기기 스캔, 페어링된 Guardian 기기, 암호화된 백업 및 도구.',
  featuredStatus: 'master의 롤링 빌드 — CI 실행마다 새로운 APK',
  featuredLink: 'rootmyandroid-release.apk 다운로드',
  featuredNote:
    'master의 롤링 UI/UX 반복 빌드(롤링 태그 android-apk)로, 공개 디버그 키로 서명되었습니다 — 검토 전용 빌드이며 프로덕션이 아닙니다. 업로드 키로 서명된 설치 위에 업데이트할 수 없습니다(먼저 제거하세요).',
  featuredArtAlt:
    'Root My Android SU 슈퍼히어로 — 빨간 망토와 노란 SU 가슴 방패를 두른 초록 안드로이드 로봇',
  appStoreName: 'Apple App Store',
  playStoreName: 'Google Play',
  comingSoon: '곧 출시',
  secondaryHeading: '더 많은 다운로드',
  secondaryNote: 'Rootz와 Guardian Angel은 APK 사이드로드로 설치합니다.',
  rootzH2: 'Rootz',
  rootzDescAfter: ' — 기기 분석 앱(v1.0.0 프리뷰).',
  rootzLink: 'rooted-release.apk 다운로드',
  guardianH2: 'Guardian Angel',
  guardianDescAfter: ' — 동반자 모니터링 앱(v1.0.0 프리뷰).',
  guardianLink: 'guardian-release.apk 다운로드',
  guardianArtAlt: 'Guardian Angel — 얇은 금색 후광을 쓴 초록 안드로이드 로봇',
  installH2: '설치',
  installStep1: 'Android 기기에서 APK를 다운로드하세요.',
  installStep2Before: '열고 Android가 묻을 때 브라우저에 대해 ',
  installStep2Strong: '알 수 없는 앱 설치',
  installStep2After: '를 허용하세요.',
  installStep3Before: '',
  installStep3Strong: '설치',
  installStep3After: '를 탭하세요.',
  requiresBefore:
    'Android 7.0(API 24) 이상이 필요합니다. Rootz 및 Guardian Angel APK는 저희 업로드 키로 서명되어 있습니다; ',
  requiresLink: '릴리스 노트',
  requiresAfter: '에서 서명과 체크섬을 확인할 수 있습니다.',
  previewNote:
    '이것은 프리뷰 빌드입니다 — 제품 기능이 출시되고 있습니다. 무료 버전은 기본 스캔 및 문서를 포함합니다.',
}

export default download
