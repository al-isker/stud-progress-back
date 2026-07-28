# Настройка окружения

## Кодировка

Проект хранит текстовые файлы в UTF-8.

При работе через Windows PowerShell 5.1 с файлами, содержащими русский текст, обязательно указывать кодировку явно:

```powershell
Get-Content -LiteralPath .\path\to\file.md -Encoding UTF8
Set-Content -LiteralPath .\path\to\file.md -Encoding UTF8
```

Без `-Encoding UTF8` Windows PowerShell 5.1 может читать UTF-8 без BOM как ANSI и выводить битый текст.
