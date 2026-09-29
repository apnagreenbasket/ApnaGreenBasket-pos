#!/bin/bash
# ==============================================================================
# Database Backup to AWS S3 (No Local Storage, 7-Day Retention, Strict SSL)
# ==============================================================================
# Usage: Run via cron on EC2 (daily at 2:00 AM)
#   0 2 * * * /home/ubuntu/ApnaGreenBasket-pos/scripts/backup_db.sh >> /var/log/backup.log 2>&1
# ==============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env"

if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

parse_database_url() {
  local url="$DATABASE_URL"
  # Strip protocol
  url="${url#*://}"
  # Extract user & password
  local userpass="${url%%@*}"
  DB_USER="${userpass%%:*}"
  DB_PASSWORD="${userpass#*:}"
  # Extract host, port, db
  local hostportdb="${url#*@}"
  # Strip query params if any
  hostportdb="${hostportdb%%\?*}"
  local hostport="${hostportdb%%/*}"
  DB_NAME="${hostportdb#*/}"
  DB_HOST="${hostport%%:*}"
  DB_PORT="${hostport#*:}"
  if [ "$DB_PORT" = "$DB_HOST" ]; then DB_PORT="5432"; fi
}

TIMESTAMP=$(date +"%Y_%m_%d_%H%M%S")
TMP_FILE="/tmp/agb_backup_${TIMESTAMP}.sql.gz"
S3_RETENTION_DAYS=7

S3_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID:-""}"
S3_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY:-""}"
S3_BUCKET_NAME="${S3_BUCKET_NAME:-""}"
S3_REGION="${S3_REGION:-"ap-south-1"}"
CA_CERT_PATH="${PROJECT_DIR}/certs/rds-ca-bundle.pem"

if [ -z "${S3_BUCKET_NAME}" ] || [ -z "${S3_ACCESS_KEY_ID}" ] || [ -z "${S3_SECRET_ACCESS_KEY}" ]; then
  echo "❌ ERROR: AWS S3 credentials (S3_BUCKET_NAME, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY) not configured in .env"
  exit 1
fi

parse_database_url

echo "📦 Dumping PostgreSQL database (${DB_NAME} @ ${DB_HOST}) with SSL encryption..."
export PGPASSWORD="${DB_PASSWORD}"

if [ -f "$CA_CERT_PATH" ]; then
  export PGSSLROOTCERT="$CA_CERT_PATH"
  export PGSSLMODE="verify-full"
fi

pg_dump \
  -h "${DB_HOST}" \
  -p "${DB_PORT}" \
  -U "${DB_USER}" \
  -d "${DB_NAME}" \
  -F c -b -Z 9 \
  -f "${TMP_FILE}"

echo "☁️ Uploading to S3: s3://${S3_BUCKET_NAME}/backups/agb_backup_${TIMESTAMP}.sql.gz"
AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
aws s3 cp "${TMP_FILE}" \
  "s3://${S3_BUCKET_NAME}/backups/agb_backup_${TIMESTAMP}.sql.gz" \
  --region "${S3_REGION}" \
  --quiet

rm -f "${TMP_FILE}"
echo "🗑️ Temporary local dump deleted."

# Purge backups older than 7 days from S3
echo "🧹 Purging S3 backups older than ${S3_RETENTION_DAYS} days..."
CUTOFF_DATE=$(date -d "${S3_RETENTION_DAYS} days ago" +"%Y-%m-%d")

while read -r line; do
  FILE_DATE=$(echo "$line" | awk '{print $1}')
  FILE_NAME=$(echo "$line" | awk '{print $4}')

  if [[ -n "$FILE_NAME" && "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
    echo "   🗑️ Deleting old backup: ${FILE_NAME} (${FILE_DATE})"
    AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
    AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
    aws s3 rm "s3://${S3_BUCKET_NAME}/backups/${FILE_NAME}" \
      --region "${S3_REGION}" \
      --quiet || true
  fi
done < <(AWS_ACCESS_KEY_ID="${S3_ACCESS_KEY_ID}" \
         AWS_SECRET_ACCESS_KEY="${S3_SECRET_ACCESS_KEY}" \
         aws s3 ls "s3://${S3_BUCKET_NAME}/backups/" \
           --region "${S3_REGION}" 2>/dev/null || true)

echo "✅ Backup and retention successfully completed!"


