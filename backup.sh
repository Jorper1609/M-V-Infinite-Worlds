#!/bin/sh
set -eu
mkdir -p data/backups
timestamp="$(date +%Y%m%d-%H%M%S)"
backup_name="mingoverse-${timestamp}.sqlite"
# SQLite online backup API: consistent even while the game is running.
docker compose exec -T -e BACKUP_NAME="$backup_name" mingoverse node --input-type=module -e '
import Database from "better-sqlite3";
import fs from "node:fs";
fs.mkdirSync("/app/data/backups", { recursive: true });
const source = new Database("/app/data/mingoverse.sqlite", { readonly: true, fileMustExist: true });
await source.backup(`/app/data/backups/${process.env.BACKUP_NAME}`);
source.close();
'
printf 'Copia creada en data/backups/%s\n' "$backup_name"
