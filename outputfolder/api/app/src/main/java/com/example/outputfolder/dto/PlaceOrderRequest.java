package com.example.outputfolder.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

import java.util.List;

/**
 * Immutable request DTO for placing a new order.
 *
 * <p>Mirrors the inline C# record from the legacy controller:
 * <pre>{@code
 *   public record PlaceOrderLine(int ProductId, int Qty);
 *   public record PlaceOrderRequest(string Email, List<PlaceOrderLine> Lines);
 * }</pre>
 *
 * <p>Field names are aligned with the Java convention used throughout this service:
 * {@code customerEmail} (was {@code Email}) and {@code items} (was {@code Lines}).
 * This intentional rename improves clarity; API clients receive the JSON field
 * names {@code customerEmail} and {@code items}.
 */
@Schema(description = "Payload for placing a new order")
public record PlaceOrderRequest(

        @Schema(description = "Customer's e-mail address", example = "alice@example.com")
        @NotBlank(message = "customerEmail must not be blank")
        @Email(message = "customerEmail must be a valid e-mail address")
        String customerEmail,

        @Schema(description = "One or more order line items")
        @NotEmpty(message = "items must contain at least one line")
        @Valid
        List<OrderItemRequest> items
) {

    /**
     * A single line item within a {@link PlaceOrderRequest}.
     *
     * <p>Mirrors {@code PlaceOrderLine(int ProductId, int Qty)}.
     */
    @Schema(description = "A single line item in the place-order request")
    public record OrderItemRequest(

            @Schema(description = "ID of the product to order", example = "42")
            @NotNull(message = "productId is required")
            Long productId,

            @Schema(description = "Number of units to order", example = "2")
            @Min(value = 1, message = "quantity must be at least 1")
            int quantity
    ) {}
}
