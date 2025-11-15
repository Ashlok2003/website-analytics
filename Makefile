.PHONY: install setup build start-ingestion start-processor start-reporting start-all

install:
	npm ci
	cd ./prisma && npx prisma generate

setup:
	$(MAKE) install
	cd ./prisma && npx prisma migrate dev --name init
	@echo "Remote setup complete. Ensure remote DB/Redis are accessible."

build:
	npm run build

start-ingestion:
	npx tsx src/services/ingestion.ts

start-processor:
	npx tsx src/services/processor.ts

start-reporting:
	npx tsx src/services/reporting.ts

start-all:
	$(MAKE) setup
	$(MAKE) start-ingestion & $(MAKE) start-processor & $(MAKE) start-reporting
