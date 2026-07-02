#!make

-include .docker/.env
export $(test -e || shell sed 's/=.*//' .docker/.env)

DOCKER_COMPOSE_CMD_RUN_DEV = docker compose -f .docker/docker-compose.yml -f .docker/docker-compose-dev.yml
DOCKER_COMPOSE_CMD_RUN_PROD = docker compose -f .docker/docker-compose.yml
ifeq ($(DOCKER_ENV),dev)
	DOCKER_COMPOSE_CMD_RUN = $(DOCKER_COMPOSE_CMD_RUN_DEV)
else
	DOCKER_COMPOSE_CMD_RUN = $(DOCKER_COMPOSE_CMD_RUN_PROD)
endif
DOCKER_COMPOSE_CMD = $(DOCKER_COMPOSE_CMD_RUN)

EXEC_NODE = $(DOCKER_COMPOSE_CMD) exec node
RUN_NODE = $(DOCKER_COMPOSE_CMD_RUN_DEV) run --rm node

build:
	$(DOCKER_COMPOSE_CMD) build --no-cache

status:
	$(DOCKER_COMPOSE_CMD) ps
up:
	$(DOCKER_COMPOSE_CMD) up -d
	$(MAKE) status
stop:
	$(DOCKER_COMPOSE_CMD) stop
	$(MAKE) status
restart: stop up

down:
	$(MAKE) stop
	$(DOCKER_COMPOSE_CMD) down
	$(MAKE) status

console-node:
	$(DOCKER_COMPOSE_CMD) exec node sh

logs-node:
	$(DOCKER_COMPOSE_CMD) logs --tail=100 -f node

console-redis:
	$(DOCKER_COMPOSE_CMD) exec redis redis-cli

logs-redis:
	$(DOCKER_COMPOSE_CMD) logs --tail=100 -f redis

###
# nodejs/npm/npx
###

create-new-react-app-javascript:
	$(RUN_NODE) npx create-react-app /app/tmp
create-new-react-app-pwa-typescript:
	$(RUN_NODE) npx create-react-app /app/tmp --template cra-template-pwa-typescript
create-new-react-app-vite:
	$(RUN_NODE) npm create vite@latest
    # `app` -> `React` -> `TypeScript + SWC`

npm-install:
	$(RUN_NODE) npm i

# example: make npm-install-package name="--save-dev --save-exact @eslint/js @types/react @types/react-dom @vitejs/plugin-react-swc eslint eslint-plugin-react-hooks eslint-plugin-react-refresh prettier typescript typescript-eslint vite vite-plugin-checker vite-tsconfig-paths"
# example: make npm-install-package name="--save-exact react react-dom"
# example: make npm-install-package name="--save-exact react-device-detect"
# example: make npm-install-package name="--save-exact react-joystick-component"
# example: make npm-install-package name="--save-exact three @react-three/drei @react-three/fiber @react-three/rapier"
# example: make npm-install-package name="--save-exact leva"
npm-install-package:
	$(RUN_NODE) npm i $(name)

npm-build:
	$(RUN_NODE) npm run build

restart-and-logs-node:
	$(DOCKER_COMPOSE_CMD) stop node
	$(DOCKER_COMPOSE_CMD) up -d node
	$(MAKE) logs-node

### upgrade all packages
# npm install -g npm-check-updates
# ncu
# ncu -u