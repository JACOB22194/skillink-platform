"""
run_worker.py — Standalone background worker entry point
=========================================================
Run as a SEPARATE PROCESS / Docker service:

    docker-compose service: `python run_worker.py`

Why separate from main.py?
  Uvicorn runs multiple worker processes (e.g. --workers 4). Attaching
  APScheduler to the FastAPI lifespan spawns one scheduler per process,
  causing every job to run 4× simultaneously — duplicate DB writes and
  duplicate notifications. This process runs exactly one scheduler instance.
"""

import logging
import time

from logging_config import setup_logging

setup_logging("INFO", "skilllink-worker")
logger = logging.getLogger(__name__)

from workers.milestone_worker import scheduler

if __name__ == "__main__":
    logger.info("Starting Skillink milestone background worker...")
    scheduler.start()
    logger.info("Scheduler started. Jobs: %s", [j.id for j in scheduler.get_jobs()])
    try:
        while True:
            time.sleep(1)
    except (KeyboardInterrupt, SystemExit):
        logger.info("Worker shutting down...")
        scheduler.shutdown(wait=False)
        logger.info("Worker stopped.")
