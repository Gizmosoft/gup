package uk.deadcatlab.bakbak.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.HttpStatusEntryPoint;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfigurationSource;

import uk.deadcatlab.bakbak.security.JwtAuthFilter;

/**
 * Central Spring Security configuration for the API.
 *
 * <p>Authentication is stateless JWT (no sessions). Only auth endpoints are public; everything else
 * requires a valid token via {@code Authorization: Bearer <jwt>}.</p>
 */
@Configuration
@EnableMethodSecurity
public class SecurityConfig {

	@Bean
    @SuppressWarnings("unused")
	SecurityFilterChain securityFilterChain(
		HttpSecurity http,
		JwtAuthFilter jwtAuthFilter,
		CorsConfigurationSource corsConfigurationSource
	) throws Exception {
		return http
			.csrf(csrf -> csrf.disable())
			.cors(cors -> cors.configurationSource(corsConfigurationSource))
			.sessionManagement(sm -> sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
			// Without this, the default entry point is often Http403ForbiddenEntryPoint → 403 for missing JWT.
			.exceptionHandling(ex -> ex.authenticationEntryPoint(new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))
			.authorizeHttpRequests(auth -> auth
				// Public endpoints:
				.requestMatchers("/api/auth/**", "/health", "/error", "/ws/**", "/ws-native").permitAll()
				// Everything else is protected by default.
				.anyRequest().authenticated()
			)
			.addFilterBefore(jwtAuthFilter, UsernamePasswordAuthenticationFilter.class)
			.build();
	}

	@Bean
    @SuppressWarnings("unused")
	PasswordEncoder passwordEncoder() {
		// BCrypt with cost factor 12 as per the design doc.
		return new BCryptPasswordEncoder(12);
	}
}

