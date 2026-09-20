package uk.deadcatlab.bakbak.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import uk.deadcatlab.bakbak.dto.response.HealthResponse;
import uk.deadcatlab.bakbak.service.HealthService;

/**
 * Public liveness/readiness probe that also writes to Postgres.
 *
 * <p>Use {@code GET /health} from the host or reverse proxy to verify the API container can
 * reach the database container.</p>
 */
@RestController
public class HealthController {

	private final HealthService healthService;

	public HealthController(HealthService healthService) {
		this.healthService = healthService;
	}

	@GetMapping("/health")
	public HealthResponse health() {
		return healthService.check();
	}
}
