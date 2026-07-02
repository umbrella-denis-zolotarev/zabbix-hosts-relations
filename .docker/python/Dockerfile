FROM python:3.13-alpine

# openssh-client: run the ansible script over ssh on the ansible server.
# sshpass: supply the ssh password non-interactively (ANSIBLE_SSH_PASSWORD).
# redis: store per-host ansible run status/output.
RUN apk add --no-cache openssh-client sshpass \
    && pip install --no-cache-dir redis
