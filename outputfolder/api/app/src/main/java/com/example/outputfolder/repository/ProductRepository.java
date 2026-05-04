package com.example.outputfolder.repository;

import com.example.outputfolder.domain.Product;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

/**
 * Spring Data JPA repository for {@link Product} entities.
 *
 * <p>Replaces the Entity Framework {@code DbSet<Product>} queries from
 * {@code ContosoStore.Api/Data/StoreDbContext.cs}, using derived-query
 * method names rather than raw JPQL where possible.
 *
 * <p>All queries filter on {@code isActive = true} to honour the
 * soft-delete pattern used throughout the legacy application.
 */
@Repository
public interface ProductRepository extends JpaRepository<Product, Long> {

    /**
     * Returns a page of all active products ordered by creation date descending.
     *
     * <p>Used when no category filter is specified. Mirrors:
     * <pre>{@code
     *   _db.Products.AsQueryable()
     *       .Where(p => p.IsActive)
     *       .OrderByDescending(p => p.CreatedAt)
     *       .Skip(...).Take(...);
     * }</pre>
     *
     * @param pageable pagination and sort descriptor
     * @return page of active products
     */
    Page<Product> findByIsActiveTrueOrderByCreatedAtDesc(Pageable pageable);

    /**
     * Returns a page of active products filtered by category (case-insensitive),
     * ordered by creation date descending.
     *
     * <p>Mirrors: {@code .Where(p => p.IsActive && p.Category == category)}
     *
     * @param category category to filter by (compared case-insensitively)
     * @param pageable pagination and sort descriptor
     * @return page of matching active products
     */
    Page<Product> findByIsActiveTrueAndCategoryIgnoreCaseOrderByCreatedAtDesc(String category, Pageable pageable);

    /**
     * Finds a single active product by its primary key.
     *
     * <p>Mirrors:
     * <pre>{@code
     *   _db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsActive);
     * }</pre>
     *
     * @param id       the product's primary key
     * @return an {@link Optional} containing the product, or empty if not found or inactive
     */
    Optional<Product> findByIdAndIsActiveTrue(Long id);
}
