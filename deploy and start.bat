@echo off
chcp 65001 >nul
echo ========================================
echo    🚀 Time Coach 一鍵部署腳本
echo ========================================
echo.

:: 設定路徑
set FRONTEND_DIR=c:\Users\USER\Time_Manage\time-coach-frontend
set BACKEND_DIR=c:\Users\USER\Time_Manage\time-coach-backend
set BACKEND_PORT=4000

:: 步驟 1: 打包前端
echo [1/4] 正在打包前端...
cd /d %FRONTEND_DIR%
call npm run build
if %ERRORLEVEL% neq 0 (
    echo ❌ 前端打包失敗！
    pause
    exit /b 1
)
echo ✅ 前端打包完成！
echo.

:: 步驟 2: 複製到後端 public
echo [2/4] 正在複製檔案到後端...
if exist "%BACKEND_DIR%\public" (
    rd /s /q "%BACKEND_DIR%\public"
)
mkdir "%BACKEND_DIR%\public"
xcopy /E /I /Y "%FRONTEND_DIR%\dist\*" "%BACKEND_DIR%\public\" >nul
echo ✅ 檔案複製完成！
echo.

:: 步驟 3: 啟動 ngrok（背景執行）
echo [3/4] 正在啟動 ngrok...
start "ngrok" cmd /c "ngrok http %BACKEND_PORT%"
timeout /t 3 /nobreak >nul
echo ✅ ngrok 已在新視窗啟動！
echo.

:: 步驟 4: 啟動後端伺服器
echo [4/4] 正在啟動後端伺服器...
echo.
echo ========================================
echo    ✅ 部署完成！
echo    後端將在 http://localhost:%BACKEND_PORT% 運行
echo    請到 ngrok 視窗查看公開網址
echo ========================================
echo.
cd /d %BACKEND_DIR%
call npm run start

pause
