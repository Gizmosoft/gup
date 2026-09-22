package uk.deadcatlab.bakbak.dto.response;

/**
 * Public identity material for detecting a peer who regenerated keys.
 * Does not consume a one-time prekey.
 */
public record PublishedIdentityResponse(
	Long userId,
	Integer registrationId,
	String identityKey
) {}
