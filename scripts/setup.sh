#!/bin/bash

# ============================================================
# SETUP SCRIPT - Initialize Custom Paperclip Development Environment
# ============================================================
# Sets up all dependencies, runtime configuration directories, and local state
# for the autonomous agent system (LightRAG + Kafka + API Interceptor)
# ============================================================

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🚀 Custom Paperclip - Agent System Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# ============================================================
# 1. Check Prerequisites
# ============================================================
echo -e "${YELLOW}[1/5] Checking prerequisites...${NC}"

if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js not found. Please install Node.js 18+${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Node.js $(node -v)${NC}"

if ! command -v npm &> /dev/null; then
    echo -e "${RED}✗ npm not found. Please install npm.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ npm $(npm -v)${NC}"

# Optional: Check for Docker
if command -v docker &> /dev/null; then
    echo -e "${GREEN}✓ Docker $(docker --version)${NC}"
else
    echo -e "${YELLOW}⚠ Docker not found (optional for containerization)${NC}"
fi

# Optional: Check for Neo4j
if docker ps 2>/dev/null | grep -q neo4j; then
    echo -e "${GREEN}✓ Neo4j container found${NC}"
else
    echo -e "${YELLOW}⚠ Neo4j not running - will need to be started separately${NC}"
fi

echo ""

# ============================================================
# 2. Install Dependencies
# ============================================================
echo -e "${YELLOW}[2/5] Installing npm dependencies...${NC}"

cd "$SCRIPT_DIR"

if [ ! -d "node_modules" ]; then
    npm install --loglevel=error
    echo -e "${GREEN}✓ Dependencies installed${NC}"
else
    echo -e "${GREEN}✓ Dependencies already installed${NC}"
fi

echo ""

# ============================================================
# 3. Runtime configuration policy
# ============================================================
echo -e "${YELLOW}[3/5] Checking runtime configuration policy...${NC}"
echo -e "${GREEN}✓ No .env file is required. Use Infisical/key manager or process-manager injection for secrets.${NC}"

echo ""

# ============================================================
# 4. Build TypeScript
# ============================================================
echo -e "${YELLOW}[4/5] Building TypeScript...${NC}"

npm run build --silent
echo -e "${GREEN}✓ TypeScript compiled successfully${NC}"

echo ""

# ============================================================
# 5. Create Required Directories
# ============================================================
echo -e "${YELLOW}[5/5] Setting up directory structure...${NC}"

mkdir -p logs
mkdir -p data/cache
mkdir -p data/models
mkdir -p config

echo -e "${GREEN}✓ Directories created${NC}"

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}Next Steps:${NC}"
echo -e "  1. Provision secrets through Infisical/key manager or managed identity:"
echo -e "     - INFISICAL_PROJECT_ID, INFISICAL_CLIENT_ID, INFISICAL_CLIENT_SECRET"
echo -e "     - API keys, database passwords, and encryption keys in the secret manager"
echo -e "     - Non-secret runtime flags through systemd, shell, or container config"
echo ""
echo -e "  2. Start Neo4j (if not running):"
echo -e "     ${BLUE}docker run -d -p 7687:7687 -p 7474:7474 -e NEO4J_AUTH=none neo4j${NC}"
echo ""
echo -e "  3. Start Kafka (if not running):"
echo -e "     ${BLUE}docker-compose up -d${NC}"
echo ""
echo -e "  4. Start the system:"
echo -e "     ${BLUE}./start.sh${NC}"
echo ""
echo -e "  5. Check status:"
echo -e "     ${BLUE}./health-check.sh${NC}"
echo ""

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"
