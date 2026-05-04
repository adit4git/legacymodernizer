package com.example.outputfolder.dto;

import com.example.outputfolder.domain.OrderStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotNull;

/**
 * Immutable request DTO for the {@code PATCH /api/orders/{id}/status} endpoint.
 *
 * <p>The legacy .NET controller accepted a raw {@code [FromBody] OrderStatus status}.
 * Wrapping it in a DTO is idiomatic Spring and plays well with OpenAPI documentation
 * and Bean Validation.
 */
@Schema(description = "Payload for updating an order's lifecycle status")
public record UpdateOrderStatusRequest(

        @Schema(description = "The new status to apply to the order", example = "SHIPPED")
        @NotNull(message = "status is required")
        OrderStatus status
) {}
