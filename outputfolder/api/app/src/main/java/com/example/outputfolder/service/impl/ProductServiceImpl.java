package com.example.outputfolder.service.impl;

import com.example.outputfolder.domain.Product;
import com.example.outputfolder.dto.ProductRequest;
import com.example.outputfolder.dto.ProductResponse;
import com.example.outputfolder.exception.ResourceNotFoundException;
import com.example.outputfolder.mapper.ProductMapper;
import com.example.outputfolder.repository.ProductRepository;
import com.example.outputfolder.service.ProductService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Default implementation of {@link ProductService}.
 * Ports {@code ProductService.cs} from ContosoStore.Api line-by-line, replacing
 * EF Core with Spring Data JPA and soft-delete via {@code isActive}.
 */
@Service
@Transactional(readOnly = true)
public class ProductServiceImpl implements ProductService {

    private static final Logger log = LoggerFactory.getLogger(ProductServiceImpl.class);

    private final ProductRepository productRepository;
    private final ProductMapper productMapper;

    /**
     * Constructs the service with its required collaborators.
     *
     * @param productRepository Spring Data JPA repository for products
     * @param productMapper     MapStruct mapper for entity ↔ DTO conversion
     */
    public ProductServiceImpl(ProductRepository productRepository, ProductMapper productMapper) {
        this.productRepository = productRepository;
        this.productMapper = productMapper;
    }

    /**
     * {@inheritDoc}
     *
     * <p>Mirrors:
     * <pre>{@code
     *   var q = _db.Products.AsQueryable().Where(p => p.IsActive);
     *   if (!string.IsNullOrWhiteSpace(category)) q = q.Where(p => p.Category == category);
     *   return await q.OrderByDescending(p => p.CreatedAt).Skip(...).Take(...).ToListAsync();
     * }</pre>
     */
    @Override
    public Page<ProductResponse> listProducts(String category, Pageable pageable) {
        log.debug("Listing products – category='{}', pageable={}", category, pageable);
        Page<Product> page = (category != null && !category.isBlank())
                ? productRepository.findByIsActiveTrueAndCategoryIgnoreCaseOrderByCreatedAtDesc(category, pageable)
                : productRepository.findByIsActiveTrueOrderByCreatedAtDesc(pageable);
        return page.map(productMapper::toResponse);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Mirrors:
     * <pre>{@code
     *   _db.Products.FirstOrDefaultAsync(p => p.Id == id && p.IsActive);
     * }</pre>
     */
    @Override
    public ProductResponse getProduct(Long id) {
        log.debug("Fetching product id={}", id);
        Product product = productRepository.findByIdAndIsActiveTrue(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product", id));
        return productMapper.toResponse(product);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Mirrors:
     * <pre>{@code
     *   p.CreatedAt = DateTime.UtcNow;
     *   _db.Products.Add(p);
     *   await _db.SaveChangesAsync();
     * }</pre>
     * {@code createdAt} is set via the JPA {@code @PrePersist} hook on the entity.
     */
    @Override
    @Transactional
    public ProductResponse createProduct(ProductRequest request) {
        log.info("Creating product name='{}'", request.name());
        Product entity = productMapper.toEntity(request);
        Product saved = productRepository.save(entity);
        log.debug("Product created id={}", saved.getId());
        return productMapper.toResponse(saved);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Mirrors:
     * <pre>{@code
     *   existing.Name = p.Name;
     *   existing.Description = p.Description;
     *   existing.Price = p.Price;
     *   existing.StockQuantity = p.StockQuantity;
     *   existing.Category = p.Category;
     *   existing.UpdatedAt = DateTime.UtcNow;
     *   await _db.SaveChangesAsync();
     * }</pre>
     * {@code updatedAt} is set via the JPA {@code @PreUpdate} hook on the entity.
     */
    @Override
    @Transactional
    public ProductResponse updateProduct(Long id, ProductRequest request) {
        log.info("Updating product id={}", id);
        Product existing = productRepository.findByIdAndIsActiveTrue(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product", id));
        productMapper.updateEntity(request, existing);
        Product saved = productRepository.save(existing);
        return productMapper.toResponse(saved);
    }

    /**
     * {@inheritDoc}
     *
     * <p>Mirrors the soft-delete pattern:
     * <pre>{@code
     *   existing.IsActive = false;
     *   existing.UpdatedAt = DateTime.UtcNow;
     *   await _db.SaveChangesAsync();
     * }</pre>
     */
    @Override
    @Transactional
    public void deleteProduct(Long id) {
        log.info("Soft-deleting product id={}", id);
        Product existing = productRepository.findByIdAndIsActiveTrue(id)
                .orElseThrow(() -> new ResourceNotFoundException("Product", id));
        existing.setActive(false);
        productRepository.save(existing);
    }
}
