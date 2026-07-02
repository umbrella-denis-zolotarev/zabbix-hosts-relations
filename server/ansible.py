"""Ansible playbook runner used by the host detail "Ansible" button.

Flow:
  start_run(hostid, target, visible_name) -> spawns a background thread that
    runs the ansible script over ssh, immediately marking the host "running"
    in redis.
  get_status(hostid)        -> the stored record for that host.

The record is stored in redis under ansible:status:<hostid> as JSON:
  {status, target, visible_name, output, started_at, finished_at}
where status is one of: running | ok | failed | none.

The script is run over ssh as:  ANSIBLE_SCRIPT <target> <visible_name>  on
ANSIBLE_SSH_HOST. With ANSIBLE_MOCK=1 (the default) the ssh call is skipped and
a canned playbook run is returned instead, so the feature works without a real
server.
"""

import json
import os
import re
import shlex
import subprocess
import threading
import time
from datetime import datetime, timezone

import redis

REDIS_HOST = os.environ.get("REDIS_HOST", "redis")
REDIS_PORT = int(os.environ.get("REDIS_PORT", "6379"))

ANSIBLE_MOCK = os.environ.get("ANSIBLE_MOCK", "1") not in ("", "0", "false", "False")
ANSIBLE_SSH_HOST = os.environ.get("ANSIBLE_SSH_HOST", "")
ANSIBLE_SSH_LOGIN = os.environ.get("ANSIBLE_SSH_LOGIN", "")
ANSIBLE_SSH_PASSWORD = os.environ.get("ANSIBLE_SSH_PASSWORD", "")
ANSIBLE_SCRIPT = os.environ.get(
    "ANSIBLE_SCRIPT", "/home/sysadm/ansible_quickstart/run.sh"
)

_redis = redis.Redis(host=REDIS_HOST, port=REDIS_PORT, decode_responses=True)


def _key(hostid):
    return f"ansible:status:{hostid}"


def _now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def get_status(hostid):
    raw = _redis.get(_key(hostid))
    if not raw:
        return {"status": "none"}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"status": "none"}


def _save(hostid, record):
    _redis.set(_key(hostid), json.dumps(record))


def parse_status(output):
    # The playbook is OK only when every "PLAY RECAP" host line reports failed=0.
    fails = re.findall(r"failed=(\d+)", output)
    return "ok" if fails and all(n == "0" for n in fails) else "failed"


def _run_script(target, visible_name):
    if ANSIBLE_MOCK:
        # Simulate the playbook taking a little while so the UI shows "running".
        time.sleep(3)
        return MOCK_OUTPUT
    # Pass both the inventory target and the host's visible name as arguments,
    # quoting each so spaces in the visible name don't split into extra args.
    remote_cmd = f"{ANSIBLE_SCRIPT} {shlex.quote(visible_name)}"
    ssh_cmd = [
        "ssh",
        "-o",
        "StrictHostKeyChecking=no",
        f"{ANSIBLE_SSH_LOGIN}@{ANSIBLE_SSH_HOST}",
        remote_cmd,
    ]

    env = os.environ.copy()
    if ANSIBLE_SSH_PASSWORD:
        # Feed the password to ssh via sshpass. Using "-e" (SSHPASS env var)
        # instead of "-p" keeps the password out of the process list.
        cmd = ["sshpass", "-e", *ssh_cmd]
        env["SSHPASS"] = ANSIBLE_SSH_PASSWORD
    else:
        # No password configured: rely on key-based auth.
        cmd = ssh_cmd

    proc = subprocess.run(
        cmd, capture_output=True, text=True, timeout=600, env=env
    )
    return proc.stdout + proc.stderr


def _job(hostid, target, visible_name, record):
    try:
        output = _run_script(target, visible_name)
        status = parse_status(output)
    except Exception as e:  # surface any failure to the UI
        output = f"error running ansible: {e}"
        status = "failed"
    record.update(status=status, output=output, finished_at=_now())
    _save(hostid, record)


