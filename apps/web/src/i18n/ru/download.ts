// src/i18n/ru/download.ts — русский словарь страницы загрузки. Контракт —
// en/download.ts. Имена APK-файлов, имена пакетов, URL и версии не
// переводятся.
import type en from '../en/download'

const download: typeof en = {
  metaTitle: 'Скачать приложения',
  metaDescription:
    'Скачайте Android-приложения Rootz и Guardian Angel — прямые загрузки APK последнего предварительного релиза.',
  h1: 'Скачать приложения',
  tagline: 'Предварительный релиз v1.0.0 — прямые загрузки APK, всегда указывающие на последний релиз.',
  rootzH2: 'Rootz',
  rootzDescAfter: ' — приложение для анализа устройства.',
  rootzLink: 'Скачать rooted-release.apk',
  guardianH2: 'Guardian Angel',
  guardianDescAfter: ' — приложение сопровождающего мониторинга.',
  guardianLink: 'Скачать guardian-release.apk',
  androidH2: 'Root My Android (Android-редакция)',
  androidDescAfter: ' — сканирование устройства, сопряжённые устройства Guardian, зашифрованные резервные копии и инструменты.',
  androidLink: 'Скачать rootmyandroid-release.apk',
  androidNote:
    'Скользящая итерационная сборка UI/UX из master (скользящий тег android-apk), подписанная ПУБЛИЧНЫМ отладочным ключом — только для обзора, не для продакшена; не обновляется поверх установки, подписанной ключом загрузки (сначала удалите её).',
  installH2: 'Установка',
  installStep1: 'Скачайте APK на ваше Android-устройство.',
  installStep2Before: 'Откройте его и разрешите ',
  installStep2Strong: 'установку неизвестных приложений',
  installStep2After: ' для вашего браузера, когда Android предложит это.',
  installStep3Before: 'Нажмите ',
  installStep3Strong: 'Установить',
  installStep3After: '.',
  requiresBefore: 'Требуется Android 7.0 (API 24) или новее. APK Rootz и Guardian Angel подписаны нашим ключом загрузки; вы можете проверить подписи и контрольные суммы по ',
  requiresLink: 'заметкам о релизе',
  requiresAfter: '.',
  previewNote:
    'Это предварительные сборки — функции продукта выкатываются. Бесплатный уровень покрывает базовое сканирование и документацию.',
}

export default download
