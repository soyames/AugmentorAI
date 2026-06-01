#!/bin/bash

echo "Setting up AugmentorAI..."

# Install Node.js dependencies
echo "Installing Node.js dependencies..."
npm install

# Set up Python virtual environment
echo "Setting up Python environment..."
cd server
python -m venv .venv

# Activate and install dependencies
if [[ "$OSTYPE" == "msys" ]] || [[ "$OSTYPE" == "win32" ]]; then
    source .venv/Scripts/activate
else
    source .venv/bin/activate
fi

pip install -r requirements.txt
cd ..

echo ""
echo "Setup complete!"
echo ""
echo "To start the application:"
echo "  1. Start the server: npm run dev:server"
echo "  2. Start the web app: npm run dev:web"
echo "  3. Or run both: npm start"
echo ""
echo "Make sure Ollama is running with a model loaded:"
echo "  ollama pull llama3.1"
echo "  ollama serve"
