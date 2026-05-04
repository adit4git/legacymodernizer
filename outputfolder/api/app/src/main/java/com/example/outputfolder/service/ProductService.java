package com.example.outputfolder.service;

import com.example.outputfolder.dto.ProductRequest;
import com.example.outputfolder.dto.ProductResponse;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;

/**
 * Business-logic contract for product catalogue operations.
 * Mirrors {@code IProductService} from {@code ContosoStore.Api/Services/ProductService.cs}.
 */
public interface ProductService {

    /**
     * Returns a page of active products, optionally filtered by category.
     *
     * @param category optional category filter; {@code null} or blank means all categories
     * @param pageable Spring pagination and sort descriptor
     * @return page of matching {@link ProductResponse} DTOs
     */
    Page<ProductResponse> listProducts(String category, Pageable pageable);

    /**
     * Retrieves a single active product by its identifier.
     *
     * @param id the product's primary key
     * @return the product DTO
     * @throws com.example.outputfolder.exception.ResourceNotFoundException if not found or inactive
     */
    ProductResponse getProduct(Long id);

    /**
     * Creates a new product and persists it.
     *
     * @param request validated creation payload
     * @return the persisted product DTO (including generated {@code id} and {@code createdAt})
     */
    ProductResponse createProduct(ProductRequest request);

    /**
     * Replaces the mutable fields of an existing product.
     *
     * @param id      the product's primary key
     * @param request validated update payload
     * @return the updated product DTO
     * @throws com.example.outputfolder.exception.ResourceNotFoundException if not found
     */
    ProductResponse updateProduct(Long id, ProductRequest request);

    /**
     * Soft-deletes a product by marking it inactive.
     *
     * @param id the product's primary key
     * @throws com.example.outputfolder.exception.ResourceNotFoundException if not found
     */
    void deleteProduct(Long id);
}
