// src/i18n/ru/download.ts — русский словарь страницы загрузки. Контракт —
// en/download.ts. Имена APK-файлов, имена пакетов, URL, названия магазинов
// и версии не переводятся.
import type en from '../en/download'

const download: typeof en = {
  metaTitle: 'Скачать приложения',
  metaDescription:
    'Скачайте Root My Android — избранный клиент, прямой APK. Apple App Store и Google Play — скоро. Предварительные APK Rootz и Guardian Angel остаются доступны.',
  h1: 'Скачать приложения',
  tagline:
    'Прямые загрузки APK — избранный клиент распространяется скользящими сборками; предварительные приложения v1.0.0 остаются доступны ниже.',
  featuredEyebrow: 'Избранный клиент',
  featuredTitle: 'Root My Android',
  featuredDescAfter:
    ' — клиент: сканирование устройства, сопряжённые устройства Guardian, зашифрованные резервные копии и инструменты.',
  featuredStatus: 'Скользящая сборка из master — свежий APK в каждом запуске CI',
  featuredLink: 'Скачать rootmyandroid-release.apk',
  featuredNote:
    'Скользящая итерационная сборка UI/UX из master (скользящий тег android-apk), подписанная нашим ключом загрузки. Установки из предварительного релиза v1.0.0 или более ранних сборок, подписанных отладочным ключом, нужно один раз удалить перед обновлением.',
  featuredArtAlt:
    'Супергерой SU из Root My Android — зелёный Android-робот с красным плащом и жёлтым щитом SU на груди',
  appStoreName: 'Apple App Store',
  playStoreName: 'Google Play',
  comingSoon: 'Скоро',
  secondaryHeading: 'Другие загрузки',
  secondaryNote: 'Rootz и Guardian Angel устанавливаются в обход магазинов (sideload APK).',
  rootzH2: 'Rootz',
  rootzDescAfter: ' — приложение для анализа устройства (предварительная версия v1.0.0).',
  rootzLink: 'Скачать rooted-release.apk',
  guardianH2: 'Guardian Angel',
  guardianDescAfter: ' — приложение сопровождающего мониторинга (предварительная версия v1.0.0).',
  guardianLink: 'Скачать guardian-release.apk',
  guardianArtAlt: 'Guardian Angel — зелёный Android-робот с тонким золотым нимбом',
  installH2: 'Установка',
  installStep1: 'Скачайте APK на ваше Android-устройство.',
  installStep2Before: 'Откройте его и разрешите ',
  installStep2Strong: 'установку неизвестных приложений',
  installStep2After: ' для вашего браузера, когда Android предложит это.',
  installStep3Before: 'Нажмите ',
  installStep3Strong: 'Установить',
  installStep3After: '.',
  requiresBefore:
    'Требуется Android 7.0 (API 24) или новее. Все три APK подписаны нашим ключом загрузки; вы можете проверить подписи и контрольные суммы по ',
  requiresLink: 'заметкам о релизе',
  requiresAfter: '.',
  previewNote:
    'Это предварительные сборки — функции продукта выкатываются. Бесплатный уровень покрывает базовое сканирование и документацию.',
  sideloadTitle: 'Перед установкой',
  sideloadStep1: 'Нажмите «Продолжить загрузку» — APK сохранится в папку «Загрузки».',
  sideloadStep2: 'Android спросит про неизвестные приложения: разрешите установку для вашего браузера (один раз).',
  sideloadStep3: 'Откройте APK из уведомления или приложения «Загрузки» и нажмите «Установить».',
  sideloadNote:
    'Все три APK подписаны нашим ключом загрузки. Если приложение было установлено до 2026-11-13, сначала удалите его — Android отклоняет смену подписи.',
  sideloadContinue: 'Продолжить загрузку',
  sideloadCancel: 'Отмена',
}

export default download
