package com.example.outputfolder.controller;

import com.example.outputfolder.dto.OrderResponse;
import com.example.outputfolder.dto.PlaceOrderRequest;
import com.example.outputfolder.dto.UpdateOrderStatusRequest;
import com.example.outputfolder.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;
import java.util.List;

/**
 * REST controller for order lifecycle management.
 *
 * <p>Preserves the exact route shape of the legacy .NET
 * {@code ContosoStore.Api.Controllers.OrdersController}.
 * The controller-level {@code [Authorize]} annotation is enforced here via
 * Spring Security — all endpoints require a valid JWT, and specific endpoints
 * additionally require roles:
 * <ul>
 *   <li>GET    /api/orders/{id}              – any authenticated user</li>
 *   <li>GET    /api/orders/customer/{email}  – any authenticated user</li>
 *   <li>POST   /api/orders                   – any authenticated user</li>
 *   <li>PATCH  /api/orders/{id}/status       – Admin / Fulfilment roles only</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/orders")
@PreAuthorize("isAuthenticated()")
@Tag(name = "Orders", description = "Endpoints for placing and managing orders")
public class OrdersController {

    private final OrderService orderService;

    /**
     * Constructs the controller with its required service.
     *
     * @param orderService the order business-logic service
     */
    public OrdersController(OrderService orderService) {
        this.orderService = orderService;
    }

    // ── GET /api/orders/{id} ─────────────────────────────────────────────────

    /**
     * Retrieves a single order by primary key.
     * Mirrors: {@code [HttpGet("{id:int}")] Get(int id)}
     *
     * @param id the order's primary key
     * @return 200 with the order, or 404 via exception handler
     */
    @GetMapping("/{id}")
    @Operation(
        summary = "Get an order",
        security = @SecurityRequirement(name = "bearerAuth"),
        responses = {
            @ApiResponse(responseCode = "200", description = "Order found"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "404", description = "Order not found",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
        }
    )
    public ResponseEntity<OrderResponse> get(
            @Parameter(description = "Order identifier", example = "7")
            @PathVariable Long id) {
        return ResponseEntity.ok(orderService.getOrder(id));
    }

    // ── GET /api/orders/customer/{email} ─────────────────────────────────────

    /**
     * Returns all orders placed by a given customer, newest first.
     * Mirrors: {@code [HttpGet("customer/{email}")] ListForCustomer(string email)}
     *
     * @param email the customer's e-mail address
     * @return 200 with a (possibly empty) list of orders
     */
    @GetMapping("/customer/{email}")
    @Operation(
        summary = "List orders for a customer",
        security = @SecurityRequirement(name = "bearerAuth"),
        responses = {
            @ApiResponse(responseCode = "200", description = "OK"),
            @ApiResponse(responseCode = "401", description = "Authentication required")
        }
    )
    public ResponseEntity<List<OrderResponse>> listForCustomer(
            @Parameter(description = "Customer e-mail address", example = "alice@example.com")
            @PathVariable String email) {
        return ResponseEntity.ok(orderService.listOrdersForCustomer(email));
    }

    // ── POST /api/orders ─────────────────────────────────────────────────────

    /**
     * Places a new order.
     * Mirrors: {@code [HttpPost] Place([FromBody] PlaceOrderRequest req)}
     *
     * <p>The legacy controller wrapped the service call in a try-catch
     * for {@code InvalidOperationException} and returned 400. That pattern is
     * replaced here by {@link com.example.outputfolder.exception.BusinessException},
     * which {@link com.example.outputfolder.exception.GlobalExceptionHandler} maps to 400.
     *
     * @param request validated order payload
     * @return 201 Created with Location header and the new order in the body
     */
    @PostMapping
    @Operation(
        summary = "Place a new order",
        security = @SecurityRequirement(name = "bearerAuth"),
        responses = {
            @ApiResponse(responseCode = "201", description = "Order placed",
                headers = @Header(name = "Location", description = "URL of the created order")),
            @ApiResponse(responseCode = "400", description = "Validation failed or insufficient stock",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class))),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "404", description = "Product not found",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
        }
    )
    public ResponseEntity<OrderResponse> place(@Valid @RequestBody PlaceOrderRequest request) {
        OrderResponse order = orderService.placeOrder(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(order.id())
                .toUri();
        return ResponseEntity.created(location).body(order);
    }

    // ── PATCH /api/orders/{id}/status ────────────────────────────────────────

    /**
     * Transitions an existing order to a new status.
     * Mirrors: {@code [HttpPatch("{id:int}/status")][Authorize(Roles = "Admin,Fulfilment")] UpdateStatus(int id, [FromBody] OrderStatus status)}
     *
     * @param id      the order's primary key
     * @param request DTO carrying the new status value
     * @return 200 with the updated order, or 404 via exception handler
     */
    @PatchMapping("/{id}/status")
    @PreAuthorize("hasAnyRole('Admin','Fulfilment')")
    @Operation(
        summary = "Update order status",
        security = @SecurityRequirement(name = "bearerAuth"),
        responses = {
            @ApiResponse(responseCode = "200", description = "Status updated"),
            @ApiResponse(responseCode = "400", description = "Validation failed",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class))),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Insufficient role"),
            @ApiResponse(responseCode = "404", description = "Order not found",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
        }
    )
    public ResponseEntity<OrderResponse> updateStatus(
            @Parameter(description = "Order identifier", example = "7")
            @PathVariable Long id,
            @Valid @RequestBody UpdateOrderStatusRequest request) {
        return ResponseEntity.ok(orderService.updateOrderStatus(id, request.status()));
    }
}
