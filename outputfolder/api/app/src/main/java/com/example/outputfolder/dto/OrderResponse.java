package com.example.outputfolder.dto;

import com.example.outputfolder.domain.OrderStatus;
import io.swagger.v3.oas.annotations.media.Schema;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

/**
 * Immutable response DTO for an order resource (including its line items).
 *
 * <p>Constructed by {@link com.example.outputfolder.mapper.OrderMapper} from an
 * {@link com.example.outputfolder.domain.Order} entity.
 *
 * <p>The nested {@code items} list mirrors the EF Core
 * {@code .Include(o => o.Items)} eager-load the legacy API performed.
 */
@Schema(description = "Order resource as returned by the API")
public record OrderResponse(

        @Schema(description = "Unique identifier of the order", example = "7")
        Long id,

        @Schema(description = "Customer's e-mail address", example = "alice@example.com")
        String customerEmail,

        @Schema(description = "UTC timestamp when the order was placed", example = "2024-06-01T09:00:00Z")
        Instant placedAt,

        @Schema(description = "Current lifecycle status of the order", example = "PENDING")
        OrderStatus status,

        @Schema(description = "Total order amount in USD", example = "59.98")
        BigDecimal totalAmount,

        @Schema(description = "Line items belonging to this order")
        List<OrderItemResponse> items
) {}
