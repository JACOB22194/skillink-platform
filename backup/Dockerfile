FROM postgres:15-alpine

COPY backup.sh /backup.sh
RUN chmod +x /backup.sh

# Sleep loop: runs backup every 24 hours.
# Avoids dcron/crond which require setpgid — blocked by Docker's default seccomp policy.
CMD ["sh", "-c", "while true; do /backup.sh; sleep 86400; done"]
