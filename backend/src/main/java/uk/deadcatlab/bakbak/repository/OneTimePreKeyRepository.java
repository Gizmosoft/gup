package uk.deadcatlab.bakbak.repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import uk.deadcatlab.bakbak.model.OneTimePreKey;

public interface OneTimePreKeyRepository extends JpaRepository<OneTimePreKey, OneTimePreKey.OneTimePreKeyId> {

	@Query("""
		SELECT o FROM OneTimePreKey o
		WHERE o.userId = :userId AND o.consumedAt IS NULL
		ORDER BY o.keyId ASC
		""")
	List<OneTimePreKey> findAvailable(@Param("userId") Long userId, Pageable pageable);

	default Optional<OneTimePreKey> findNextAvailable(Long userId) {
		List<OneTimePreKey> keys = findAvailable(userId, Pageable.ofSize(1));
		return keys.isEmpty() ? Optional.empty() : Optional.of(keys.getFirst());
	}

	@Modifying(clearAutomatically = true, flushAutomatically = true)
	@Query("""
		UPDATE OneTimePreKey o
		SET o.consumedAt = :consumedAt
		WHERE o.userId = :userId AND o.keyId = :keyId AND o.consumedAt IS NULL
		""")
	int markConsumed(
		@Param("userId") Long userId,
		@Param("keyId") Integer keyId,
		@Param("consumedAt") Instant consumedAt
	);

	long countByUserIdAndConsumedAtIsNull(Long userId);

	Optional<OneTimePreKey> findByUserIdAndKeyId(Long userId, Integer keyId);
}
