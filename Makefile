.PHONY: install setup build start-ingestion start-processor start-reporting start-all docker-build docker-start docker-stop

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

docker-build:
	docker build -t tjra .

docker-start:
	docker run -d --name tjra-container --env-file .env -p 4000:3000 -p 4001:3001 tjra

docker-stop:
	docker stop tjra-container
	docker rm tjra-container
