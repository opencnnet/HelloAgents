@echo off
setlocal

rem ==========================================================================
rem  HelloAgents Chat - one-click desktop packaging wrapper (ASCII only).
rem  All args are forwarded to scripts\desktop\build-desktop.ps1, e.g.
rem    build-desktop.bat                  full build (cleans intermediates)
rem    build-desktop.bat -KeepWork        keep sidecar for later -SkipBackend
rem    build-desktop.bat -SkipBackend     repackage only (needs sidecar)
rem    build-desktop.bat -SkipInstall     skip frontend dependency install
rem    build-desktop.bat -CleanAll        also delete cargo target and dist
rem    build-desktop.bat -Bundle msi      build MSI instead of NSIS
rem  Set HA_NO_PAUSE=1 to skip the final pause (CI usage).
rem ==========================================================================

set "ROOT=%~dp0"
set "PS1=%ROOT%scripts\desktop\build-desktop.ps1"
set "RELEASE=%ROOT%ai-chat\release"

echo ==================================================
echo   HelloAgents Chat desktop build
echo   repo: %ROOT%
echo ==================================================
echo.

if not exist "%PS1%" (
  echo [ERROR] packaging script not found: %PS1%
  goto :fail
)

where powershell >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Windows PowerShell not found. Windows 10/11 required.
  goto :fail
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS1%" %*
if errorlevel 1 goto :fail

echo.
echo ==================================================
echo   Done. Installer directory:
echo   %RELEASE%
echo ==================================================
for %%F in ("%RELEASE%\*.exe") do echo   %%~nxF  (%%~zF bytes)
echo.
echo Double-click the installer to install.

if not defined HA_NO_PAUSE pause
exit /b 0

:fail
echo.
echo [FAILED] Packaging did not complete. See the log above.
if not defined HA_NO_PAUSE pause
exit /b 1