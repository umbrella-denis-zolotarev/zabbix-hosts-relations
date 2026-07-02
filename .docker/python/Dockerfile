FROM python:3.13-alpine

# openssh-client: run the ansible script over ssh on the ansible server.
# redis: store per-host ansible run status/output.
RUN apk add --no-cache openssh-client \
    && pip install --no-cache-dir redis
