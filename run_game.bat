@echo off
chcp 65001 >nul
title 루멘티아: 별의 파수꾼 - 로컬 게임 서버

echo ========================================================
echo    ★ 루멘티아: 별의 파수꾼 (Lumentia: Star Keepers) ★
echo ========================================================
echo.
echo [1] 로컬 웹 서버 시작 중... (Port: 8123)

:: Python 구동 가능 여부 체크
where python >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Python 환경 감지됨 - HTTP 로컬 서버를 시작합니다.
    start "" http://localhost:8123/
    echo 브라우저가 열렸습니다. 서버를 종료하려면 이 창을 닫으세요.
    python -m http.server 8123
) else (
    echo Python이 감지되지 않아 기본 브라우저로 직접 실행합니다.
    start "" "index.html"
    pause
)
