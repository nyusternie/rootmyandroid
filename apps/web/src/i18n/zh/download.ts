// src/i18n/zh/download.ts — 中文（简体）下载页词典。契约见
// en/download.ts。APK 文件名、包名、URL、商店名称与版本号不翻译。
import type en from '../en/download'

const download: typeof en = {
  metaTitle: '下载应用',
  metaDescription:
    '下载 Root My Android——精选客户端，直接下载 APK。Apple App Store 与 Google Play 即将上线。Rootz 和 Guardian Angel 预览版 APK 仍可下载。',
  h1: '下载应用',
  tagline: '直接 APK 下载——精选客户端为滚动构建；下方的 v1.0.0 预览应用仍可下载。',
  featuredEyebrow: '精选客户端',
  featuredTitle: 'Root My Android',
  featuredDescAfter: '——客户端应用：设备扫描、已配对的 Guardian 设备、加密备份与工具。',
  featuredStatus: '来自 master 的滚动构建——每次 CI 运行都会生成新的 APK',
  featuredLink: '下载 rootmyandroid-release.apk',
  featuredNote:
    '来自 master 的滚动 UI/UX 迭代构建（滚动标签 android-apk），使用我们的上传密钥签名。从 v1.0.0 预览版或更早的调试签名构建安装的版本，更新前需先卸载一次。',
  featuredArtAlt: 'Root My Android 超级英雄——绿色 Android 机器人，红色披风，胸前黄色 SU 盾牌',
  appStoreName: 'Apple App Store',
  playStoreName: 'Google Play',
  comingSoon: '即将上线',
  secondaryHeading: '更多下载',
  secondaryNote: 'Rootz 和 Guardian Angel 以 APK 侧载安装。',
  rootzH2: 'Rootz',
  rootzDescAfter: '——设备分析应用（v1.0.0 预览版）。',
  rootzLink: '下载 rooted-release.apk',
  guardianH2: 'Guardian Angel',
  guardianDescAfter: '——陪伴监护应用（v1.0.0 预览版）。',
  guardianLink: '下载 guardian-release.apk',
  guardianArtAlt: 'Guardian Angel——绿色 Android 机器人，细金色光环',
  installH2: '安装',
  installStep1: '在你的 Android 设备上下载 APK。',
  installStep2Before: '打开它，并在 Android 提示时为你的浏览器允许',
  installStep2Strong: '安装未知应用',
  installStep2After: '。',
  installStep3Before: '点击',
  installStep3Strong: '安装',
  installStep3After: '。',
  requiresBefore: '需要 Android 7.0（API 24）或更高版本。三个 APK 均使用我们的上传密钥签名；你可以对照',
  requiresLink: '发布说明',
  requiresAfter: '核验签名和校验和。',
  previewNote: '这些是预览构建——产品功能正在陆续推出。免费版涵盖基础扫描和文档。',
  sideloadTitle: '旁加载前请阅读',
  sideloadStep1: '点按“继续下载”——APK 会保存到你的“下载”文件夹。',
  sideloadStep2: 'Android 会询问未知应用：允许你的浏览器安装应用（只需一次）。',
  sideloadStep3: '从通知或“下载”应用中打开 APK，点按“安装”。',
  sideloadNote:
    '所有三个 APK 均使用我们的上传密钥签名。如果你在 2026-11-13 之前安装过本应用，请先卸载——Android 会拒绝签名变更。',
  sideloadContinue: '继续下载',
  sideloadCancel: '取消',
}

export default download
