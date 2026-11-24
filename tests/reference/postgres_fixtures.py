"""Allocate disposable databases on an explicitly selected loopback server."""

import json
import re
import sys
from urllib.parse import urlsplit, urlunsplit

import psycopg
from psycopg import sql


def main():
    operation, *names = sys.argv[1:]
    url = urlsplit(sys.stdin.read().strip())
    if (
        url.scheme != "postgresql"
        or url.hostname != "127.0.0.1"
        or not url.port
        or url.path != "/postgres"
        or url.query
        or url.fragment
        or not names
        or any(not re.fullmatch(r"cirnet_stage4_(?:db_[a-z_]+_[0-9a-f]{8}|cutover_native_[0-9a-f]{12})", name) for name in names)
    ):
        raise ValueError("Expected an isolated loopback PostgreSQL admin URL and fixture names.")
    with psycopg.connect(url.geturl(), autocommit=True, connect_timeout=5) as database:
        if operation == "create":
            created = []
            try:
                for name in names:
                    database.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier(name)))
                    created.append(name)
            except Exception:
                drop(database, created)
                raise
            print(json.dumps([urlunsplit(("postgresql+psycopg", url.netloc, "/" + name, "", ""))
                              for name in names]))
        elif operation == "data-directory":
            print(database.execute("SHOW data_directory").fetchone()[0])
        elif operation == "drop":
            drop(database, names)
        else:
            raise ValueError("Expected create or drop.")


def drop(database, names):
    for name in names:
        database.execute(sql.SQL("DROP DATABASE IF EXISTS {}").format(sql.Identifier(name)))


if __name__ == "__main__":
    main()
