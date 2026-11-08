// src/i18n/ko/common.ts — 한국어 chrome 사전. 계약과 용어집은 en/common.ts 참조
// (브랜드명·제품명·요금제명·서드파티 명칭·명령어/경로·가격은 번역하지 않음).
import type en from '../en/common'

const common: typeof en = {
  metaDescription:
    'Root My Android — 브라우저에서 Android 기기를 스캔하고 루팅 / 업그레이드 계획을 받으세요. 이메일도 비밀번호도 필요 없습니다. 간단한 선불 구독.',
  navGuides: '가이드',
  navRoms: '롬',
  navGurus: 'Gurus',
  navScan: '지금 스캔',
  langLabel: '언어',
  footerTagline:
    'Android 기기를 스캔하고 루팅 / 업그레이드 계획을 받으세요. 이메일도 비밀번호도 필요 없습니다.',
  footerProduct: '제품',
  footerLegal: '법적 정보',
  footerScan: '스캔',
  footerGuides: '가이드',
  footerWhy: '왜 루팅하나요?',
  footerRoms: '롬',
  footerDevices: '기기',
  footerRootz: 'Rootz',
  footerGa: 'Guardian Angel',
  footerGurus: 'Gurus',
  footerParents: '학부모용',
  footerAgents: 'AI 에이전트용',
  footerMcp: 'MCP',
  footerTerms: '이용약관',
  footerPrivacy: '개인정보 처리방침',
  footerRefunds: '환불 정책',
  // Keep Android Open 캠페인 배너(사실 확인 출처는 en/common.ts 참조).
  bannerText:
    'Google은 인증된 Android 기기의 모든 앱이 Google 인증 개발자가 제공해야 하도록 요구할 예정입니다. 전 세계 적용은 2027년에 시작됩니다. 휴대폰이 곧 온전히 여러분의 것이 아니게 됩니다.',
  bannerDismiss: '배너 닫기',
}

export default common
