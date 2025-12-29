BACKUP_DIR="backups/JusticeBot-backup-$(date +"%Y%m%d-%H%M%S")"
cp -r server.mjs package.json data/ templates/ "$BACKUP_DIR"
echo "Backup saved to $BACKUP_DIR"
