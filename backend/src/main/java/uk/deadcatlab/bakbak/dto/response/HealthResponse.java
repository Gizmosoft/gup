package uk.deadcatlab.bakbak.dto.response;

import java.time.Instant;

/** Response for {@code GET /health} — confirms API process and Postgres write path. */
public record HealthResponse(String status, long checkCount, Instant lastCheckedAt) {}
