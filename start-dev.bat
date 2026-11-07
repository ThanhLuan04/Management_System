@echo off
rem Chạy SmartStore trên máy: backend (cổng 8000) + frontend (cổng 5173), rồi mở trình duyệt.
rem Cách dùng: bấm đúp file này, hoặc gõ start-dev trong cmd/PowerShell tại thư mục gốc dự án.
rem Tắt: đóng 2 cửa sổ "SmartStore - ..." hoặc chạy stop-dev.bat.
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo === SmartStore - khởi động môi trường phát triển ===
echo.

rem ---------- Kiểm tra điều kiện ----------
if not exist "backend\.venv\Scripts\python.exe" (
    echo [LỖI] Chưa có môi trường Python: backend\.venv
    echo        Tạo bằng: cd backend ^&^& python -m venv .venv ^&^& .venv\Scripts\python.exe -m pip install -r requirements-dev.txt
    goto :fail
)
if not exist "backend\.env" (
    echo [LỖI] Chưa có file backend\.env — copy từ backend\.env.example rồi điền mật khẩu database, JWT_SECRET_KEY.
    goto :fail
)
if not exist "frontend\node_modules" (
    echo Chưa có thư viện frontend, đang cài lần đầu ^(npm install^)...
    pushd frontend
    call npm.cmd install || (popd & goto :fail)
    popd
)
sc query postgresql-x64-18 | find "RUNNING" >nul
if errorlevel 1 (
    echo [CẢNH BÁO] Dịch vụ PostgreSQL ^(postgresql-x64-18^) chưa chạy — backend sẽ không kết nối được database.
    echo            Bật trong services.msc, hoặc chạy cmd bằng quyền Administrator: net start postgresql-x64-18
    echo.
)

rem ---------- Khởi động (bỏ qua phần nào đang chạy sẵn) ----------
netstat -ano | findstr /r /c:":8000 .*LISTENING" >nul
if errorlevel 1 (
    echo Khởi động backend  - http://localhost:8000  ^(cửa sổ "SmartStore - Backend"^)
    start "SmartStore - Backend (8000)" /D "%~dp0backend" cmd /k ".venv\Scripts\python.exe -m uvicorn app.main:app --reload --port 8000"
) else (
    echo Backend đã chạy sẵn ở cổng 8000 — bỏ qua.
)

netstat -ano | findstr /r /c:":5173 .*LISTENING" >nul
if errorlevel 1 (
    echo Khởi động frontend - http://localhost:5173  ^(cửa sổ "SmartStore - Frontend"^)
    start "SmartStore - Frontend (5173)" /D "%~dp0frontend" cmd /k "npm.cmd run dev"
) else (
    echo Frontend đã chạy sẵn ở cổng 5173 — bỏ qua.
)

rem ---------- Chờ sẵn sàng rồi mở trình duyệt ----------
echo.
echo Đang chờ backend sẵn sàng...
for /l %%i in (1,1,60) do (
    curl.exe -s -f -o nul http://127.0.0.1:8000/api/v1/health && goto :backend_ready
    ping -n 2 127.0.0.1 >nul
)
echo [LỖI] Sau 60 giây backend vẫn chưa chạy — xem thông báo lỗi trong cửa sổ "SmartStore - Backend".
goto :fail

:backend_ready
echo Backend OK. Đang chờ frontend...
for /l %%i in (1,1,60) do (
    curl.exe -s -f -o nul http://localhost:5173/ && goto :frontend_ready
    ping -n 2 127.0.0.1 >nul
)
echo [LỖI] Sau 60 giây frontend vẫn chưa chạy — xem cửa sổ "SmartStore - Frontend".
goto :fail

:frontend_ready
echo.
echo Đã sẵn sàng:
echo   Ứng dụng : http://localhost:5173
echo   Swagger  : http://localhost:8000/docs
start "" http://localhost:5173
echo.
echo Cửa sổ này tự đóng sau 5 giây. Tắt hệ thống: đóng 2 cửa sổ SmartStore hoặc chạy stop-dev.bat
ping -n 6 127.0.0.1 >nul
exit /b 0

:fail
echo.
pause
exit /b 1
