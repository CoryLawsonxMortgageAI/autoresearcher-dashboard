-- Operator chat. Additive only.
CREATE TABLE IF NOT EXISTS `conversations` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `user_id` VARCHAR(36) NOT NULL,
  `title` VARCHAR(200) NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX `conv_user_idx` ON `conversations` (`user_id`);
CREATE INDEX `conv_updated_idx` ON `conversations` (`updated_at`);

CREATE TABLE IF NOT EXISTS `messages` (
  `id` VARCHAR(36) NOT NULL PRIMARY KEY,
  `conversation_id` VARCHAR(36) NOT NULL,
  `role` ENUM('user','assistant','tool') NOT NULL,
  `content` TEXT NOT NULL,
  `tool_calls` JSON NULL,
  `tool_result_for` VARCHAR(80) NULL,
  `input_tokens` VARCHAR(20) NULL,
  `output_tokens` VARCHAR(20) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX `msg_conv_idx` ON `messages` (`conversation_id`);
CREATE INDEX `msg_created_idx` ON `messages` (`created_at`);
