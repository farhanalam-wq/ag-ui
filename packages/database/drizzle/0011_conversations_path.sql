-- Which page the visitor was on when they started a conversation.
--
-- The agent's quality report needs one join it previously could not make:
-- `messages` -> `conversations` -> *page*. The events stream knows the path
-- (the parent page emits it), but a conversation is not linked to an event,
-- so "which pages can the agent answer from" was unanswerable. The panel now
-- sends the host path with the chat request, the API normalises it with the
-- same rule the collector uses, and it lands here once, at creation.
--
-- Nullable on purpose: every conversation created before this migration has
-- no known path, and the playground has no page. A null path is excluded from
-- the per-page breakdown rather than counted as "/".

ALTER TABLE "conversations" ADD COLUMN "path" text;
