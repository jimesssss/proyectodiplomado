#!/bin/bash
# Development server startup script

# Check if .env exists
if [ ! -f .env ]; then
  echo "❌ Error: .env file not found"
  echo "Please copy .env.example to .env and configure it"
  exit 1
fi

echo "🚀 Starting ERP API development server..."
echo "Environment: development"
echo "Port: 3000"
echo ""

cd apps/api
pnpm dev
