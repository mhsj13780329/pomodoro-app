-- Stats look up sessions by when they ended (that is the local day they count on).
-- The existing (userId, startedAt) index does not help a filter on endedAt.
CREATE INDEX "FocusSession_userId_endedAt_idx" ON "FocusSession"("userId", "endedAt");
