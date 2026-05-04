package com.example.outputfolder.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.*;

import java.math.BigDecimal;

/**
 * Immutable request DTO for creating or updating a product.
 *
 * <p>Mirrors the mutable fields of the legacy C# {@code Product} model that the
 * controller accepted via {@code [FromBody]}, adding Bean Validation constraints
 * that were previously expressed via Data Annotations in .NET.
 *
 * <p>Used for both {@code POST /api/products} (create) and
 * {@code PUT /api/products/{id}} (full update).
 */
@Schema(description = "Payload for creating or fully updating a product")
public record ProductRequest(

        @Schema(description = "Display name of the product", example = "Contoso Widget Pro")
        @NotBlank(message = "name must not be blank")
        @Size(max = 120, message = "name must not exceed 120 characters")
        String name,

        @Schema(description = "Optional long-form description", example = "The best widget on the market.")
        @Size(max = 2000, message = "description must not exceed 2 000 characters")
        String description,

        @Schema(description = "Unit price in USD", example = "29.99")
        @NotNull(message = "price is required")
        @DecimalMin(value = "0.00", message = "price must be ≥ 0")
        @DecimalMax(value = "999999.99", message = "price must be ≤ 999 999.99")
        @Digits(integer = 6, fraction = 2, message = "price must have at most 6 integer digits and 2 decimal places")
        BigDecimal price,

        @Schema(description = "Available stock quantity", example = "100")
        @NotNull(message = "stockQuantity is required")
        @Min(value = 0, message = "stockQuantity must be ≥ 0")
        Integer stockQuantity,

        @Schema(description = "Product category", example = "WIDGETS")
        @Size(max = 60, message = "category must not exceed 60 characters")
        String category
) {}
