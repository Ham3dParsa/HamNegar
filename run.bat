@echo off
set PORT=8000
where python >nul 2>&1 || (echo python not found & pause & exit /b 1)
echo modular app at http://localhost:%PORT%/
start http://localhost:%PORT%/
python -m http.server %PORT%
