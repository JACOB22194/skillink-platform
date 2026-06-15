#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "============================================="
echo "   Running All Unit Tests for Skilllink      "
echo "============================================="

# 1. Run Frontend Tests
echo ""
echo ">>> [1/3] Running Frontend Unit Tests (Vitest)..."
echo "============================================="
cd Skilllink-Frontend
npm install
npm run test
cd ..

# 2. Run Backend Tests
echo ""
echo ">>> [2/3] Running Backend Unit Tests (Pytest)..."
echo "============================================="
cd Skilllink-backend
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
pytest
deactivate
cd ..

# 3. Run AI Service Tests
echo ""
echo ">>> [3/3] Running AI Service Unit Tests (Pytest)..."
echo "============================================="
cd Skillink-AI
if [ ! -d "venv" ]; then
    python3 -m venv venv
fi
source venv/bin/activate
pip install -r requirements.txt
pytest
deactivate
cd ..

echo ""
echo "============================================="
echo "       All Unit Tests Passed Successfully!   "
echo "============================================="
