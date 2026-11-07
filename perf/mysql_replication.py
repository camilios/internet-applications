"""Read replication status without exposing local secret files or passwords."""
import csv
import io
import shlex
import requirement3 as r

def mysql(container, sql, headers=False):
    if container not in ('ecommerce-mysql', 'ecommerce-mysql-replica'):
        raise ValueError('Only the project primary and replica are allowed')
    script = 'export MYSQL_PWD="$(tr -d \'\\r\\n\' < "$MYSQL_ROOT_PASSWORD_FILE")"\n'
    script += 'mysql -u root --batch --raw ' + ('' if headers else '--skip-column-names ')
    script += '-e ' + shlex.quote(sql) + '\n'
    result = r.docker('exec', '-i', container, 'bash', input=script, check=False)
    if result.returncode:
        raise RuntimeError(r.redact(result.stderr))
    return result.stdout.strip()

def status():
    raw = mysql('ecommerce-mysql-replica', 'SHOW REPLICA STATUS', headers=True)
    return next(csv.DictReader(io.StringIO(raw), delimiter='\t')) if raw else {}

def wait_for_replica():
    gtid = mysql('ecommerce-mysql', 'SELECT @@GLOBAL.gtid_executed')
    if mysql('ecommerce-mysql-replica', "SELECT WAIT_FOR_EXECUTED_GTID_SET('" + gtid + "', 30)") != '0':
        raise RuntimeError('Replica has not applied the primary GTID fence')
