#!/bin/bash

echo "🚀 Starting CollabUp Recommendation System Backend..."

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.8 or higher."
    exit 1
fi

# Check if requirements.txt exists
if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt not found. Please make sure you're in the backend directory."
    exit 1
fi

# Check if serviceAccountKey.json exists
if [ ! -f "serviceAccountKey.json" ]; then
    echo "⚠️  serviceAccountKey.json not found. Copying from parent directory..."
    if [ -f "../serviceAccountKey.json" ]; then
        cp ../serviceAccountKey.json ./serviceAccountKey.json
        echo "✅ serviceAccountKey.json copied successfully."
    else
        echo "❌ serviceAccountKey.json not found in parent directory either."
        echo "Please make sure you have your Firebase service account key file."
        exit 1
    fi
fi

# Install dependencies if needed
echo "📦 Installing Python dependencies..."
pip3 install -r requirements.txt

# Start the server
echo "🌐 Starting server on http://localhost:8000"
echo "📚 API Documentation available at http://localhost:8000/docs"
echo ""
echo "Press Ctrl+C to stop the server"
echo ""

python3 recommendation_backend.py 