#!/usr/bin/env python3
"""Administer invite-only PosterLab processes on the existing Ubuntu host."""
import argparse
import contextlib
import fcntl
import grp
import ipaddress
import json
import os
from pathlib import Path
import re
import secrets
import socket
import sqlite3
import subprocess
import sys
import tempfile
import time
from decimal import Decimal, InvalidOperation
from urllib.request import ProxyHandler, build_opener

ROOT = Path('/etc/posterlab/workspaces')
NGINX = Path('/etc/nginx')
TEMPLATE = Path(__file__).resolve().with_name('nginx-workspace.conf')
HTTP = build_opener(ProxyHandler({}))


def write(path, contents, mode=0o600, gid=None):
    """Publish complete config files even if provisioning is interrupted."""
    with tempfile.NamedTemporaryFile(dir=path.parent, delete=False) as out:
        tmp = Path(out.name)
        try:
            out.write(contents.encode())
            out.flush()
            os.fsync(out.fileno())
            if gid is not None:
                os.fchown(out.fileno(), 0, gid)
            os.fchmod(out.fileno(), mode)
            os.replace(tmp, path)
        finally:
            tmp.unlink(missing_ok=True)


def run(*cmd, stdin=None):
    result = subprocess.run(cmd, input=stdin, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError(f'{cmd[0]} failed: {result.stderr.strip() or result.returncode}')
    return result.stdout


def slug(value):
    if not re.fullmatch(r'[a-z][a-z0-9-]{0,23}', value):
        raise argparse.ArgumentTypeError('use 1–24 lowercase ASCII letters, digits or hyphens, starting with a letter')
    return value


def budget(value):
    try:
        amount = Decimal(value)
        if not amount.is_finite() or not 0 <= amount <= 1000:
            raise ValueError
        if amount.normalize().as_tuple().exponent < -4:
            raise ValueError
        return format(amount, 'f') if amount else '0'
    except (InvalidOperation, ValueError):
        raise argparse.ArgumentTypeError('enter a CNY budget from 0 to 1000, up to four decimal places') from None


def manifest(record, state):
    record['state'] = state
    write(ROOT / record['name'] / 'state.json', json.dumps(record) + '\n')


def records():
    return [json.loads(file.read_text()) for file in sorted(ROOT.glob('*/state.json'))]


def available(port):
    with socket.socket() as sock:
        try:
            sock.bind(('0.0.0.0', port))
            return True
        except OSError:
            return False


def public_port(value):
    port = int(value)
    if not 1024 <= port <= 65535:
        raise argparse.ArgumentTypeError('choose a dedicated HTTPS port between 1024 and 65535')
    return port


def hostname(value):
    value = value.lower()
    try:
        return str(ipaddress.IPv4Address(value))
    except ValueError:
        labels = value.split('.')
        if (len(value) > 253 or len(labels) < 2 or labels[-1].isdigit()
                or any(not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', part) for part in labels)):
            raise argparse.ArgumentTypeError('enter a complete DNS name or IPv4 address') from None
        return value


def allocate(host, requested=None, path_mode=False):
    previous = records()
    reserved = {p for r in previous for p in (r['public_port'], r['backend_port'])}
    if path_mode:
        public = 443
    elif not host.rsplit('.', 1)[-1].isdigit() and requested is None:
        public = 443
        if any(r['host'] == host and r['public_port'] == public for r in previous):
            raise RuntimeError('DNS origin already assigned or retired')
    else:
        options = [requested] if requested is not None else range(10443, 11443)
        public = next((p for p in options if p not in reserved and available(p)), None)
        if public is None:
            raise RuntimeError('public port already assigned, unavailable or reserved by a previous workspace')
    backend = next((p for p in range(18787, 19787) if p != public and p not in reserved and available(p)), None)
    if backend is None:
        raise RuntimeError('no free loopback backend port')
    return public, backend


def paths(name, path_mode=False):
    site = f'posterlab-ws-{name}'
    enabled = (NGINX / 'posterlab-workspace-paths' / (name + '.conf') if path_mode
               else NGINX / 'sites-enabled' / site)
    return (NGINX / f'posterlab-workspace-{name}.users', NGINX / 'sites-available' / site,
            enabled, f'posterlab-workspace@{name}.service')


def create(args):
    name, host = args.name, str(args.host)
    if not (Path('/etc/letsencrypt/live') / host / 'fullchain.pem').is_file():
        raise RuntimeError('no TLS certificate installed for this address; see deploy/README.md')
    main_site = (NGINX / 'sites-available/posterlab-https').read_text()
    match = re.search(r'^\s*server_name\s+([a-zA-Z0-9.-]+);', main_site, re.M)
    if not match:
        raise RuntimeError('unable to determine the public home address from the primary Nginx site')
    home = hostname(match[1])
    if args.path and (args.port is not None or host != home):
        raise RuntimeError('--path uses the primary HTTPS host and port 443')
    if args.path and 'include /etc/nginx/posterlab-workspace-paths/*.conf;' not in main_site:
        raise RuntimeError('install the primary Nginx configuration with its workspace include first')
    public, backend = allocate(host, args.port, args.path)
    if public == 443 and host == home and not args.path:
        raise RuntimeError('primary studio origin already in use')
    origin = 'https://' + host + (f':{public}' if public != 443 else '')
    sni_guard = '' if host.rsplit('.', 1)[-1].isdigit() else f'if ($ssl_server_name != "{host}") {{ return 421; }}'
    directory = ROOT / name
    auth, site, enabled, unit = paths(name, args.path)
    if any(p.exists() or p.is_symlink() for p in (directory, auth, site, enabled)):
        raise RuntimeError('workspace name already assigned; choose a new name')
    template = TEMPLATE.with_name('nginx-workspace-path.conf') if args.path else TEMPLATE
    config = template.read_text()
    for token, value in [('WS_ORIGIN', origin), ('WS_SNI_GUARD', sni_guard), ('HOME_HOST', home),
                         ('PUBLIC_HOST', host), ('WS_NAME', name), ('WS_PORT', str(public)), ('WS_BACKEND', str(backend))]:
        config = config.replace(token, value)
    www = grp.getgrnam('www-data').gr_gid
    password = secrets.token_urlsafe(30)
    hashed = run('htpasswd', '-niB', '-C', '10', name, stdin=password + '\n')
    if not hashed.startswith(name + ':$2'):
        raise RuntimeError('htpasswd did not return a bcrypt hash')
    directory.mkdir(mode=0o700)
    record = dict(name=name, host=host, public_port=public, backend_port=backend, budget_cny=args.budget, path_mode=args.path)
    manifest(record, 'provisioning')
    try:
        write(directory / 'runtime.env', f'POSTERLAB_PORT={backend}\nSTUDIO_BUDGET_CNY={args.budget}\nSTUDIO_DATA_DIR=/var/lib/posterlab-ws-{name}\n')
        write(auth, hashed, 0o640, www)
        write(site, config, 0o644)
        run('systemctl', 'enable', '--now', unit)
        for _ in range(40):
            try:
                with HTTP.open(f'http://127.0.0.1:{backend}/api/status', timeout=1) as response:
                    status = json.load(response)
                if Decimal(str(status['budget'])) != Decimal(args.budget):
                    raise RuntimeError('workspace API budget does not match configured budget')
                break
            except OSError:
                time.sleep(0.5)
        else:
            raise RuntimeError('workspace service did not become ready')
        if args.path:
            enabled.parent.mkdir(mode=0o755, exist_ok=True)
        enabled.symlink_to(site)
        run('nginx', '-t')
        run('systemctl', 'reload', 'nginx')
        entry = origin + (f'/t/{name}' if args.path else '') + '/enter/'
        write(directory / 'invitation.txt', f'{entry}\n{name}\n{password}\n')
        manifest(record, 'active')
    except BaseException:
        # No invitation has been delivered. Keep its origin reserved permanently.
        enabled.unlink(missing_ok=True)
        auth.unlink(missing_ok=True)
        (directory / 'invitation.txt').unlink(missing_ok=True)
        try:
            run('systemctl', 'reload', 'nginx')
        finally:
            run('systemctl', 'disable', '--now', unit)
            manifest(record, 'failed')
        raise
    print(f"{entry}\nPrivate invitation: {directory / 'invitation.txt'}")


def draining(record):
    path = Path('/var/lib') / ('posterlab-ws-' + record['name']) / 'usage.sqlite3'
    if not path.exists():
        return False
    with contextlib.closing(sqlite3.connect(path.as_uri() + '?mode=ro', uri=True)) as db:
        pending = db.execute("SELECT COUNT(*) FROM calls WHERE state='pending'").fetchone()[0]
        ongoing = db.execute("SELECT COUNT(*) FROM generations WHERE json_extract(data,'$.state') NOT IN ('complete','failed')").fetchone()[0]
    return bool(pending or ongoing)


def nginx_workers():
    listing = run('ps', '-C', 'nginx', '-o', 'pid=,args=')
    return {int(line.split(maxsplit=1)[0]) for line in listing.splitlines()
            if 'nginx: worker process' in line}


def revoke(args):
    directory = ROOT / args.name
    record = json.loads((directory / 'state.json').read_text())
    auth, _, enabled, unit = paths(args.name, record.get('path_mode', False))
    if record['state'] == 'revoked':
        print('Already revoked.')
        return
    # Deny new requests first; existing requests finish before this process stops.
    manifest(record, 'revoking')
    write(auth, '', 0o640, grp.getgrnam('www-data').gr_gid)
    (directory / 'invitation.txt').unlink(missing_ok=True)
    enabled.unlink(missing_ok=True)
    run('nginx', '-t')
    # An old worker may still be reading an admitted request body before the
    # backend creates a ledger entry. Wait for those workers as well as jobs.
    old_workers = nginx_workers()
    run('systemctl', 'reload', 'nginx')
    deadline = time.monotonic() + 600
    while old_workers.intersection(nginx_workers()) or draining(record):
        if time.monotonic() > deadline:
            raise RuntimeError('invitation closed. A job is still pending; run revoke again after it finishes')
        time.sleep(2)
    run('systemctl', 'disable', '--now', unit)
    auth.unlink(missing_ok=True)
    manifest(record, 'revoked')
    print('Invitation revoked. Workspace process stopped; its private records and origin reservation are retained.')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    add = commands.add_parser('create')
    add.add_argument('name', type=slug)
    add.add_argument('--host', required=True, type=hostname)
    add.add_argument('--budget', required=True, type=budget, help='workspace lifetime model budget in CNY')
    add.add_argument('--port', type=public_port, help='optional dedicated HTTPS port; DNS names default to shared 443')
    add.add_argument('--path', action='store_true', help='serve /t/<name>/ on the primary HTTPS host')
    close = commands.add_parser('revoke')
    close.add_argument('name', type=slug)
    commands.add_parser('list')
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error('administrator access required')
    os.umask(0o077)
    ROOT.mkdir(mode=0o700, exist_ok=True)
    with (ROOT / '.admin.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if args.command == 'create':
            create(args)
        elif args.command == 'revoke':
            revoke(args)
        else:
            for r in records():
                path = f"/t/{r['name']}/" if r.get('path_mode') else '/'
                print(f"{r['name']}\t{r['state']}\t{r['host']}:{r['public_port']}{path}\tCNY {r['budget_cny']}")


if __name__ == '__main__':
    try:
        main()
    except (OSError, RuntimeError, sqlite3.Error) as error:
        sys.exit(str(error))
