@echo off
pushd "%~dp0"
set PORT=8000
where python >nul 2>nul
if %errorlevel%==0 set PYTHON=python & goto :run
where py >nul 2>nul
if %errorlevel%==0 set PYTHON=py & goto :run
echo python not found - install from python.org
pause
exit /b 1
:run
echo ham-negar at http://localhost:%PORT%/index.html
timeout /t 1 /nobreak >nul
start "" "http://localhost:%PORT%/index.html"
%PYTHON% -m http.server %PORT%
pause
