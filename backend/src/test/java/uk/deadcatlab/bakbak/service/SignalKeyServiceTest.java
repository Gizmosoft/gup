package uk.deadcatlab.bakbak.service;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import org.mockito.Mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import org.mockito.junit.jupiter.MockitoExtension;

import uk.deadcatlab.bakbak.dto.request.PublishKeysRequest;
import uk.deadcatlab.bakbak.dto.response.PreKeyBundleResponse;
import uk.deadcatlab.bakbak.exception.ResourceNotFoundException;
import uk.deadcatlab.bakbak.model.OneTimePreKey;
import uk.deadcatlab.bakbak.model.SignedPreKey;
import uk.deadcatlab.bakbak.model.UserIdentityKey;
import uk.deadcatlab.bakbak.repository.OneTimePreKeyRepository;
import uk.deadcatlab.bakbak.repository.SignedPreKeyRepository;
import uk.deadcatlab.bakbak.repository.UserIdentityKeyRepository;
import uk.deadcatlab.bakbak.repository.UserRepository;

@ExtendWith(MockitoExtension.class)
class SignalKeyServiceTest {

	@Mock UserRepository userRepository;
	@Mock UserIdentityKeyRepository identityKeyRepository;
	@Mock SignedPreKeyRepository signedPreKeyRepository;
	@Mock OneTimePreKeyRepository oneTimePreKeyRepository;

	SignalKeyService signalKeyService;

	@BeforeEach
	void setUp() {
		signalKeyService = new SignalKeyService(
			userRepository,
			identityKeyRepository,
			signedPreKeyRepository,
			oneTimePreKeyRepository
		);
	}

	@Test
	void publishKeys_persistsIdentitySignedAndOneTimeKeys() {
		when(userRepository.existsById(1L)).thenReturn(true);
		when(identityKeyRepository.findByUserId(1L)).thenReturn(Optional.empty());
		when(oneTimePreKeyRepository.findByUserIdAndKeyId(1L, 1)).thenReturn(Optional.empty());

		PublishKeysRequest request = new PublishKeysRequest(
			42,
			"ik-pub",
			new PublishKeysRequest.SignedPreKeyUpload(7, "spk-pub", "sig"),
			List.of(new PublishKeysRequest.OneTimePreKeyUpload(1, "otpk-pub"))
		);

		signalKeyService.publishKeys(1L, request);

		ArgumentCaptor<UserIdentityKey> identityCaptor = ArgumentCaptor.forClass(UserIdentityKey.class);
		verify(identityKeyRepository).save(identityCaptor.capture());
		assertThat(identityCaptor.getValue().getRegistrationId()).isEqualTo(42);
		assertThat(identityCaptor.getValue().getIdentityKeyPublic()).isEqualTo("ik-pub");

		verify(signedPreKeyRepository).save(any(SignedPreKey.class));
		verify(oneTimePreKeyRepository).save(any(OneTimePreKey.class));
	}

	@Test
	void getBundle_consumesOneTimePreKeyWhenAvailable() {
		when(identityKeyRepository.findByUserId(2L)).thenReturn(Optional.of(UserIdentityKey.builder()
			.userId(2L)
			.registrationId(9)
			.identityKeyPublic("ik")
			.build()));
		when(signedPreKeyRepository.findLatestByUserId(2L)).thenReturn(Optional.of(SignedPreKey.builder()
			.userId(2L)
			.keyId(3)
			.publicKey("spk")
			.signature("sig")
			.createdAt(Instant.now())
			.build()));
		when(oneTimePreKeyRepository.findNextAvailable(2L)).thenReturn(Optional.of(OneTimePreKey.builder()
			.userId(2L)
			.keyId(11)
			.publicKey("otpk")
			.build()));
		when(oneTimePreKeyRepository.markConsumed(eq(2L), eq(11), any())).thenReturn(1);

		PreKeyBundleResponse bundle = signalKeyService.getBundle(2L);

		assertThat(bundle.identityKey()).isEqualTo("ik");
		assertThat(bundle.signedPreKey().keyId()).isEqualTo(3);
		assertThat(bundle.oneTimePreKey()).isNotNull();
		assertThat(bundle.oneTimePreKey().keyId()).isEqualTo(11);
		verify(oneTimePreKeyRepository).markConsumed(eq(2L), eq(11), any());
	}

	@Test
	void getBundle_omitsOneTimePreKeyWhenNoneAvailable() {
		when(identityKeyRepository.findByUserId(2L)).thenReturn(Optional.of(UserIdentityKey.builder()
			.userId(2L)
			.registrationId(9)
			.identityKeyPublic("ik")
			.build()));
		when(signedPreKeyRepository.findLatestByUserId(2L)).thenReturn(Optional.of(SignedPreKey.builder()
			.userId(2L)
			.keyId(3)
			.publicKey("spk")
			.signature("sig")
			.createdAt(Instant.now())
			.build()));
		when(oneTimePreKeyRepository.findNextAvailable(2L)).thenReturn(Optional.empty());

		PreKeyBundleResponse bundle = signalKeyService.getBundle(2L);

		assertThat(bundle.oneTimePreKey()).isNull();
		verify(oneTimePreKeyRepository, never()).markConsumed(any(), any(), any());
	}

	@Test
	void getPublishedIdentity_returnsIdentityWithoutConsumingOtpk() {
		when(identityKeyRepository.findByUserId(2L)).thenReturn(Optional.of(UserIdentityKey.builder()
			.userId(2L)
			.registrationId(9)
			.identityKeyPublic("ik")
			.build()));

		var published = signalKeyService.getPublishedIdentity(2L);

		assertThat(published.userId()).isEqualTo(2L);
		assertThat(published.registrationId()).isEqualTo(9);
		assertThat(published.identityKey()).isEqualTo("ik");
		verify(oneTimePreKeyRepository, never()).findNextAvailable(any());
		verify(oneTimePreKeyRepository, never()).markConsumed(any(), any(), any());
	}

	@Test
	void getBundle_throwsWhenIdentityMissing() {
		when(identityKeyRepository.findByUserId(99L)).thenReturn(Optional.empty());
		assertThatThrownBy(() -> signalKeyService.getBundle(99L))
			.isInstanceOf(ResourceNotFoundException.class);
	}

	@Test
	void getPublishedIdentity_throwsWhenIdentityMissing() {
		when(identityKeyRepository.findByUserId(99L)).thenReturn(Optional.empty());
		assertThatThrownBy(() -> signalKeyService.getPublishedIdentity(99L))
			.isInstanceOf(ResourceNotFoundException.class);
	}
}
