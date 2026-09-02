@echo off
setlocal
cd /d "%~dp0"
set PORT=8000
where python >nul 2>&1
if %errorlevel% neq 0 (
  where py >nul 2>&1
  if %errorlevel% neq 0 (
    echo [خطا] python پيدا نشد — از python.org نصب کن
    pause
    exit /b 1
  ) else (
    set PYTHON=py
  )
) else (
  set PYTHON=python
)
echo هم‌نگار — http://localhost:%PORT%/
echo پوشه: %cd%
echo براي خروج Ctrl+C بزن
timeout /t 1 /nobreak >nul
start "" "http://localhost:%PORT%/"
%PYTHON% -m http.server %PORT%
pause
