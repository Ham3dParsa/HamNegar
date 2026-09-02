@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PORT=8000
where python >nul 2>nul
if %errorlevel%==0 set PYTHON=python & goto :run
where py >nul 2>nul
if %errorlevel%==0 set PYTHON=py & goto :run
echo [khta] python peyda nashod - az python.org nasb kon
pause
exit /b 1
:run
echo ham-negar - http://localhost:%PORT%/
echo poshe: %cd%
echo baraye khoroj Ctrl+C bezan
timeout /t 1 /nobreak >nul
start "" "http://localhost:%PORT%/"
%PYTHON% -m http.server %PORT%
pause
