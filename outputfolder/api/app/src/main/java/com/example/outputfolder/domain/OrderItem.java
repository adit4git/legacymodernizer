package com.example.outputfolder.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;

/**
 * JPA entity representing a single line item within an {@link Order}.
 *
 * <p>Mirrors {@code ContosoStore.Api.Models.OrderItem} (C#), with:
 * <ul>
 *   <li>{@code decimal UnitPrice} → {@link BigDecimal} (scale 2)</li>
 *   <li>{@code int OrderId} navigation replaced by JPA {@code @ManyToOne} back-reference</li>
 * </ul>
 *
 * <p>The unit price is captured at order-placement time so that subsequent
 * product-price changes do not retroactively alter order totals.
 */
@Entity
@Table(name = "order_items")
public class OrderItem {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /**
     * Parent order. Required — order items cannot exist without a parent.
     * {@code insertable = false, updatable = false} on the FK column lets
     * {@link Order#items} manage the relationship.
     */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "order_id", nullable = false)
    private Order order;

    /** Foreign key to the product that was ordered. */
    @Column(name = "product_id", nullable = false)
    private Long productId;

    /** Number of units ordered. Must be ≥ 1. */
    @Column(name = "quantity", nullable = false)
    private int quantity;

    /**
     * Unit price captured at the time of order placement.
     * Mirrors {@code decimal UnitPrice} in the legacy model.
     */
    @Column(name = "unit_price", nullable = false, precision = 10, scale = 2)
    private BigDecimal unitPrice;

    // ── Getters & setters ────────────────────────────────────────────────────

    /** @return primary key */
    public Long getId() { return id; }

    /** @param id primary key (set by JPA) */
    public void setId(Long id) { this.id = id; }

    /** @return parent {@link Order} */
    public Order getOrder() { return order; }

    /** @param order parent order */
    public void setOrder(Order order) { this.order = order; }

    /** @return product identifier */
    public Long getProductId() { return productId; }

    /** @param productId product identifier */
    public void setProductId(Long productId) { this.productId = productId; }

    /** @return quantity ordered */
    public int getQuantity() { return quantity; }

    /** @param quantity quantity ordered */
    public void setQuantity(int quantity) { this.quantity = quantity; }

    /** @return unit price at time of order */
    public BigDecimal getUnitPrice() { return unitPrice; }

    /** @param unitPrice unit price at time of order */
    public void setUnitPrice(BigDecimal unitPrice) { this.unitPrice = unitPrice; }
}
