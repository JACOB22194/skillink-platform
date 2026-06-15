-- Add profile columns to users table (idempotent)
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS first_name  VARCHAR(100),
    ADD COLUMN IF NOT EXISTS last_name   VARCHAR(100),
    ADD COLUMN IF NOT EXISTS avatar_url  VARCHAR(500),
    ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ DEFAULT NOW();

-- Add country column to freelancers table (idempotent)
ALTER TABLE freelancers
    ADD COLUMN IF NOT EXISTS country  VARCHAR(100);

CREATE INDEX IF NOT EXISTS ix_freelancers_country ON freelancers (country);

-- Add avatar_url to clients table (idempotent)
ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS avatar_url  VARCHAR(500);

-- Add verification, feedback, and escrow columns to milestones table (idempotent)
ALTER TABLE milestones
    ADD COLUMN IF NOT EXISTS title                   VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS description             TEXT         NULL,
    ADD COLUMN IF NOT EXISTS due_date                TIMESTAMP WITH TIME ZONE NULL,
    ADD COLUMN IF NOT EXISTS created_at              TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS ai_verification_status  VARCHAR(20)  NULL,
    ADD COLUMN IF NOT EXISTS ai_verification_report  TEXT         NULL,
    ADD COLUMN IF NOT EXISTS revision_feedback       TEXT         NULL,
    ADD COLUMN IF NOT EXISTS revision_count          INTEGER      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS funded_at               TIMESTAMP WITH TIME ZONE NULL,
    ADD COLUMN IF NOT EXISTS submitted_at            TIMESTAMP WITH TIME ZONE NULL,
    ADD COLUMN IF NOT EXISTS deadline                TIMESTAMP WITH TIME ZONE NULL,
    ADD COLUMN IF NOT EXISTS escrow_transaction_id   INTEGER      NULL REFERENCES escrow_transactions(escrow_transaction_id);

-- Patch milestonestatus enum values (idempotent, PostgreSQL 12+)
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'revision_requested';
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'awaiting_funds';
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'funded';
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'in_review';
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'in_revision';
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'in_dispute';
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'closed_success';
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'closed_refunded';
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'closed_auto_approve';
ALTER TYPE milestonestatus ADD VALUE IF NOT EXISTS 'closed_auto_refund';
