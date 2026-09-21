package uk.deadcatlab.bakbak.service;

import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import uk.deadcatlab.bakbak.dto.request.PublishKeysRequest;
import uk.deadcatlab.bakbak.dto.request.ReplenishOneTimePreKeysRequest;
import uk.deadcatlab.bakbak.dto.request.RotateSignedPreKeyRequest;
import uk.deadcatlab.bakbak.dto.response.KeyStatusResponse;
import uk.deadcatlab.bakbak.dto.response.PreKeyBundleResponse;
import uk.deadcatlab.bakbak.exception.ResourceNotFoundException;
import uk.deadcatlab.bakbak.model.OneTimePreKey;
import uk.deadcatlab.bakbak.model.SignedPreKey;
import uk.deadcatlab.bakbak.model.UserIdentityKey;
import uk.deadcatlab.bakbak.repository.OneTimePreKeyRepository;
import uk.deadcatlab.bakbak.repository.SignedPreKeyRepository;
import uk.deadcatlab.bakbak.repository.UserIdentityKeyRepository;
import uk.deadcatlab.bakbak.repository.UserRepository;

/**
 * Stores and serves Signal Protocol public key material. Never handles private keys.
 */
@Service
public class SignalKeyService {

	private final UserRepository userRepository;
	private final UserIdentityKeyRepository identityKeyRepository;
	private final SignedPreKeyRepository signedPreKeyRepository;
	private final OneTimePreKeyRepository oneTimePreKeyRepository;

	public SignalKeyService(
		UserRepository userRepository,
		UserIdentityKeyRepository identityKeyRepository,
		SignedPreKeyRepository signedPreKeyRepository,
		OneTimePreKeyRepository oneTimePreKeyRepository
	) {
		this.userRepository = userRepository;
		this.identityKeyRepository = identityKeyRepository;
		this.signedPreKeyRepository = signedPreKeyRepository;
		this.oneTimePreKeyRepository = oneTimePreKeyRepository;
	}

	@Transactional
	public void publishKeys(Long userId, PublishKeysRequest request) {
		requireUser(userId);
		assertUniqueOtpkIds(request.oneTimePreKeys().stream().map(PublishKeysRequest.OneTimePreKeyUpload::keyId).toList());

		UserIdentityKey identity = identityKeyRepository.findByUserId(userId)
			.orElse(UserIdentityKey.builder().userId(userId).build());
		identity.setRegistrationId(request.registrationId());
		identity.setIdentityKeyPublic(request.identityKey());
		identity.setRotatedAt(Instant.now());
		identityKeyRepository.save(identity);

		PublishKeysRequest.SignedPreKeyUpload spk = request.signedPreKey();
		signedPreKeyRepository.save(SignedPreKey.builder()
			.userId(userId)
			.keyId(spk.keyId())
			.publicKey(spk.publicKey())
			.signature(spk.signature())
			.createdAt(Instant.now())
			.build());

		upsertOneTimePreKeys(userId, request.oneTimePreKeys());
	}

	@Transactional
	public void rotateSignedPreKey(Long userId, RotateSignedPreKeyRequest request) {
		requireUser(userId);
		if (identityKeyRepository.findByUserId(userId).isEmpty()) {
			throw new ResourceNotFoundException("Identity keys not published");
		}
		signedPreKeyRepository.save(SignedPreKey.builder()
			.userId(userId)
			.keyId(request.keyId())
			.publicKey(request.publicKey())
			.signature(request.signature())
			.createdAt(Instant.now())
			.build());
	}

	@Transactional
	public void replenishOneTimePreKeys(Long userId, ReplenishOneTimePreKeysRequest request) {
		requireUser(userId);
		if (identityKeyRepository.findByUserId(userId).isEmpty()) {
			throw new ResourceNotFoundException("Identity keys not published");
		}
		assertUniqueOtpkIds(request.oneTimePreKeys().stream().map(PublishKeysRequest.OneTimePreKeyUpload::keyId).toList());
		upsertOneTimePreKeys(userId, request.oneTimePreKeys());
	}

	@Transactional
	public PreKeyBundleResponse getBundle(Long userId) {
		UserIdentityKey identity = identityKeyRepository.findByUserId(userId)
			.orElseThrow(() -> new ResourceNotFoundException("User has no published keys"));
		SignedPreKey signedPreKey = signedPreKeyRepository.findLatestByUserId(userId)
			.orElseThrow(() -> new ResourceNotFoundException("User has no signed prekey"));

		PreKeyBundleResponse.OneTimePreKeyPublic otpk = null;
		var next = oneTimePreKeyRepository.findNextAvailable(userId);
		if (next.isPresent()) {
			OneTimePreKey key = next.get();
			int updated = oneTimePreKeyRepository.markConsumed(userId, key.getKeyId(), Instant.now());
			if (updated == 1) {
				otpk = new PreKeyBundleResponse.OneTimePreKeyPublic(key.getKeyId(), key.getPublicKey());
			}
		}

		return new PreKeyBundleResponse(
			userId,
			identity.getRegistrationId(),
			identity.getIdentityKeyPublic(),
			new PreKeyBundleResponse.SignedPreKeyPublic(
				signedPreKey.getKeyId(),
				signedPreKey.getPublicKey(),
				signedPreKey.getSignature()
			),
			otpk
		);
	}

	@Transactional(readOnly = true)
	public KeyStatusResponse status(Long userId) {
		var identity = identityKeyRepository.findByUserId(userId);
		if (identity.isEmpty()) {
			return new KeyStatusResponse(false, null, 0, null);
		}
		Integer signedPreKeyId = signedPreKeyRepository.findLatestByUserId(userId)
			.map(SignedPreKey::getKeyId)
			.orElse(null);
		long remaining = oneTimePreKeyRepository.countByUserIdAndConsumedAtIsNull(userId);
		return new KeyStatusResponse(true, identity.get().getRegistrationId(), remaining, signedPreKeyId);
	}

	private void upsertOneTimePreKeys(Long userId, List<PublishKeysRequest.OneTimePreKeyUpload> uploads) {
		Instant now = Instant.now();
		for (PublishKeysRequest.OneTimePreKeyUpload upload : uploads) {
			OneTimePreKey existing = oneTimePreKeyRepository.findByUserIdAndKeyId(userId, upload.keyId()).orElse(null);
			if (existing != null) {
				if (existing.getConsumedAt() != null) {
					continue;
				}
				existing.setPublicKey(upload.publicKey());
				oneTimePreKeyRepository.save(existing);
			} else {
				oneTimePreKeyRepository.save(OneTimePreKey.builder()
					.userId(userId)
					.keyId(upload.keyId())
					.publicKey(upload.publicKey())
					.createdAt(now)
					.build());
			}
		}
	}

	private void requireUser(Long userId) {
		if (!userRepository.existsById(userId)) {
			throw new ResourceNotFoundException("User not found");
		}
	}

	private static void assertUniqueOtpkIds(List<Integer> keyIds) {
		Set<Integer> seen = new HashSet<>();
		for (Integer keyId : keyIds) {
			if (!seen.add(keyId)) {
				throw new IllegalArgumentException("Duplicate one-time prekey id: " + keyId);
			}
		}
	}
}
