package com.example.outputfolder.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;

/**
 * JPA entity representing a product in the catalogue.
 *
 * <p>Mirrors {@code ContosoStore.Api.Models.Product} (C#), replacing:
 * <ul>
 *   <li>{@code DateTime} → {@link Instant} (UTC throughout)</li>
 *   <li>{@code decimal} → {@link BigDecimal} (scale 2 enforced at DB level)</li>
 *   <li>{@code bool IsActive} → {@code boolean isActive} (soft-delete flag)</li>
 *   <li>EF auto-timestamps → {@code @PrePersist} / {@code @PreUpdate} hooks</li>
 * </ul>
 *
 * <p>The column {@code is_active} defaults to {@code true} to match legacy behaviour.
 */
@Entity
@Table(name = "products")
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Display name of the product. Max 120 characters (legacy [StringLength(120)]). */
    @Column(name = "name", nullable = false, length = 120)
    private String name;

    /** Optional long-form description. Max 2 000 characters. */
    @Column(name = "description", length = 2000)
    private String description;

    /**
     * Unit price in USD.
     * Precision 10 / scale 2 mirrors the SQL {@code decimal(10,2)} used in the legacy EF schema.
     */
    @Column(name = "price", nullable = false, precision = 10, scale = 2)
    private BigDecimal price;

    /** Available stock quantity. Non-negative in normal operation. */
    @Column(name = "stock_quantity", nullable = false)
    private int stockQuantity;

    /** Product category string. Defaults to "GENERAL" (mirrors legacy default). */
    @Column(name = "category", nullable = false, length = 60)
    private String category = "GENERAL";

    /** UTC timestamp when the record was first persisted. */
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    /** UTC timestamp of the most recent update. Null until first update. */
    @Column(name = "updated_at")
    private Instant updatedAt;

    /** Soft-delete flag. {@code false} hides the product from queries. */
    @Column(name = "is_active", nullable = false)
    private boolean isActive = true;

    /**
     * Sets {@link #createdAt} to the current UTC time before initial persistence.
     * Mirrors {@code public DateTime CreatedAt { get; set; } = DateTime.UtcNow;} in legacy C#.
     */
    @PrePersist
    void onPrePersist() {
        createdAt = Instant.now();
    }

    /**
     * Updates {@link #updatedAt} to the current UTC time before any subsequent save.
     * Mirrors {@code existing.UpdatedAt = DateTime.UtcNow;} in the legacy service.
     */
    @PreUpdate
    void onPreUpdate() {
        updatedAt = Instant.now();
    }

    // ── Getters & setters ────────────────────────────────────────────────────

    /** @return the primary key */
    public Long getId() { return id; }

    /** @param id primary key (set by JPA) */
    public void setId(Long id) { this.id = id; }

    /** @return display name */
    public String getName() { return name; }

    /** @param name display name */
    public void setName(String name) { this.name = name; }

    /** @return optional description */
    public String getDescription() { return description; }

    /** @param description optional description */
    public void setDescription(String description) { this.description = description; }

    /** @return unit price */
    public BigDecimal getPrice() { return price; }

    /** @param price unit price */
    public void setPrice(BigDecimal price) { this.price = price; }

    /** @return available stock */
    public int getStockQuantity() { return stockQuantity; }

    /** @param stockQuantity available stock */
    public void setStockQuantity(int stockQuantity) { this.stockQuantity = stockQuantity; }

    /** @return category string */
    public String getCategory() { return category; }

    /** @param category category string */
    public void setCategory(String category) { this.category = category; }

    /** @return creation timestamp */
    public Instant getCreatedAt() { return createdAt; }

    /** @return last-update timestamp */
    public Instant getUpdatedAt() { return updatedAt; }

    /** @return {@code true} if the product is active (not soft-deleted) */
    public boolean isActive() { return isActive; }

    /** @param active {@code false} to soft-delete the product */
    public void setActive(boolean active) { this.isActive = active; }
}
