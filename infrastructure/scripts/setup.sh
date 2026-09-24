#!/bin/bash
# Setup script for development environment

set -e

echo "🚀 ERP System - Development Setup"
echo "=================================="

# Check Node.js version
NODE_VERSION=$(node -v)
echo "✓ Node.js: $NODE_VERSION"

# Check pnpm
PNPM_VERSION=$(pnpm -v)
echo "✓ pnpm: $PNPM_VERSION"

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
pnpm install

# Create .env if it doesn't exist
if [ ! -f .env ]; then
  echo "📝 Creating .env from .env.example..."
  cp .env.example .env
  echo "⚠️  Please update .env with your MongoDB URI and secrets"
fi

# Build packages
echo ""
echo "🔨 Building packages..."
pnpm build

# Run typecheck
echo ""
echo "✓ Type checking..."
pnpm typecheck

# Run lint
echo ""
echo "✓ Linting..."
pnpm lint

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Configure .env file with MongoDB URI"
echo "  2. Start: pnpm dev"
echo "  3. Tests: pnpm test"
echo ""
