BACKEND_PORT ?= 8000
FRONTEND_PORT ?= 5000

install-backend:
	cd backend && npm install

install-frontend:
	cd frontend && npm install

run-backend:
	cd backend && PORT=$(BACKEND_PORT) npx tsx src/index.ts

run-frontend:
	$(if $(BASE_BE_ENDPOINT),,$(error BASE_BE_ENDPOINT is not set))
	echo "VITE_BASE_BE_ENDPOINT=$(BASE_BE_ENDPOINT)" > frontend/.env
	cd frontend && npx vite --host 0.0.0.0 --port $(FRONTEND_PORT)

db-setup:
	# Step 1 - Provisioning: SQLite auto-creates the database file on first connection; no commands required
	# Step 2 - Migrations
	cd backend && mkdir -p migrations
	cd backend && npx tsx scripts/migrate.ts
	# Step 3 - Seeding
	python3 -m venv .seeder_venv
	.seeder_venv/bin/pip install --quiet faker==30.8.2 bcrypt==4.2.1
	.seeder_venv/bin/python .challenge_metadata/seed.py