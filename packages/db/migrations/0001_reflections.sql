-- Reflexion-style episodic memory. Additive only.
CREATE TABLE IF NOT EXISTS `reflections` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `run_id` VARCHAR(36) NOT NULL,
  `agent` VARCHAR(32) NOT NULL,
  `vertical_slug` VARCHAR(64) NULL,
  `body` TEXT NOT NULL,
  `metrics_json` TEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `refl_run_idx` ON `reflections` (`run_id`);
CREATE INDEX `refl_agent_idx` ON `reflections` (`agent`);
CREATE INDEX `refl_vertical_idx` ON `reflections` (`vertical_slug`);
CREATE INDEX `refl_created_idx` ON `reflections` (`created_at`);
