@echo off
title Time Coach - Start All Services
echo ======================================
echo   Time Coach - 啟動服務
echo ======================================
echo.

:: 啟動後端 (在新視窗)
echo [1/2] 啟動後端服務...
start "Time Coach Backend" cmd /k "cd /d %~dp0time-coach-backend && npm run start"

:: 等待 2 秒讓後端先啟動
timeout /t 2 /nobreak > nul

:: 啟動前端 (在新視窗)
echo [2/2] 啟動前端服務...
start "Time Coach Frontend" cmd /k "cd /d %~dp0time-coach-frontend && npm run dev"

echo.
echo ======================================
echo   所有服務已啟動！
echo   後端: http://localhost:4000
echo   前端: http://localhost:5173
echo ======================================
echo.
echo 按任意鍵開啟前端頁面...
pause > nul

:: 自動開啟瀏覽器
start http://localhost:5173
