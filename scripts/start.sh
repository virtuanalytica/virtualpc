#!/bin/bash

# ============================================================
# START SCRIPT - Launch Custom Paperclip Agent System
# ============================================================
# Starts all services:
# - Node.js API server on port 3100
# - Kafka message queue
# - Neo4j graph database
# - Agent workers
# ============================================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PID_FILE="$SCRIPT_DIR/.service.pid"

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}  🚀 Starting VirtualPC Autonomous Agent System${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Check if already running
if [ -f "$PID_FILE" ]; then
    OLD_PID=$(cat "$PID_FILE")
    if kill -0 "$OLD_PID" 2>/dev/null; then
        echo -e "${YELLOW}⚠ System already running (PID: $OLD_PID)${NC}"
        exit 0
    fi
fi

# Open-source VirtualPC does not require or load .env files. Secrets should be
# injected by Infisical/key manager, managed identity, or the process manager.

echo -e "${YELLOW}[1/4] Checking services...${NC}"

# Check Neo4j
NEO4J_CONTAINER=$(docker ps --filter "name=neo4j" -q 2>/dev/null || true)
if [ -z "$NEO4J_CONTAINER" ]; then
    echo -e "${YELLOW}⚠ Starting Neo4j container...${NC}"
    docker run -d \
        --name neo4j-custom-virtualpc \
        -p 7687:7687 \
        -p 7474:7474 \
        -e NEO4J_AUTH=none \
        neo4j 2>/dev/null || echo "Neo4j container may already exist"
    sleep 3
fi
echo -e "${GREEN}✓ Neo4j ready${NC}"

# Check Kafka
KAFKA_CONTAINER=$(docker ps --filter "name=kafka" -q 2>/dev/null || true)
if [ -z "$KAFKA_CONTAINER" ]; then
    echo -e "${YELLOW}⚠ Note: Kafka should be running separately via docker-compose${NC}"
else
    echo -e "${GREEN}✓ Kafka ready${NC}"
fi

echo ""
echo -e "${YELLOW}[2/4] Building application...${NC}"
npm run build --silent
echo -e "${GREEN}✓ Build complete${NC}"

echo ""
echo -e "${YELLOW}[3/4] Creating required directories...${NC}"
mkdir -p logs data/cache data/models config
echo -e "${GREEN}✓ Directories ready${NC}"

echo ""
echo -e "${YELLOW}[4/4] Starting API server...${NC}"

# Start in background
cd "$SCRIPT_DIR"
node dist/index.js > logs/virtualpc.log 2>&1 &
SERVER_PID=$!
echo $SERVER_PID > "$PID_FILE"

# Wait for server to be ready
echo -e "${YELLOW}⏳ Waiting for server to start...${NC}"
sleep 2

# Check if started successfully
if kill -0 $SERVER_PID 2>/dev/null; then
    echo -e "${GREEN}✓ Server started (PID: $SERVER_PID)${NC}"
else
    echo -e "${RED}✗ Failed to start server${NC}"
    echo -e "${YELLOW}Check logs: tail -f logs/virtualpc.log${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${GREEN}✅ System Online!${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

echo -e "${YELLOW}Services:${NC}"
echo -e "  API:      ${BLUE}http://localhost:3100${NC}"
echo -e "  Neo4j:    ${BLUE}http://localhost:7474${NC}"
echo -e "  Logs:     ${BLUE}tail -f logs/virtualpc.log${NC}"
echo ""

echo -e "${YELLOW}Quick Tests:${NC}"
echo -e "  Health:   ${BLUE}curl http://localhost:3100/health${NC}"
echo -e "  Memory:   ${BLUE}curl http://localhost:3100/api/memory/status${NC}"
echo ""

echo -e "${YELLOW}To stop:  ${BLUE}./stop.sh${NC}"
echo -e "${YELLOW}To watch: ${BLUE}tail -f logs/virtualpc.log${NC}\n"
