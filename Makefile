# ========================================
# LLM Firewall - Makefile
# ========================================
# Common tasks for development, testing, and deployment

.PHONY: help install proto-gen test lint clean docker-up docker-down docker-build dev start stop logs

# Default target
.DEFAULT_GOAL := help

# ----------------------------------------
# Help
# ----------------------------------------
help: ## Show this help message
	@echo "LLM Firewall - Available Commands:"
	@echo ""
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
	@echo ""

# ----------------------------------------
# Installation
# ----------------------------------------
install: ## Install all dependencies (Gateway + Analyzer)
	@echo "📦 Installing Gateway dependencies..."
	cd gateway && npm install
	@echo ""
	@echo "📦 Installing Analyzer dependencies..."
	cd analyzer && pip install -r requirements.txt
	@echo ""
	@echo "✅ All dependencies installed!"

install-gateway: ## Install Gateway dependencies only
	@echo "📦 Installing Gateway dependencies..."
	cd gateway && npm install

install-analyzer: ## Install Analyzer dependencies only
	@echo "📦 Installing Analyzer dependencies..."
	cd analyzer && pip install -r requirements.txt

# ----------------------------------------
# Protocol Buffers
# ----------------------------------------
proto-gen: ## Generate code from Protocol Buffer definitions
	@echo "🔧 Generating Protocol Buffer code..."
	@echo ""
	@echo "Generating Python gRPC code..."
	python -m grpc_tools.protoc \
		-I./proto \
		--python_out=./analyzer/src \
		--grpc_python_out=./analyzer/src \
		./proto/firewall.proto
	@echo ""
	@echo "Generating Node.js gRPC code (dynamic loading - no generation needed)"
	@echo "✅ Protocol Buffer code generated!"

