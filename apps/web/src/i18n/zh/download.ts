// src/i18n/zh/download.ts — 中文（简体）下载页词典。契约见
// en/download.ts。APK 文件名、包名、URL 与版本号不翻译。
import type en from '../en/download'

const download: typeof en = {
  metaTitle: '下载应用',
  metaDescription: '下载 Rootz 和 Guardian Angel Android 应用——最新预览版的直接 APK 下载。',
  h1: '下载应用',
  tagline: '预览版 v1.0.0——直接 APK 下载，始终指向最新版本。',
  rootzH2: 'Rootz',
  rootzDescAfter: '——设备分析应用。',
  rootzLink: '下载 rooted-release.apk',
  guardianH2: 'Guardian Angel',
  guardianDescAfter: '——陪伴监护应用。',
  guardianLink: '下载 guardian-release.apk',
  androidH2: 'Root My Android（Android 版）',
  androidDescAfter: '——设备扫描、已配对的 Guardian 设备、加密备份与工具。',
  androidLink: '下载 rootmyandroid-release.apk',
  androidNote: '来自 master 的滚动 UI/UX 迭代构建（滚动标签 android-apk），使用公开调试密钥签名——仅供评审，非生产用途；无法覆盖更新上传密钥签名的安装（需先卸载）。',
  installH2: '安装',
  installStep1: '在你的 Android 设备上下载 APK。',
  installStep2Before: '打开它，并在 Android 提示时为你的浏览器允许',
  installStep2Strong: '安装未知应用',
  installStep2After: '。',
  installStep3Before: '点击',
  installStep3Strong: '安装',
  installStep3After: '。',
  requiresBefore: '需要 Android 7.0（API 24）或更高版本。Rootz 和 Guardian Angel APK 均使用我们的上传密钥签名；你可以对照',
  requiresLink: '发布说明',
  requiresAfter: '核验签名和校验和。',
  previewNote: '这些是预览构建——产品功能正在陆续推出。免费版涵盖基础扫描和文档。',
}

export default download
