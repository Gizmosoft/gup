package uk.deadcatlab.bakbak.controller;

import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import uk.deadcatlab.bakbak.dto.request.PublishKeysRequest;
import uk.deadcatlab.bakbak.dto.request.ReplenishOneTimePreKeysRequest;
import uk.deadcatlab.bakbak.dto.request.RotateSignedPreKeyRequest;
import uk.deadcatlab.bakbak.dto.response.KeyStatusResponse;
import uk.deadcatlab.bakbak.dto.response.PreKeyBundleResponse;
import uk.deadcatlab.bakbak.dto.response.PublishedIdentityResponse;
import uk.deadcatlab.bakbak.service.SignalKeyService;
import uk.deadcatlab.bakbak.service.UserService;

/**
 * Authenticated Signal Protocol public-key endpoints.
 */
@RestController
@RequestMapping("/api/keys")
public class KeyController {

	private final SignalKeyService signalKeyService;
	private final UserService userService;

	public KeyController(SignalKeyService signalKeyService, UserService userService) {
		this.signalKeyService = signalKeyService;
		this.userService = userService;
	}

	@PutMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void publishKeys(@Valid @RequestBody PublishKeysRequest request, Authentication authentication) {
		long userId = ControllerAuthSupport.requireCurrentUserId(authentication, userService);
		signalKeyService.publishKeys(userId, request);
	}

	@GetMapping("/bundle/{userId}")
	public PreKeyBundleResponse getBundle(@PathVariable Long userId, Authentication authentication) {
		ControllerAuthSupport.requireCurrentUserId(authentication, userService);
		return signalKeyService.getBundle(userId);
	}

	@GetMapping("/identity/{userId}")
	public PublishedIdentityResponse getPublishedIdentity(
		@PathVariable Long userId,
		Authentication authentication
	) {
		ControllerAuthSupport.requireCurrentUserId(authentication, userService);
		return signalKeyService.getPublishedIdentity(userId);
	}

	@PostMapping("/signed-prekey")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void rotateSignedPreKey(
		@Valid @RequestBody RotateSignedPreKeyRequest request,
		Authentication authentication
	) {
		long userId = ControllerAuthSupport.requireCurrentUserId(authentication, userService);
		signalKeyService.rotateSignedPreKey(userId, request);
	}

	@PostMapping("/onetime")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void replenishOneTimePreKeys(
		@Valid @RequestBody ReplenishOneTimePreKeysRequest request,
		Authentication authentication
	) {
		long userId = ControllerAuthSupport.requireCurrentUserId(authentication, userService);
		signalKeyService.replenishOneTimePreKeys(userId, request);
	}

	@GetMapping("/status")
	public KeyStatusResponse status(Authentication authentication) {
		long userId = ControllerAuthSupport.requireCurrentUserId(authentication, userService);
		return signalKeyService.status(userId);
	}
}