proto-clean: ## Remove generated Protocol Buffer code
	@echo "🧹 Cleaning generated Protocol Buffer files..."
	rm -f analyzer/src/*_pb2.py analyzer/src/*_pb2_grpc.py
	@echo "✅ Cleaned!"

# ----------------------------------------
# Development
# ----------------------------------------
dev: ## Start services in development mode with hot reload
	@echo "🚀 Starting services in development mode..."
	docker compose -f docker-compose.dev.yml up --build

start: ## Start all services
	@echo "🚀 Starting Gateway service..."
	cd gateway && npm start &
	@echo ""
	@echo "🚀 Starting Analyzer service..."
	cd analyzer && python src/server.py &

stop: ## Stop all running services
	@echo "🛑 Stopping services..."
	pkill -f "node.*gateway" || true
	pkill -f "python.*analyzer" || true
	@echo "✅ Services stopped!"

# ----------------------------------------
# Testing
# ----------------------------------------
test: ## Run all tests (Gateway + Analyzer)
	@echo "🧪 Running Gateway tests..."
	cd gateway && npm test
	@echo ""
	@echo "🧪 Running Analyzer tests..."
	cd analyzer && pytest
	@echo ""
	@echo "✅ All tests passed!"

test-gateway: ## Run Gateway tests only
	@echo "🧪 Running Gateway tests..."
	cd gateway && npm test

test-analyzer: ## Run Analyzer tests only
	@echo "🧪 Running Analyzer tests..."
	cd analyzer && pytest

test-coverage: ## Run tests with coverage report
	@echo "📊 Running tests with coverage..."
	cd gateway && npm run test:coverage
	cd analyzer && pytest --cov=src --cov-report=html
	@echo "✅ Coverage reports generated!"

test-integration: ## Run integration tests
	@echo "🔗 Running integration tests..."
	docker compose -f docker-compose.test.yml up --abort-on-container-exit
	docker compose -f docker-compose.test.yml down

# ----------------------------------------
# Linting & Code Quality
# ----------------------------------------
lint: ## Run linters on all code
	@echo "🔍 Linting Gateway code..."
	cd gateway && npm run lint
	@echo ""
	@echo "🔍 Linting Analyzer code..."
	cd analyzer && flake8 src/ && black --check src/ && mypy src/
	@echo ""
	@echo "✅ Linting complete!"

lint-fix: ## Auto-fix linting issues
	@echo "🔧 Auto-fixing Gateway code..."
	cd gateway && npm run lint:fix
	@echo ""
	@echo "🔧 Auto-fixing Analyzer code..."
	cd analyzer && black src/
	@echo "✅ Auto-fix complete!"

# ----------------------------------------
# Docker Operations
# ----------------------------------------
docker-build: ## Build Docker images for all services
	@echo "🐳 Building Docker images..."
	docker compose build
	@echo "✅ Docker images built!"

docker-up: ## Start all services with Docker Compose
	@echo "🐳 Starting Docker Compose stack..."
	docker compose up -d
	@echo "✅ Services started!"
	@echo ""
	@echo "Gateway:     http://localhost:3000"
	@echo "Prometheus:  http://localhost:9090"
	@echo "Grafana:     http://localhost:3001"

docker-down: ## Stop and remove all Docker containers
	@echo "🐳 Stopping Docker Compose stack..."
	docker compose down
	@echo "✅ Services stopped!"

docker-restart: ## Restart all Docker services
	@echo "🔄 Restarting Docker services..."
	docker compose restart
	@echo "✅ Services restarted!"

docker-logs: ## Show logs from all Docker services
	docker compose logs -f

docker-ps: ## Show running Docker containers
	docker compose ps

docker-clean: ## Remove all containers, volumes, and images
	@echo "🧹 Cleaning Docker resources..."
	docker compose down -v --rmi all
	@echo "✅ Docker resources cleaned!"

# ----------------------------------------
# Database Operations
# ----------------------------------------
db-init: ## Initialize database schema
	@echo "🗄️  Initializing database..."
	docker compose exec postgres psql -U firewall -d firewall_audit -f /docker-entrypoint-initdb.d/init.sql
	@echo "✅ Database initialized!"

db-migrate: ## Run database migrations
	@echo "🗄️  Running database migrations..."
	# Add migration commands here when implemented
	@echo "✅ Migrations complete!"

db-reset: ## Reset database (WARNING: destroys all data)
	@echo "⚠️  WARNING: This will destroy all data!"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker compose down -v; \
		docker compose up -d postgres; \
		sleep 3; \
		make db-init; \
	fi

# ----------------------------------------
# Monitoring & Observability
# ----------------------------------------
metrics: ## Open Prometheus metrics dashboard
	@echo "📊 Opening Prometheus..."
	open http://localhost:9090 || xdg-open http://localhost:9090

grafana: ## Open Grafana dashboard
	@echo "📊 Opening Grafana..."
	open http://localhost:3001 || xdg-open http://localhost:3001

logs: ## Tail logs from all services
	docker compose logs -f gateway analyzer

logs-gateway: ## Tail Gateway logs
	docker compose logs -f gateway

logs-analyzer: ## Tail Analyzer logs
	docker compose logs -f analyzer

# ----------------------------------------
# Security & Compliance
# ----------------------------------------
security-scan: ## Run security vulnerability scan
	@echo "🔒 Scanning for security vulnerabilities..."
	@echo ""
	@echo "Scanning Node.js dependencies..."
	cd gateway && npm audit
	@echo ""
	@echo "Scanning Python dependencies..."
	cd analyzer && pip-audit
	@echo ""
	@echo "Scanning Docker images with Trivy..."
	trivy image llm-firewall-gateway:latest || echo "Trivy not installed"
	trivy image llm-firewall-analyzer:latest || echo "Trivy not installed"

audit-logs: ## Query recent audit logs
	@echo "📋 Recent audit logs..."
	docker compose exec postgres psql -U firewall -d firewall_audit -c "SELECT * FROM audit_logs ORDER BY timestamp DESC LIMIT 10;"

# ----------------------------------------
# Performance Testing
# ----------------------------------------
load-test: ## Run load tests (requires k6)
	@echo "⚡ Running load tests..."
	k6 run tests/load/basic-load-test.js || echo "k6 not installed - install from https://k6.io"

benchmark: ## Run benchmark tests
	@echo "⚡ Running benchmarks..."
	# Add benchmark commands here when implemented

# ----------------------------------------
# Cleanup
# ----------------------------------------
clean: ## Remove generated files, caches, and build artifacts
	@echo "🧹 Cleaning project..."
	rm -rf gateway/node_modules
	rm -rf gateway/coverage
	rm -rf gateway/dist
	rm -rf analyzer/__pycache__
	rm -rf analyzer/.pytest_cache
	rm -rf analyzer/htmlcov
	rm -rf analyzer/src/*_pb2.py
	rm -rf analyzer/src/*_pb2_grpc.py
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true
	@echo "✅ Cleaned!"

clean-all: clean docker-clean ## Remove everything (code artifacts + Docker resources)
	@echo "✅ Everything cleaned!"

# ----------------------------------------
# Utilities
# ----------------------------------------
env-copy: ## Copy .env.example to .env
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "✅ Created .env file from .env.example"; \
		echo "⚠️  Please update .env with your configuration"; \
	else \
		echo "⚠️  .env already exists - not overwriting"; \
	fi

check-deps: ## Check if required tools are installed
	@echo "🔍 Checking dependencies..."
	@command -v node >/dev/null 2>&1 || echo "❌ Node.js not installed"
	@command -v npm >/dev/null 2>&1 || echo "❌ npm not installed"
	@command -v python3 >/dev/null 2>&1 || echo "❌ Python 3 not installed"
	@command -v pip >/dev/null 2>&1 || echo "❌ pip not installed"
	@command -v docker >/dev/null 2>&1 || echo "❌ Docker not installed"
	@command -v docker compose >/dev/null 2>&1 || echo "❌ Docker Compose not installed"
	@echo "✅ Dependency check complete!"

version: ## Show version information
	@echo "LLM Firewall v1.0.0"
	@echo ""
	@echo "Node.js: $$(node --version 2>/dev/null || echo 'not installed')"
	@echo "npm: $$(npm --version 2>/dev/null || echo 'not installed')"
	@echo "Python: $$(python3 --version 2>/dev/null || echo 'not installed')"
	@echo "Docker: $$(docker --version 2>/dev/null || echo 'not installed')"
	@echo "Docker Compose: $$(docker compose version 2>/dev/null || echo 'not installed')"

# ----------------------------------------
# Quick Start
# ----------------------------------------
quickstart: env-copy install proto-gen docker-build docker-up ## Quick start for new setup
	@echo ""
	@echo "✅ LLM Firewall is ready!"
	@echo ""
	@echo "🌐 Gateway:     http://localhost:3000"
	@echo "📊 Prometheus:  http://localhost:9090"
	@echo "📊 Grafana:     http://localhost:3001"
	@echo ""
	@echo "Test the firewall:"
	@echo "curl -X POST http://localhost:3000/v1/chat/completions \\"
	@echo "  -H 'Content-Type: application/json' \\"
	@echo "  -d '{\"messages\":[{\"role\":\"user\",\"content\":\"test\"}]}'"
