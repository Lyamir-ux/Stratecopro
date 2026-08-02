@echo off
title Strat Eco Pro - serveur local
cd /d "%~dp0"
set "PATH=%PATH%;C:\Program Files\nodejs"
echo.
echo  ================================================
echo   Strat Eco Pro - demarrage du serveur local
echo   L'application va s'ouvrir sur localhost:5173
echo   Laissez cette fenetre ouverte pendant le test.
echo   Pour arreter : fermez cette fenetre (ou Ctrl+C)
echo  ================================================
echo.
start "" cmd /c "timeout /t 4 >nul & start http://localhost:5173"
npm run dev
