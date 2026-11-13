// src/i18n/ko/download.ts — 한국어 다운로드 페이지 사전. 계약은
// en/download.ts 참조. APK 파일명, 패키지명, URL, 버전 문자열은 번역하지
// 않음.
import type en from '../en/download'

const download: typeof en = {
  metaTitle: '앱 다운로드',
  metaDescription: 'Rootz 및 Guardian Angel Android 앱 다운로드 — 최신 프리뷰 릴리스의 직접 APK 다운로드.',
  h1: '앱 다운로드',
  tagline: '프리뷰 릴리스 v1.0.0 — 직접 APK 다운로드, 항상 최신 릴리스를 가리킵니다.',
  rootzH2: 'Rootz',
  rootzDescAfter: ' — 기기 분석 앱.',
  rootzLink: 'rooted-release.apk 다운로드',
  guardianH2: 'Guardian Angel',
  guardianDescAfter: ' — 동반자 모니터링 앱.',
  guardianLink: 'guardian-release.apk 다운로드',
  androidH2: 'Root My Android (Android 에디션)',
  androidDescAfter: ' — 기기 스캔, 페어링된 Guardian 기기, 암호화된 백업 및 도구.',
  androidLink: 'rootmyandroid-release.apk 다운로드',
  androidNote: 'master의 롤링 UI/UX 반복 빌드(롤링 태그 android-apk)로, 공개 디버그 키로 서명되었습니다 — 검토 전용 빌드이며 프로덕션이 아닙니다. 업로드 키로 서명된 설치 위에 업데이트할 수 없습니다(먼저 제거하세요).',
  installH2: '설치',
  installStep1: 'Android 기기에서 APK를 다운로드하세요.',
  installStep2Before: '열고 Android가 묻을 때 브라우저에 대해 ',
  installStep2Strong: '알 수 없는 앱 설치',
  installStep2After: '를 허용하세요.',
  installStep3Before: '',
  installStep3Strong: '설치',
  installStep3After: '를 탭하세요.',
  requiresBefore: 'Android 7.0(API 24) 이상이 필요합니다. Rootz 및 Guardian Angel APK는 저희 업로드 키로 서명되어 있습니다; ',
  requiresLink: '릴리스 노트',
  requiresAfter: '에서 서명과 체크섬을 확인할 수 있습니다.',
  previewNote: '이것은 프리뷰 빌드입니다 — 제품 기능이 출시되고 있습니다. 무료 버전은 기본 스캔 및 문서를 포함합니다.',
}

export default download
