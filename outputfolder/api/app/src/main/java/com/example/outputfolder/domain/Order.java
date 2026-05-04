package com.example.outputfolder.domain;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

/**
 * JPA entity representing a customer order.
 *
 * <p>Mirrors {@code ContosoStore.Api.Models.Order} (C#), replacing:
 * <ul>
 *   <li>{@code DateTime} → {@link Instant} (UTC throughout)</li>
 *   <li>{@code decimal} → {@link BigDecimal} (scale 2 at DB level)</li>
 *   <li>{@code OrderStatus} enum persisted as {@link String} (avoids ordinal coupling)</li>
 *   <li>EF navigation property {@code Items} → JPA {@code @OneToMany} with {@code CascadeType.ALL}</li>
 * </ul>
 *
 * <p>{@code placedAt} is set by {@code @PrePersist} to mirror
 * {@code public DateTime PlacedAt { get; set; } = DateTime.UtcNow;}.
 */
@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** Customer's e-mail address. Mirrors {@code [Required] string CustomerEmail}. */
    @Column(name = "customer_email", nullable = false, length = 254)
    private String customerEmail;

    /** UTC timestamp when the order was placed. */
    @Column(name = "placed_at", nullable = false, updatable = false)
    private Instant placedAt;

    /**
     * Current lifecycle status.
     * Stored as a VARCHAR so human-readable and resistant to enum reordering.
     */
    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private OrderStatus status = OrderStatus.PENDING;

    /**
     * Sum of all line totals (unit price × quantity).
     * Precision 12 / scale 2 to accommodate large orders.
     */
    @Column(name = "total_amount", nullable = false, precision = 12, scale = 2)
    private BigDecimal totalAmount = BigDecimal.ZERO;

    /**
     * Line items belonging to this order.
     * Cascade ALL so items are persisted / removed with the parent order.
     * {@code orphanRemoval = true} mirrors EF Core's default owned-collection behaviour.
     */
    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.LAZY)
    private List<OrderItem> items = new ArrayList<>();

    /**
     * Sets {@link #placedAt} to the current UTC time before initial persistence.
     */
    @PrePersist
    void onPrePersist() {
        placedAt = Instant.now();
    }

    // ── Getters & setters ────────────────────────────────────────────────────

    /** @return primary key */
    public Long getId() { return id; }

    /** @param id primary key (set by JPA) */
    public void setId(Long id) { this.id = id; }

    /** @return customer e-mail */
    public String getCustomerEmail() { return customerEmail; }

    /** @param customerEmail customer e-mail */
    public void setCustomerEmail(String customerEmail) { this.customerEmail = customerEmail; }

    /** @return UTC timestamp when the order was placed */
    public Instant getPlacedAt() { return placedAt; }

    /** @return current lifecycle status */
    public OrderStatus getStatus() { return status; }

    /** @param status new lifecycle status */
    public void setStatus(OrderStatus status) { this.status = status; }

    /** @return total order amount */
    public BigDecimal getTotalAmount() { return totalAmount; }

    /** @param totalAmount computed total amount */
    public void setTotalAmount(BigDecimal totalAmount) { this.totalAmount = totalAmount; }

    /** @return mutable list of order line items */
    public List<OrderItem> getItems() { return items; }

    /** @param items list of line items (replaces existing list) */
    public void setItems(List<OrderItem> items) { this.items = items; }
}
