package uk.deadcatlab.bakbak.service;

import java.sql.Timestamp;
import java.time.Instant;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import uk.deadcatlab.bakbak.dto.response.HealthResponse;

/**
 * Increments the singleton {@code health} row so a single HTTP check proves API + DB together.
 */
@Service
public class HealthService {

	private final JdbcTemplate jdbcTemplate;

	public HealthService(JdbcTemplate jdbcTemplate) {
		this.jdbcTemplate = jdbcTemplate;
	}

	public HealthResponse check() {
		HealthResponse response = jdbcTemplate.query(
			"""
				UPDATE health
				SET check_count = check_count + 1,
				    last_checked_at = NOW()
				WHERE id = 1
				RETURNING check_count, last_checked_at
				""",
			rs -> {
				if (!rs.next()) {
					return null;
				}
				long count = rs.getLong("check_count");
				Timestamp checkedAt = rs.getTimestamp("last_checked_at");
				Instant instant = checkedAt != null ? checkedAt.toInstant() : Instant.now();
				return new HealthResponse("UP", count, instant);
			}
		);

		if (response == null) {
			throw new IllegalStateException("health table is missing its singleton row (id=1)");
		}
		return response;
	}
}
