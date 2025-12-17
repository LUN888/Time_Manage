@echo off
echo Starting Time Coach Backend...
echo.

cd /d c:\Users\USER\Time_Manage\time-coach-backend

echo Starting backend server...
start "Backend" cmd /k npm start

echo Waiting for backend to start...
timeout /t 5 /nobreak > nul

echo Starting ngrok...
start "Ngrok" cmd /k ngrok http 4000 --domain=steamily-unspied-lynsey.ngrok-free.dev

echo.
echo ========================================
echo Backend: http://localhost:4000
echo Public URL: https://steamily-unspied-lynsey.ngrok-free.dev
echo ========================================
echo.
echo Press any key to exit this window...
pause > nul
