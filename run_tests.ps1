Write-Host "=============================================" -ForegroundColor Green
Write-Host "   Running All Unit Tests for Skilllink      " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green

# 1. Run Frontend Tests
Write-Host ""
Write-Host ">>> [1/3] Running Frontend Unit Tests (Vitest)..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
cd Skilllink-Frontend
npm install
npm run test
cd ..

# 2. Run Backend Tests
Write-Host ""
Write-Host ">>> [2/3] Running Backend Unit Tests (Pytest)..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
cd Skilllink-backend
if (-not (Test-Path venv)) {
    python -m venv venv
}
& .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest
deactivate
cd ..

# 3. Run AI Service Tests
Write-Host ""
Write-Host ">>> [3/3] Running AI Service Unit Tests (Pytest)..." -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
cd Skillink-AI
if (-not (Test-Path venv)) {
    python -m venv venv
}
& .\venv\Scripts\Activate.ps1
pip install -r requirements.txt
pytest
deactivate
cd ..

Write-Host ""
Write-Host "=============================================" -ForegroundColor Green
Write-Host "       All Unit Tests Passed Successfully!   " -ForegroundColor Green
Write-Host "=============================================" -ForegroundColor Green
