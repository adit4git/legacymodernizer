package com.example.outputfolder.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationConverter;
import org.springframework.security.oauth2.server.resource.authentication.JwtGrantedAuthoritiesConverter;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;
import org.springframework.security.web.header.writers.ReferrerPolicyHeaderWriter;

/**
 * Spring Security configuration for the ContosoStore API.
 *
 * <p>Mirrors the legacy .NET JWT bearer setup in {@code Program.cs}:
 * <ul>
 *   <li>Symmetric-key JWT validation → OAuth2 Resource Server (JWT) using JWKS or issuer-URI
 *       configured in {@code application.yml}.</li>
 *   <li>Anonymous access on read-only {@code /api/products} endpoints.</li>
 *   <li>All {@code /api/orders/**} endpoints require an authenticated token.</li>
 *   <li>Role-based write operations enforced at method level via {@code @PreAuthorize}
 *       (see {@link com.example.outputfolder.controller.ProductsController} and
 *       {@link com.example.outputfolder.controller.OrdersController}).</li>
 *   <li>CSRF disabled — stateless REST API; tokens are bearer credentials, not cookies.</li>
 *   <li>Sessions never created — stateless JWT flow.</li>
 * </ul>
 *
 * <p>Roles extracted from the JWT claim {@code roles} (Spring default for
 * {@code ROLE_} prefix) so that {@code @PreAuthorize("hasRole('Admin')")} works
 * out-of-the-box.
 */
@Configuration
@EnableWebSecurity
@EnableMethodSecurity(prePostEnabled = true)
public class SecurityConfig {

    // ── Permitted public paths ───────────────────────────────────────────────

    /** OpenAPI / Swagger UI paths — always public so developers can browse the spec. */
    private static final String[] SWAGGER_PATHS = {
        "/swagger-ui.html",
        "/swagger-ui/**",
        "/v3/api-docs",
        "/v3/api-docs/**"
    };

    /** Actuator health probes are accessed by Kubernetes/OpenShift without credentials. */
    private static final String[] ACTUATOR_PUBLIC_PATHS = {
        "/actuator/health",
        "/actuator/health/liveness",
        "/actuator/health/readiness"
    };

    // ── Security filter chain ────────────────────────────────────────────────

    /**
     * Configures the main {@link SecurityFilterChain} for the API.
     *
     * @param http the {@link HttpSecurity} builder supplied by Spring
     * @return the built {@link SecurityFilterChain}
     * @throws Exception if configuration fails
     */
    @Bean
    public SecurityFilterChain apiSecurityFilterChain(HttpSecurity http) throws Exception {

        http
            // ── Session / CSRF ───────────────────────────────────────────────
            // Stateless API: no HTTP session, no CSRF token needed.
            .sessionManagement(sm ->
                sm.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .securityContext(sc ->
                sc.securityContextRepository(new RequestAttributeSecurityContextRepository()))
            .csrf(AbstractHttpConfigurer::disable)

            // ── Security headers ─────────────────────────────────────────────
            .headers(headers -> headers
                .frameOptions(fo -> fo.deny())
                .contentTypeOptions(cto -> {})
                .referrerPolicy(rp ->
                    rp.policy(ReferrerPolicyHeaderWriter.ReferrerPolicy.NO_REFERRER))
                .httpStrictTransportSecurity(hsts ->
                    hsts.maxAgeInSeconds(31_536_000).includeSubDomains(true).preload(true))
            )

            // ── Authorisation rules ──────────────────────────────────────────
            .authorizeHttpRequests(auth -> auth

                // Swagger / OpenAPI — fully public
                .requestMatchers(SWAGGER_PATHS).permitAll()

                // Actuator liveness + readiness — public (scraped by orchestrator)
                .requestMatchers(ACTUATOR_PUBLIC_PATHS).permitAll()

                // Remaining actuator endpoints (e.g. /actuator/prometheus) — authenticated
                .requestMatchers("/actuator/**").authenticated()

                // Product catalogue reads — anonymous (mirrors legacy [AllowAnonymous] default)
                .requestMatchers(HttpMethod.GET, "/api/products", "/api/products/**").permitAll()

                // All order endpoints require a valid JWT (mirrors [Authorize] on OrdersController)
                .requestMatchers("/api/orders/**").authenticated()

                // Everything else must be authenticated
                .anyRequest().authenticated()
            )

            // ── OAuth2 Resource Server (JWT bearer) ──────────────────────────
            // Replaces Microsoft.AspNetCore.Authentication.JwtBearer; configuration
            // (issuer-uri / jwk-set-uri) lives in application.yml under
            // spring.security.oauth2.resourceserver.jwt.*
            .oauth2ResourceServer(oauth2 ->
                oauth2.jwt(jwt ->
                    jwt.jwtAuthenticationConverter(jwtAuthenticationConverter()))
            );

        return http.build();
    }

    // ── JWT → authorities converter ──────────────────────────────────────────

    /**
     * Converts the JWT {@code roles} claim into Spring Security
     * {@code GrantedAuthority} objects prefixed with {@code ROLE_}.
     *
     * <p>Legacy .NET used {@code ClaimTypes.Role} ("roles" claim name) populated
     * by the JWT middleware.  This converter reads the same claim so that
     * {@code @PreAuthorize("hasRole('Admin')")} and similar expressions resolve
     * correctly without any additional claim mapping.
     *
     * @return a configured {@link JwtAuthenticationConverter}
     */
    @Bean
    public JwtAuthenticationConverter jwtAuthenticationConverter() {
        JwtGrantedAuthoritiesConverter grantedAuthoritiesConverter =
            new JwtGrantedAuthoritiesConverter();

        // The legacy token stores roles in a "roles" claim (not the default "scope")
        grantedAuthoritiesConverter.setAuthoritiesClaimName("roles");

        // Spring Security will prepend ROLE_ automatically so hasRole('Admin')
        // matches the raw claim value "Admin".
        grantedAuthoritiesConverter.setAuthorityPrefix("ROLE_");

        JwtAuthenticationConverter authConverter = new JwtAuthenticationConverter();
        authConverter.setJwtGrantedAuthoritiesConverter(grantedAuthoritiesConverter);
        return authConverter;
    }
}
