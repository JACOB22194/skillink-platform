-- Migration: extend freelancers table for recommender
-- PostgreSQL 15 — run once against skillink_db

ALTER TABLE freelancers
    ADD COLUMN IF NOT EXISTS professional_title  VARCHAR(120)  NULL,
    ADD COLUMN IF NOT EXISTS github_score        SMALLINT      NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS github_url          VARCHAR(255)  NULL,
    ADD COLUMN IF NOT EXISTS top_languages       TEXT          NULL,
    ADD COLUMN IF NOT EXISTS github_stats        TEXT          NULL,
    ADD COLUMN IF NOT EXISTS profile_text        TEXT          NULL,
    ADD COLUMN IF NOT EXISTS sub_category_tags   TEXT          NULL,
    ADD COLUMN IF NOT EXISTS country             VARCHAR(100)  NULL;

CREATE INDEX IF NOT EXISTS idx_github_score ON freelancers (github_score DESC);
CREATE INDEX IF NOT EXISTS ix_freelancers_country ON freelancers (country);

CREATE TABLE IF NOT EXISTS recommendations (
    recommendation_id  BIGSERIAL    PRIMARY KEY,
    project_id         INTEGER      NOT NULL REFERENCES projects(project_id)   ON DELETE CASCADE,
    freelancer_id      INTEGER      NOT NULL REFERENCES freelancers(freelancer_id) ON DELETE CASCADE,
    match_score        REAL         NOT NULL,
    text_score         REAL         NOT NULL DEFAULT 0,
    skill_score        REAL         NOT NULL DEFAULT 0,
    quality_score      REAL         NOT NULL DEFAULT 0,
    matched_skills     TEXT         NULL,
    created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    UNIQUE (project_id, freelancer_id)
);

CREATE INDEX IF NOT EXISTS idx_project_score ON recommendations (project_id, match_score DESC);
