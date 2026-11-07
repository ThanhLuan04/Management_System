@echo off
rem Tắt backend (cổng 8000) và frontend (cổng 5173) do start-dev.bat mở.
rem Lưu ý: tắt MỌI chương trình đang chiếm hai cổng này.
chcp 65001 >nul
setlocal

call :stop 8000 backend
call :stop 5173 frontend
echo.
echo Xong. PostgreSQL vẫn chạy ^(là dịch vụ của Windows, không cần tắt^).
ping -n 4 127.0.0.1 >nul
exit /b 0

:stop
set "found="
for /f "tokens=5" %%p in ('netstat -ano ^| findstr /r /c:":%1 .*LISTENING"') do (
    set "found=1"
    rem /T: tắt cả tiến trình con (uvicorn --reload chạy worker riêng)
    taskkill /PID %%p /T /F >nul 2>&1 && echo Đã tắt %2 ^(cổng %1, PID %%p^)
)
if not defined found echo %2 không chạy ^(cổng %1 trống^)
exit /b 0
