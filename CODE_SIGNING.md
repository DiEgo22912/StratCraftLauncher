# Инструкция по цифровой подписи (Code Signing)

## Текущее состояние
Лаунчер настроен для подписи с publisher "yukinch", но **без реального сертификата Windows SmartScreen будет показывать предупреждение**.

## Почему появляется предупреждение SmartScreen?

Windows Defender SmartScreen защищает пользователей от неизвестных приложений. Чтобы убрать предупреждение, нужно:

1. **Цифровая подпись с доверенным сертификатом**
2. **Накопление репутации** (много установок без жалоб)

## Как получить сертификат для подписи?

### Вариант 1: EV Code Signing Certificate (рекомендуется)
- **Преимущества**: Мгновенное доверие SmartScreen
- **Стоимость**: ~$300-500/год
- **Поставщики**: 
  - DigiCert (digicert.com)
  - Sectigo (sectigo.com)
  - SSL.com

### Вариант 2: Обычный Code Signing Certificate
- **Преимущества**: Дешевле (~$100-200/год)
- **Недостаток**: Нужно накапливать репутацию (SmartScreen всё равно появится первое время)
- **Поставщики**: те же

### Вариант 3: Самоподписанный сертификат (только для тестов)
**Не убирает SmartScreen, но позволяет тестировать процесс подписи**

#### Создание самоподписанного сертификата (PowerShell):

```powershell
# Создать сертификат
$cert = New-SelfSignedCertificate -Type Custom -Subject "CN=yukinch, O=StratCraft, C=RU" `
    -KeyUsage DigitalSignature -FriendlyName "StratCraft Launcher" `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @("2.5.29.37={text}1.3.6.1.5.5.7.3.3", "2.5.29.19={text}")

# Экспортировать в PFX (нужен пароль)
$password = ConvertTo-SecureString -String "YourPassword123" -Force -AsPlainText
Export-PfxCertificate -Cert $cert -FilePath ".\StratCraft-CodeSign.pfx" -Password $password
```

#### Настройка в GitHub Actions (если есть настоящий сертификат):

1. Загрузите PFX-файл как GitHub Secret:
   - Base64-закодируйте: `certutil -encode cert.pfx cert.txt` (Windows)
   - Добавьте в Secrets: `WIN_CSC_LINK` (содержимое cert.txt)
   - Добавьте пароль: `WIN_CSC_KEY_PASSWORD`

2. Обновите `.github/workflows/build.yml`:

```yaml
- name: Build Windows Installer
  env:
    WIN_CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
    WIN_CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
  run: npm run dist:win
```

## Альтернативные решения

### Без сертификата:
- Распространяйте через Microsoft Store (автоматическое доверие)
- Используйте portable ZIP вместо installer
- Просите пользователей добавить в исключения

### Накопление репутации:
- Используйте одинаковый сертификат для всех версий
- Не меняйте издателя
- Минимум ~3000 установок без жалоб для начала доверия SmartScreen

## Текущая конфигурация

В `package.json` уже добавлено:
- `publisherName: "yukinch"`
- Отключена проверка подписи при обновлении (`verifyUpdateCodeSignature: false`)
- Настроен SHA256 для подписи

Когда получите сертификат, просто установите переменные окружения `WIN_CSC_LINK` и `WIN_CSC_KEY_PASSWORD`, и electron-builder автоматически подпишет exe/msi.

## Полезные ссылки
- [Electron Builder Code Signing](https://www.electron.build/code-signing)
- [Windows SmartScreen FAQ](https://learn.microsoft.com/windows/security/threat-protection/windows-defender-smartscreen/)
- [DigiCert Code Signing Guide](https://www.digicert.com/signing/code-signing-certificates)