def start_run(hostid, target, visible_name=""):
    current = get_status(hostid)
    if current.get("status") == "running":
        return current  # don't start a second run while one is in flight

    record = {
        "status": "running",
        "target": target,
        "visible_name": visible_name,
        "output": "",
        "started_at": _now(),
        "finished_at": None,
    }
    _save(hostid, record)
    threading.Thread(
        target=_job,
        args=(hostid, target, visible_name, record),
        daemon=True,
    ).start()
    return record


# Canned output of `ssh <ansible> /home/sysadm/ansible_quickstart/run.sh r0`,
# used when ANSIBLE_MOCK is enabled.
MOCK_OUTPUT = """remote: Enumerating objects: 6, done.
remote: Counting objects: 100% (6/6), done.
remote: Compressing objects: 100% (4/4), done.
remote: Total 4 (delta 2), reused 0 (delta 0), pack-reused 0
Unpacking objects: 100% (4/4), 1.09 KiB | 556.00 KiB/s, done.
From http://192.168.4.184:3000/sysadm/networking-infrastructure
   d77a416..ddaa2dd  main       -> origin/main
Updating d77a416..ddaa2dd
Fast-forward
 r0.50-cloud-init.yaml | 60 ++++++++++++++++++++++++++++++------------------------------
 r8.50-cloud-init.yaml |  2 +-
 2 files changed, 31 insertions(+), 31 deletions(-)

PLAY [IPTABLES] *****************************************************************************************************************************

TASK [Gathering Facts] **********************************************************************************************************************
ok: [r0]

TASK [IPSec/L2TP] ***************************************************************************************************************************
ok: [r0] => (item=500)
ok: [r0] => (item=4500)
ok: [r0] => (item=1701)

TASK [SSH] **********************************************************************************************************************************
ok: [r0] => (item=95.174.110.160)
ok: [r0] => (item=95.174.111.172)
ok: [r0] => (item=95.174.102.87)

TASK [Accept RELATED and ESTABLISHED connections in INPUT chain] ****************************************************************************
ok: [r0]

TASK [Zabbix] *******************************************************************************************************************************
ok: [r0]

TASK [ICMP] *********************************************************************************************************************************
ok: [r0]

TASK [OSPF] *********************************************************************************************************************************
ok: [r0] => (item=10.200.30.26)
ok: [r0] => (item=10.200.30.6)
ok: [r0] => (item=10.200.30.10)

TASK [WEB] **********************************************************************************************************************************
ok: [r0]

TASK [MASQUERADE] ***************************************************************************************************************************
ok: [r0] => (item=51.250.112.224)

TASK [Save iptables rules] ******************************************************************************************************************
changed: [r0]

PLAY [VPN] **********************************************************************************************************************************

TASK [Gathering Facts] **********************************************************************************************************************
ok: [r0]

TASK [deploy ipsec/wg/l2tp configs] *********************************************************************************************************
ok: [r0] => (item={'src_file': 'r0.ipsec.conf', 'dest_file': '/etc/ipsec.conf'})
ok: [r0] => (item={'src_file': 'r0.strongswan.conf', 'dest_file': '/etc/strongswan.conf'})
ok: [r0] => (item={'src_file': 'r0.options.xl2tpd240', 'dest_file': '/etc/ppp/options.xl2tpd240'})
ok: [r0] => (item={'src_file': 'r0.xl2tpd-240.conf', 'dest_file': '/etc/xl2tpd/xl2tpd-240.conf'})
ok: [r0] => (item={'src_file': 'r0.options.xl2tpd241', 'dest_file': '/etc/ppp/options.xl2tpd241'})
ok: [r0] => (item={'src_file': 'r0.xl2tpd-241.conf', 'dest_file': '/etc/xl2tpd/xl2tpd-241.conf'})

TASK [Apply IPSec] **************************************************************************************************************************
changed: [r0]

PLAY [IP] ***********************************************************************************************************************************

TASK [Gathering Facts] **********************************************************************************************************************
ok: [r0]

TASK [deploy netplan] ***********************************************************************************************************************
changed: [r0]

TASK [Apply Netplan] ************************************************************************************************************************
changed: [r0]

PLAY RECAP **********************************************************************************************************************************
r0                         : ok=16   changed=4    unreachable=0    failed=0    skipped=0    rescued=0    ignored=0
"""
