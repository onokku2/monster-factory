@echo off
rem Monster Factory - publish to a public HTTPS URL (phone-playable, no account)
rem 1) serves this folder on localhost:8780
rem 2) opens a Cloudflare quick tunnel and prints a https://*.trycloudflare.com URL
rem Open that URL on your phone, then "Add to Home Screen" to install the app.
setlocal
set DIR=%~dp0
start "MonFac Server" /min cmd /c python -m http.server 8780 --directory "%DIR%."
timeout /t 2 /nobreak >nul
echo ============================================================
echo  Open the https://...trycloudflare.com URL below on your phone
echo  then use "Add to Home Screen" to install as an app.
echo  (Keep this window open while playing the first time.)
echo ============================================================
"%DIR%.deploy\cloudflared.exe" tunnel --url http://localhost:8780 --no-autoupdate
endlocal
