package com.example.outputfolder.controller;

import com.example.outputfolder.dto.ProductRequest;
import com.example.outputfolder.dto.ProductResponse;
import com.example.outputfolder.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.headers.Header;
import io.swagger.v3.oas.annotations.media.Content;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Pageable;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.validation.annotation.Validated;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;

import java.net.URI;

/**
 * REST controller for the product catalogue.
 *
 * <p>Preserves the exact route shape of the legacy .NET
 * {@code ContosoStore.Api.Controllers.ProductsController}:
 * <ul>
 *   <li>GET    /api/products           – list active products (paginated)</li>
 *   <li>GET    /api/products/{id}      – get single product</li>
 *   <li>POST   /api/products           – create product (Admin / ProductManager)</li>
 *   <li>PUT    /api/products/{id}      – update product (Admin / ProductManager)</li>
 *   <li>DELETE /api/products/{id}      – soft-delete product (Admin)</li>
 * </ul>
 */
@RestController
@RequestMapping("/api/products")
@Validated
@Tag(name = "Products", description = "Endpoints for managing the product catalogue")
public class ProductsController {

    private final ProductService productService;

    /**
     * Constructs the controller with its required service.
     *
     * @param productService the product business-logic service
     */
    public ProductsController(ProductService productService) {
        this.productService = productService;
    }

    // ── GET /api/products ────────────────────────────────────────────────────

    /**
     * Returns a paginated list of active products.
     * Mirrors: {@code [HttpGet] List([FromQuery] string? category, int page = 1, int size = 20)}
     *
     * @param category optional category filter (case-insensitive); omit for all categories
     * @param page     1-based page number (default 1, mirrors the legacy .NET default)
     * @param size     items per page (default 20, max 100)
     * @return page of {@link ProductResponse} DTOs
     */
    @GetMapping
    @Operation(
        summary = "List active products",
        description = "Returns a paginated, optionally category-filtered list of active products.",
        responses = {
            @ApiResponse(responseCode = "200", description = "OK"),
            @ApiResponse(responseCode = "400", description = "Invalid pagination parameters",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
        }
    )
    public ResponseEntity<Page<ProductResponse>> list(
            @Parameter(description = "Optional category filter", example = "WIDGETS")
            @RequestParam(required = false) String category,

            @Parameter(description = "1-based page number", example = "1")
            @RequestParam(defaultValue = "1") @Min(1) int page,

            @Parameter(description = "Items per page (max 100)", example = "20")
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {

        // Convert 1-based .NET page param to 0-based Spring Pageable
        Pageable pageable = PageRequest.of(page - 1, size);
        return ResponseEntity.ok(productService.listProducts(category, pageable));
    }

    // ── GET /api/products/{id} ───────────────────────────────────────────────

    /**
     * Returns a single active product by primary key.
     * Mirrors: {@code [HttpGet("{id:int}")] Get(int id)}
     *
     * @param id the product's primary key
     * @return 200 with the product, or 404 via {@link com.example.outputfolder.exception.GlobalExceptionHandler}
     */
    @GetMapping("/{id}")
    @Operation(
        summary = "Get a product",
        responses = {
            @ApiResponse(responseCode = "200", description = "Product found"),
            @ApiResponse(responseCode = "404", description = "Product not found",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
        }
    )
    public ResponseEntity<ProductResponse> get(
            @Parameter(description = "Product identifier", example = "42")
            @PathVariable Long id) {
        return ResponseEntity.ok(productService.getProduct(id));
    }

    // ── POST /api/products ───────────────────────────────────────────────────

    /**
     * Creates a new product.
     * Mirrors: {@code [HttpPost][Authorize(Roles = "Admin,ProductManager")] Create([FromBody] Product p)}
     *
     * @param request validated product creation payload
     * @return 201 Created with Location header and body of the created product
     */
    @PostMapping
    @PreAuthorize("hasAnyRole('Admin','ProductManager')")
    @Operation(
        summary = "Create a product",
        security = @SecurityRequirement(name = "bearerAuth"),
        responses = {
            @ApiResponse(responseCode = "201", description = "Product created",
                headers = @Header(name = "Location", description = "URL of the created product")),
            @ApiResponse(responseCode = "400", description = "Validation failed",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class))),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Insufficient role")
        }
    )
    public ResponseEntity<ProductResponse> create(@Valid @RequestBody ProductRequest request) {
        ProductResponse created = productService.createProduct(request);
        URI location = ServletUriComponentsBuilder.fromCurrentRequest()
                .path("/{id}")
                .buildAndExpand(created.id())
                .toUri();
        return ResponseEntity.created(location).body(created);
    }

    // ── PUT /api/products/{id} ───────────────────────────────────────────────

    /**
     * Replaces the mutable fields of an existing product.
     * Mirrors: {@code [HttpPut("{id:int}")][Authorize(Roles = "Admin,ProductManager")] Update(int id, [FromBody] Product p)}
     *
     * @param id      the product's primary key
     * @param request validated update payload
     * @return 200 with the updated product, or 404 via exception handler
     */
    @PutMapping("/{id}")
    @PreAuthorize("hasAnyRole('Admin','ProductManager')")
    @Operation(
        summary = "Update a product",
        security = @SecurityRequirement(name = "bearerAuth"),
        responses = {
            @ApiResponse(responseCode = "200", description = "Product updated"),
            @ApiResponse(responseCode = "400", description = "Validation failed",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class))),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Insufficient role"),
            @ApiResponse(responseCode = "404", description = "Product not found",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
        }
    )
    public ResponseEntity<ProductResponse> update(
            @Parameter(description = "Product identifier", example = "42")
            @PathVariable Long id,
            @Valid @RequestBody ProductRequest request) {
        return ResponseEntity.ok(productService.updateProduct(id, request));
    }

    // ── DELETE /api/products/{id} ────────────────────────────────────────────

    /**
     * Soft-deletes a product by marking it inactive.
     * Mirrors: {@code [HttpDelete("{id:int}")][Authorize(Roles = "Admin")] Delete(int id)}
     *
     * @param id the product's primary key
     * @return 204 No Content, or 404 via exception handler
     */
    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('Admin')")
    @Operation(
        summary = "Delete (soft) a product",
        security = @SecurityRequirement(name = "bearerAuth"),
        responses = {
            @ApiResponse(responseCode = "204", description = "Product deleted"),
            @ApiResponse(responseCode = "401", description = "Authentication required"),
            @ApiResponse(responseCode = "403", description = "Insufficient role"),
            @ApiResponse(responseCode = "404", description = "Product not found",
                content = @Content(schema = @Schema(implementation = org.springframework.http.ProblemDetail.class)))
        }
    )
    public ResponseEntity<Void> delete(
            @Parameter(description = "Product identifier", example = "42")
            @PathVariable Long id) {
        productService.deleteProduct(id);
        return ResponseEntity.noContent().build();
    }
}
