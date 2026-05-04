package com.example.outputfolder.dto;

import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;

/**
 * Immutable response DTO for a single order line item within an {@link OrderResponse}.
 *
 * <p>Mirrors the fields of the legacy C# {@code OrderItem} model, which was
 * serialised inline inside the {@code Order} JSON response.
 */
@Schema(description = "A single line item within an order response")
public record OrderItemResponse(

        @Schema(description = "Unique identifier of the order item", example = "15")
        Long id,

        @Schema(description = "ID of the product that was ordered", example = "42")
        Long productId,

        @Schema(description = "Quantity ordered", example = "2")
        int quantity,

        @Schema(description = "Unit price captured at the time of order placement", example = "29.99")
        BigDecimal unitPrice,

        @Schema(description = "Line total (unitPrice × quantity)", example = "59.98")
        BigDecimal lineTotal
) {}
