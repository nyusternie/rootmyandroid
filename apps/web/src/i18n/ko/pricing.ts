// src/i18n/ko/pricing.ts — 한국어 가격 페이지 사전. 계약과 용어집은
// en/pricing.ts 참조. 제품 및 요금제 이름(Guardian Angel Lite / Pro,
// Rootz Pro)과 가격($5/$15, USD)은 번역하지 않음.
import type en from '../en/pricing'

const pricing: typeof en = {
  metaTitle: '가격',
  metaDescription:
    'Guardian Angel 모니터링(Lite $5/월, Pro $15/월) 및 Rootz Pro 전문가용 도구($15/년). 충전식 구독 — 이메일 없음, 비밀번호 없음, 자동 갱신 없음.',
  h1Before: '두 가지 제품. ',
  h1Highlight: '간단한 구독.',
  lede:
    'Guardian Angel은 월간 모니터링 구독으로 기기를 지켜줍니다. Rootz는 연간 Pro 구독으로 전문가용 도구를 잠금 해제합니다. 두 제품 모두 동일한 프라이버시 우선 계정에서 실행됩니다 — 이메일 없음, 비밀번호 없음, 계정 번호만 있으면 됩니다. 원할 때마다 충전으로 시간을 추가하세요 — 자동 갱신 없음, 저장된 카드 없음.',
  freeH2Name: '무료',
  freeH2PriceSuffix: ' 영구',
  freeText:
    '브라우저 기기 스캔(읽기 전용 ADB), 부트로더 및 잠금 해제 감지, 루팅 방법 선택, 그리고 전체 가이드 라이브러리 — 계정 불필요.',
  freeCta: '무료로 시작',
  gaHeadSuffix: '— 월간 모니터링',
  rootzHeadSuffix: '— 전문가용 도구, 연간',
  guardianTiers: [
    {
      badge: '/img/badge-guardian-lite.webp',
      alt: 'Guardian Angel Lite 배지 — 후광이 하나인 Android 로봇',
      name: 'Guardian Angel',
      level: 'Lite',
      price: '$5',
      per: '월',
      features: ['설치된 앱 읽기', '메시지 읽기', '최대 5대 기기 지원', '충전당 30일 — 언제든 시간 추가'],
      ctaLabel: '구독',
      tag: null,
      featured: false,
    },
    {
      badge: '/img/badge-guardian-pro.webp',
      alt: 'Guardian Angel Pro 배지 — 후광이 둘인 Android 로봇',
      name: 'Guardian Angel Pro',
      level: 'Pro',
      price: '$15',
      per: '월',
      features: [
        'Guardian Angel Lite의 모든 기능',
        '통화 기록 읽기',
        '사진 및 미디어 보기',
        '카메라 및 동영상 보기',
        '언제든 Lite와 Pro 사이 전환',
      ],
      ctaLabel: '구독',
      tag: '추천',
      featured: true,
    },
  ],
  rootzTiers: [
    {
      badge: '/img/brand/colonel-su-staff.webp',
      alt: 'Colonel Su — 지혜로운 늙은 Android 로봇, SU 엠블럼이 있는 지팡이',
      name: 'Rootz',
      level: 'Pro',
      price: '$15',
      per: '년',
      features: ['로그 분석', '독립적인 연간 구독', '모든 Guardian Angel 요금제와 결합 가능 — 또는 단독 사용'],
      ctaLabel: '구독',
      tag: '신규',
      featured: true,
    },
  ],
  offerSuffix: '충전식 구독: 언제든 시간 추가 — 자동 갱신 없음, 저장된 카드 없음. 암호화폐로 결제하고 15% 할인받으세요.',
  footnote:
    '모든 요금제는 충전식 구독입니다: 원할 때마다 시간을 추가하세요 — 자동 갱신 없음, 저장된 카드 없음. Guardian Angel 구독자는 언제든 Lite와 Pro 사이를 전환할 수 있으며, Rootz Pro는 매년 갱신되며 Guardian Angel 요금제 유무와 관계없이 작동합니다. 암호화폐로 결제하고 15% 할인받으세요 — 더 낮은 수수료, 더 적은 관리 비용이 고객에게 돌아갑니다. 신용카드 결제는 판매자 계정이 승인되는 대로 출시됩니다. 기능 패키지는 최종 조정 중입니다 — 위 라인업이 현재 제공 사항입니다.',
}

export default pricing
