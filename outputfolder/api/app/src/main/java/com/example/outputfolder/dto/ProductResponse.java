package com.example.outputfolder.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.Instant;

/**
 * Immutable response DTO for a product resource.
 *
 * <p>Constructed by {@link com.example.outputfolder.mapper.ProductMapper} from a
 * {@link com.example.outputfolder.domain.Product} entity.
 * Only active fields are included; the {@code isActive} flag is intentionally
 * omitted from the response (inactive products are never returned to callers).
 */
@Schema(description = "Product resource as returned by the API")
public record ProductResponse(

        @Schema(description = "Unique identifier of the product", example = "42")
        Long id,

        @Schema(description = "Display name", example = "Contoso Widget Pro")
        String name,

        @Schema(description = "Optional long-form description", example = "The best widget on the market.")
        String description,

        @Schema(description = "Unit price in USD", example = "29.99")
        BigDecimal price,

        @Schema(description = "Available stock quantity", example = "100")
        int stockQuantity,

        @Schema(description = "Product category", example = "WIDGETS")
        String category,

        @Schema(description = "UTC timestamp when the product was created", example = "2024-01-15T10:30:00Z")
        Instant createdAt,

        @Schema(description = "UTC timestamp of the most recent update; null if never updated",
                example = "2024-06-01T08:00:00Z", nullable = true)
        Instant updatedAt
) {}
